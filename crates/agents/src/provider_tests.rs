use super::*;
use crate::workflow::{model_schema, CoachingModel};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

fn response() -> Value {
    json!({"status":"completed","id":"resp_test","model":"gpt-5-mini-test","output":[{"type":"message","content":[{"type":"output_text","text":"{}"}]}],"usage":{"input_tokens":10,"output_tokens":10,"total_tokens":20}})
}

#[test]
fn parser_rejects_refusal_incomplete_missing_text_and_bad_usage() {
    assert!(parse_response(
        WorkflowRole::Interpreter,
        &serde_json::to_vec(&response()).unwrap()
    )
    .is_ok());
    for case in 0..6 {
        let mut v = response();
        match case {
            0 => v["status"] = json!("incomplete"),
            1 => v["output"][0]["content"][0] = json!({"type":"refusal","refusal":"no"}),
            2 => v["output"] = json!([]),
            3 => v["usage"]["total_tokens"] = json!(999),
            4 => v["output"]
                .as_array_mut()
                .unwrap()
                .push(json!({"type":"function_call"})),
            _ => v["model"] = json!("unexpected-model"),
        }
        assert!(
            parse_response(WorkflowRole::Interpreter, &serde_json::to_vec(&v).unwrap()).is_err()
        );
    }
}

#[test]
fn azure_deployment_alias_is_a_valid_response_model_label() {
    let mut value = response();
    value["model"] = json!(DEPLOYMENT);
    let reply = parse_response(
        WorkflowRole::Interpreter,
        &serde_json::to_vec(&value).unwrap(),
    )
    .unwrap();
    assert_eq!(reply.receipt.model, DEPLOYMENT);
    value["model"] = json!("unapproved-deployment");
    assert!(parse_response(
        WorkflowRole::Interpreter,
        &serde_json::to_vec(&value).unwrap()
    )
    .is_err());
}

async fn server(status: u16, body: String) -> (String, tokio::task::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/responses", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut raw = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            let n = socket.read(&mut buf).await.unwrap();
            if n == 0 {
                break;
            }
            raw.extend_from_slice(&buf[..n]);
            if let Some(end) = raw.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&raw[..end]).to_lowercase();
                let size = head
                    .lines()
                    .find_map(|l| l.strip_prefix("content-length: "))
                    .unwrap()
                    .parse::<usize>()
                    .unwrap();
                if raw.len() >= end + 4 + size {
                    break;
                }
            }
        }
        let head=format!("HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",body.len());
        socket.write_all(head.as_bytes()).await.unwrap();
        let _ = socket.write_all(body.as_bytes()).await;
        String::from_utf8(raw).unwrap()
    });
    (url, handle)
}

fn call() -> ModelCall {
    let d = reactcoach_match_engine::intelligence::materialize(
        reactcoach_match_engine::DEMO_MATCH_ID,
        &reactcoach_match_engine::demo_events(),
        &reactcoach_match_engine::intelligence::demo_fixtures(),
    )
    .unwrap()
    .details
    .remove(0);
    let p = crate::evidence::packet(&d).unwrap();
    ModelCall {
        role: WorkflowRole::Interpreter,
        input: json!({"evidence":p}),
        schema: model_schema(WorkflowRole::Interpreter, &p),
    }
}

#[tokio::test]
async fn request_uses_strict_responses_contract_without_storing_conversations() {
    let (url, handle) = server(200, response().to_string()).await;
    let mut client = FoundryClient::new("local_mock_token_not_a_credential".into()).unwrap();
    client.endpoint = url;
    client.respond(call()).await.unwrap();
    let raw = handle.await.unwrap();
    let body: Value = serde_json::from_str(raw.split_once("\r\n\r\n").unwrap().1).unwrap();
    assert_eq!(body["store"], false);
    assert_eq!(body["stream"], false);
    assert_eq!(body["model"], DEPLOYMENT);
    assert_eq!(body["max_output_tokens"], 256);
    assert_eq!(body["text"]["format"]["type"], "json_schema");
    assert_eq!(body["text"]["format"]["strict"], true);
    assert!(body.get("response_format").is_none());
    assert!(body.get("previous_response_id").is_none());
    assert!(!body.to_string().contains("local_mock_token"));
}

#[tokio::test]
async fn unauthorized_quota_server_errors_redirects_and_oversize_fail_closed() {
    for (status, body, expected) in [
        (
            401,
            "credential-echo-must-not-leak".into(),
            FailureReason::Authentication,
        ),
        (429, "quota".into(), FailureReason::Quota),
        (503, "down".into(), FailureReason::ProviderUnavailable),
        (302, "redirect".into(), FailureReason::ProviderUnavailable),
        (
            200,
            " ".repeat(MAX_MODEL_RESPONSE_BYTES + 1),
            FailureReason::ResourceLimit,
        ),
    ] {
        let (url, handle) = server(status, body).await;
        let mut client = FoundryClient::new("local_mock_token_not_a_credential".into()).unwrap();
        client.endpoint = url;
        assert!(matches!(client.respond(call()).await,Err(e) if e==expected));
        handle.await.unwrap();
    }
}

#[tokio::test]
async fn oversized_request_is_rejected_before_connecting() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client = FoundryClient::new("local_mock_token_not_a_credential".into()).unwrap();
    client.endpoint = format!("http://{}/responses", listener.local_addr().unwrap());
    let mut request = call();
    request.input = json!({"untrusted": "x".repeat(32 * 1024)});
    assert!(matches!(
        client.respond(request).await,
        Err(FailureReason::ResourceLimit)
    ));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(30), listener.accept())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn unresponsive_provider_times_out_without_retry() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut client = FoundryClient::new("local_mock_token_not_a_credential".into()).unwrap();
    client.endpoint = format!("http://{}/responses", listener.local_addr().unwrap());
    // Shorten only the test client's timeout; production retains its 30s deadline.
    client.client = Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_millis(100))
        .build()
        .unwrap();
    let (result, connection) = tokio::join!(client.respond(call()), listener.accept());
    let (_socket, _) = connection.unwrap();
    assert!(matches!(result, Err(FailureReason::ProviderUnavailable)));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(30), listener.accept())
            .await
            .is_err()
    );
}
