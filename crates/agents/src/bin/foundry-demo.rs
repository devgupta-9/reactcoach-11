use reactcoach_agents::{
    contracts::*,
    evidence::packet,
    provider::{azure_cli_token, FoundryClient},
    workflow::generate,
};
use reactcoach_match_engine::{
    demo_events,
    intelligence::{demo_fixtures, materialize},
    DEMO_MATCH_ID,
};
use serde_json::json;
use std::{
    io::Write,
    path::PathBuf,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

fn option(args: &[String], name: &str) -> Result<String, FailureReason> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .filter(|v| !v.starts_with("--"))
        .cloned()
        .ok_or(FailureReason::UnsupportedConfiguration)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let details = materialize(DEMO_MATCH_ID, &demo_events(), &demo_fixtures())?.details;
    if details.len() != 2 {
        return Err(FailureReason::InvalidEvidence.into());
    }
    let packets: Vec<_> = details.iter().map(packet).collect::<Result<_, _>>()?;
    if args.is_empty() || args == ["--plan"] {
        println!(
            "{}",
            serde_json::to_string_pretty(
                &json!({"mode":"plan","azure_operations":"none","max_model_calls":6,"max_output_tokens":2560,"retries":0,"delivery":"precomputed","packets":packets.iter().map(|p|json!({"insight_id":p.insight_id,"evidence_digest":p.evidence_digest,"packet_bytes":serde_json::to_vec(p).unwrap().len()})).collect::<Vec<_>>()})
            )?
        );
        return Ok(());
    }
    // Paid inference must be explicitly selected. No generation on application startup.
    if args.len() != 8
        || !args.contains(&"--generate".into())
        || !args.contains(&"--allow-paid".into())
    {
        return Err(FailureReason::UnsupportedConfiguration.into());
    }
    let subscription = option(&args, "--subscription")?;
    let az = PathBuf::from(option(&args, "--az")?);
    let out = PathBuf::from(option(&args, "--out")?);
    if out.exists() || !az.is_file() {
        return Err(FailureReason::UnsupportedConfiguration.into());
    }
    let client = FoundryClient::new(azure_cli_token(&az, &subscription).await?)?;
    let mut entries = Vec::new();
    for (index, p) in packets.iter().enumerate() {
        let start = Instant::now();
        let record = generate(&client, p).await;
        println!(
            "{}",
            serde_json::to_string(
                &json!({"insight_id":record.insight_id,"completed":matches!(record.outcome,GenerationOutcome::Generated{..}),"receipts":record.outcome.receipts(),"failure_reason":match record.outcome {GenerationOutcome::Fallback {reason,..}=>Some(reason),_=>None}})
            )?
        );
        entries.push(record);
        // Separate the two three-call workflows for the existing small TPM quota.
        if index + 1 < packets.len() {
            tokio::time::sleep(Duration::from_secs(60).saturating_sub(start.elapsed())).await;
        }
    }
    let success = entries
        .iter()
        .all(|r| matches!(r.outcome, GenerationOutcome::Generated { .. }));
    let artifact = CoachingArtifact {
        schema_version: ARTIFACT_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        deployment: DEPLOYMENT.into(),
        generated_at_unix_seconds: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
        entries,
    };
    let bytes = serde_json::to_vec_pretty(&artifact)?;
    if bytes.len() > MAX_ARTIFACT_BYTES {
        return Err(FailureReason::ResourceLimit.into());
    }
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&out)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    println!(
        "{}",
        serde_json::to_string(
            &json!({"complete":success,"output":out,"entries":artifact.entries.len()})
        )?
    );
    if !success {
        let reason = artifact
            .entries
            .iter()
            .find_map(|record| match &record.outcome {
                GenerationOutcome::Fallback { reason, .. } => Some(*reason),
                _ => None,
            })
            .unwrap_or(FailureReason::ArtifactRejected);
        return Err(reason.into());
    }
    Ok(())
}
