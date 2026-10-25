use super::*;
use axum::{
    body::{to_bytes, Body},
    http::Request,
};
use tower::ServiceExt;

async fn get(replay: Arc<DemoReplay>, uri: &str) -> (StatusCode, Vec<u8>) {
    let response = router(replay)
        .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let body = to_bytes(response.into_body(), MAX_DETAIL_BYTES + 1)
        .await
        .unwrap()
        .to_vec();
    (status, body)
}

#[tokio::test]
async fn both_coaching_endpoints_are_stable_source_linked_and_additive() {
    let replay = Arc::new(DemoReplay::build().unwrap());
    for insight in &replay.insights {
        let path = format!("/api/v1/matches/demo/insights/{}", insight.insight_id);
        let (status, detail) = get(replay.clone(), &path).await;
        assert_eq!(status, StatusCode::OK);
        let detail: serde_json::Value = serde_json::from_slice(&detail).unwrap();
        let (status, first) = get(replay.clone(), &format!("{path}/coaching")).await;
        assert_eq!(status, StatusCode::OK);
        let (_, second) = get(replay.clone(), &format!("{path}/coaching")).await;
        assert_eq!(first, second);
        let coaching: serde_json::Value = serde_json::from_slice(&first).unwrap();
        assert_eq!(coaching, detail["coaching"]);
        assert_eq!(coaching["insight_id"], insight.insight_id);
        assert_eq!(coaching["schema_version"], "coaching_v1");
        assert_eq!(coaching["delivery"], "precomputed");
        assert!(first.len() < 32 * 1024);
        assert_eq!(
            coaching["source_event_ids"],
            serde_json::to_value(&insight.source_event_ids).unwrap()
        );
        assert!(
            detail["simulation"]["baseline"]["steps"]
                .as_array()
                .unwrap()
                .len()
                > 1
        );
    }
}

#[tokio::test]
async fn coaching_preserves_timestamp_identifier_and_query_errors() {
    let replay = Arc::new(DemoReplay::build().unwrap());
    let id = &replay.insights[0].insight_id;
    for (uri, expected) in [
        (
            format!("/api/v1/matches/demo/insights/{id}/coaching?at=111"),
            StatusCode::NOT_FOUND,
        ),
        (
            format!("/api/v1/matches/demo/insights/{id}/coaching?at=112"),
            StatusCode::OK,
        ),
        (
            format!("/api/v1/matches/demo/insights/{id}/coaching?at=421"),
            StatusCode::BAD_REQUEST,
        ),
        (
            format!("/api/v1/matches/demo/insights/{id}/coaching?extra=1"),
            StatusCode::BAD_REQUEST,
        ),
        (
            "/api/v1/matches/demo/insights/missing/coaching".into(),
            StatusCode::NOT_FOUND,
        ),
        (
            "/api/v1/matches/demo/insights/bad%24id/coaching".into(),
            StatusCode::BAD_REQUEST,
        ),
    ] {
        assert_eq!(get(replay.clone(), &uri).await.0, expected);
    }
}

#[tokio::test]
async fn bad_artifacts_fall_back_without_losing_simulation_evidence() {
    let replay = Arc::new(DemoReplay::build_with_artifact("{malformed").unwrap());
    let id = &replay.insights[0].insight_id;
    let (status, bytes) = get(
        replay.clone(),
        &format!("/api/v1/matches/demo/insights/{id}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let detail: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(detail["coaching"]["mode"], "deterministic_fallback");
    assert_eq!(detail["coaching"]["fallback_reason"], "artifact_rejected");
    assert!(detail["coaching"]["receipts"]
        .as_array()
        .unwrap()
        .is_empty());
    assert!(detail["simulation"]["baseline"]["steps"].is_array());
}

#[tokio::test]
async fn there_is_no_public_paid_generation_operation() {
    let replay = Arc::new(DemoReplay::build().unwrap());
    let uri = format!(
        "/api/v1/matches/demo/insights/{}/coaching",
        replay.insights[0].insight_id
    );
    let response = router(replay)
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
}
