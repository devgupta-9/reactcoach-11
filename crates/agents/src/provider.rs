//! Optional administrative transport, never linked into the public API by default.
//! Sources: Microsoft Foundry Responses / structured-outputs / Entra auth docs.
use crate::{
    contracts::*,
    workflow::{
        instructions, validate_receipt, CoachingModel, ModelCall, ModelReply, SYSTEM_PROMPT,
    },
};
use reqwest::{Client, StatusCode};
use serde_json::{json, Value};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{io::AsyncReadExt, process::Command};

pub const RESPONSES_URL: &str =
    "https://reactcoach-foundry-dev.services.ai.azure.com/openai/v1/responses";

// Deliberately no Debug: the token is never formatted, logged or serialized.
pub struct FoundryClient {
    client: Client,
    token: String,
    endpoint: String,
}

pub async fn azure_cli_token(az: &Path, subscription: &str) -> Result<String, FailureReason> {
    if subscription.len() != 36
        || !subscription
            .bytes()
            .all(|b| b.is_ascii_hexdigit() || b == b'-')
    {
        return Err(FailureReason::UnsupportedConfiguration);
    }
    let mut cmd = Command::new(az);
    cmd.args([
        "account",
        "get-access-token",
        "--subscription",
        subscription,
        "--scope",
        "https://ai.azure.com/.default",
        "--output",
        "json",
        "--only-show-errors",
    ])
    .env("AZURE_CORE_COLLECT_TELEMETRY", "false")
    .env("AZURE_CORE_ENABLE_BROKER_ON_WINDOWS", "false")
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .kill_on_drop(true);
    tokio::time::timeout(Duration::from_secs(20), async {
        let mut child = cmd.spawn().map_err(|_| FailureReason::Authentication)?;
        let mut bytes = Vec::new();
        child
            .stdout
            .take()
            .ok_or(FailureReason::Authentication)?
            .take(64 * 1024 + 1)
            .read_to_end(&mut bytes)
            .await
            .map_err(|_| FailureReason::Authentication)?;
        if bytes.len() > 64 * 1024 {
            return Err(FailureReason::ResourceLimit);
        }
        if !child
            .wait()
            .await
            .map_err(|_| FailureReason::Authentication)?
            .success()
        {
            return Err(FailureReason::Authentication);
        }
        let value: Value =
            serde_json::from_slice(&bytes).map_err(|_| FailureReason::Authentication)?;
        let token = value["accessToken"]
            .as_str()
            .ok_or(FailureReason::Authentication)?;
        if token.len() < 20
            || token.len() > 16 * 1024
            || !token.bytes().all(|b| b.is_ascii_graphic())
        {
            return Err(FailureReason::Authentication);
        }
        Ok(token.to_owned())
    })
    .await
    .map_err(|_| FailureReason::Authentication)?
}

impl FoundryClient {
    pub fn new(token: String) -> Result<Self, FailureReason> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .pool_max_idle_per_host(1)
            .build()
            .map_err(|_| FailureReason::UnsupportedConfiguration)?;
        Ok(Self {
            client,
            token,
            endpoint: RESPONSES_URL.into(),
        })
    }

    async fn send(&self, call: ModelCall) -> Result<ModelReply, FailureReason> {
        let role = call.role;
        // Responses uses text.format, not Chat Completions' response_format.
        let body = json!({"model":DEPLOYMENT,"store":false,"stream":false,
            "reasoning":{"effort":"minimal"},"max_output_tokens":role.output_cap(),
            "input":[{"role":"system","content":format!("{SYSTEM_PROMPT}\n{}",instructions(role))},
                     {"role":"user","content":serde_json::to_string(&call.input).map_err(|_|FailureReason::InvalidEvidence)?}],
            "text":{"format":{"type":"json_schema","name":format!("coach_{role:?}_v1"),"strict":true,"schema":call.schema}}});
        let bytes = serde_json::to_vec(&body).map_err(|_| FailureReason::InvalidEvidence)?;
        if bytes.len() > 32 * 1024 {
            return Err(FailureReason::ResourceLimit);
        }
        let mut response = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&self.token)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(bytes)
            .send()
            .await
            .map_err(|_| FailureReason::ProviderUnavailable)?;
        match response.status() {
            StatusCode::OK => {}
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                return Err(FailureReason::Authentication)
            }
            StatusCode::TOO_MANY_REQUESTS => return Err(FailureReason::Quota),
            _ => return Err(FailureReason::ProviderUnavailable),
        }
        if response
            .content_length()
            .is_some_and(|n| n > MAX_MODEL_RESPONSE_BYTES as u64)
        {
            return Err(FailureReason::ResourceLimit);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| FailureReason::ProviderUnavailable)?
        {
            if bytes.len() + chunk.len() > MAX_MODEL_RESPONSE_BYTES {
                return Err(FailureReason::ResourceLimit);
            }
            bytes.extend_from_slice(&chunk);
        }
        parse_response(role, &bytes)
    }
}
impl CoachingModel for FoundryClient {
    async fn respond(&self, call: ModelCall) -> Result<ModelReply, FailureReason> {
        self.send(call).await
    }
}

fn parse_response(role: WorkflowRole, bytes: &[u8]) -> Result<ModelReply, FailureReason> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|_| FailureReason::InvalidModelOutput)?;
    if value["status"] != "completed" {
        return Err(FailureReason::RefusalOrIncomplete);
    }
    let mut texts = Vec::new();
    for item in value["output"]
        .as_array()
        .ok_or(FailureReason::InvalidModelOutput)?
    {
        match item["type"].as_str() {
            Some("reasoning") => {}
            Some("message") => {
                for content in item["content"]
                    .as_array()
                    .ok_or(FailureReason::InvalidModelOutput)?
                {
                    match content["type"].as_str() {
                        Some("output_text") => texts.push(
                            content["text"]
                                .as_str()
                                .ok_or(FailureReason::InvalidModelOutput)?,
                        ),
                        Some("refusal") => return Err(FailureReason::RefusalOrIncomplete),
                        _ => return Err(FailureReason::InvalidModelOutput),
                    }
                }
            }
            _ => return Err(FailureReason::InvalidModelOutput),
        }
    }
    if texts.len() != 1 {
        return Err(FailureReason::InvalidModelOutput);
    }
    let number = |key: &str| {
        value["usage"][key]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .ok_or(FailureReason::InvalidModelOutput)
    };
    let receipt = StageReceipt {
        role,
        response_id: value["id"]
            .as_str()
            .ok_or(FailureReason::InvalidModelOutput)?
            .into(),
        model: value["model"]
            .as_str()
            .ok_or(FailureReason::InvalidModelOutput)?
            .into(),
        input_tokens: number("input_tokens")?,
        output_tokens: number("output_tokens")?,
        total_tokens: number("total_tokens")?,
    };
    validate_receipt(&receipt, role)?;
    Ok(ModelReply {
        payload: texts[0].into(),
        receipt,
    })
}

#[cfg(test)]
#[path = "provider_tests.rs"]
mod tests;
