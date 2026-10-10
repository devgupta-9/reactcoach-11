use std::sync::Arc;

mod intelligence;
mod simulations;

use axum::{
    extract::{DefaultBodyLimit, Query},
    http::{header, HeaderValue, Method, StatusCode},
    routing::{get, post},
    Json, Router,
};
use reactcoach_decision_engine::{
    evaluate, evaluate_demo,
    offside::{assess_position, OffsideAssessment, OffsideFrame},
    MatchupReport, PlayerProfile, ScenarioKind,
};
use reactcoach_match_engine::{demo_events, snapshot_at};
use reactcoach_shared::{MatchEvent, MatchSnapshot};
use serde::{Deserialize, Serialize};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::EnvFilter;

const DEMO_MATCH_ID: &str = "demo-match-001";
const DEMO_DURATION_SECONDS: u32 = 420;

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "reactcoach-api",
    })
}

async fn events() -> Json<Vec<MatchEvent>> {
    Json(demo_events())
}

#[derive(Deserialize)]
struct SnapshotQuery {
    at: Option<u32>,
}

async fn snapshot(
    Query(query): Query<SnapshotQuery>,
) -> Result<Json<MatchSnapshot>, (StatusCode, &'static str)> {
    let at = query
        .at
        .unwrap_or(DEMO_DURATION_SECONDS)
        .min(DEMO_DURATION_SECONDS);
    snapshot_at(DEMO_MATCH_ID, &demo_events(), at)
        .map(Json)
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "demo data validation failed",
            )
        })
}

#[derive(Deserialize)]
struct DecisionQuery {
    scenario: Option<String>,
}

async fn decision_demo(
    Query(query): Query<DecisionQuery>,
) -> Result<Json<MatchupReport>, (StatusCode, &'static str)> {
    let scenario = match query.scenario.as_deref().unwrap_or("open_play") {
        "open_play" => ScenarioKind::OpenPlay,
        "penalty" => ScenarioKind::Penalty,
        "free_kick" => ScenarioKind::FreeKick,
        _ => return Err((StatusCode::BAD_REQUEST, "unsupported scenario")),
    };
    Ok(Json(evaluate_demo(scenario)))
}

#[derive(Serialize)]
struct OffsideDemo {
    original: OffsideAssessment,
    corrected: OffsideAssessment,
    correction: &'static str,
}

async fn offside_demo() -> Json<OffsideDemo> {
    let original = assess_position(OffsideFrame {
        attacker_forward_edge: 79.0,
        ball_forward_edge: 65.0,
        second_last_opponent_forward_edge: 74.0,
    })
    .expect("valid demo frame");
    let corrected = assess_position(OffsideFrame {
        attacker_forward_edge: 73.0,
        ball_forward_edge: 65.0,
        second_last_opponent_forward_edge: 74.0,
    })
    .expect("valid demo frame");
    Json(OffsideDemo {
        original,
        corrected,
        correction: "At the same synthetic pass instant, delay the attacking run so the relevant body edge stays level with or behind the second-last opponent. This demonstrates position only, not a complete Law 11 offence decision.",
    })
}

#[derive(Deserialize)]
struct EvaluationInput {
    scenario: ScenarioKind,
    assessed_player: PlayerProfile,
    opponent: PlayerProfile,
}

async fn custom_evaluation(
    Json(mut input): Json<EvaluationInput>,
) -> Result<Json<MatchupReport>, (StatusCode, &'static str)> {
    // Public demo input is always treated as synthetic, even if a client
    // attempts to submit a named profile claiming to be verified scouting data.
    input.assessed_player.synthetic = true;
    input.opponent.synthetic = true;
    evaluate(input.scenario, input.assessed_player, input.opponent)
        .map(Json)
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid synthetic player ratings"))
}

fn app_with_replay(replay: Arc<intelligence::DemoReplay>) -> Router {
    let origin = std::env::var("WEB_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into());
    let origin: HeaderValue = origin
        .parse()
        .expect("WEB_ORIGIN must be a valid header value");
    let cors = CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE]);

    Router::new()
        .merge(simulations::router())
        .merge(intelligence::router(replay))
        .route("/api/v1/health", get(health))
        .route("/api/v1/matches/demo/events", get(events))
        .route("/api/v1/matches/demo/snapshot", get(snapshot))
        .route("/api/v1/decision-lab/demo", get(decision_demo))
        .route("/api/v1/decision-lab/evaluate", post(custom_evaluation))
        .route("/api/v1/offside/demo", get(offside_demo))
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

#[cfg(test)]
fn app() -> Router {
    app_with_replay(Arc::new(intelligence::DemoReplay::build().unwrap()))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();
    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);
    let replay = tokio::task::spawn_blocking(intelligence::DemoReplay::build)
        .await
        .expect("materialization worker")
        .expect("valid fictional scenario registry");
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("bind API port");
    tracing::info!(port, "ReactCoach 11 API listening");
    axum::serve(listener, app_with_replay(Arc::new(replay)))
        .await
        .expect("serve HTTP");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;

    #[tokio::test]
    async fn matchup_demo_recommends_an_action_correction() {
        let response = app()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/decision-lab/demo?scenario=open_play")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["recommended_action_id"], "accelerate_wide");
        assert_eq!(json["assessed_player"]["synthetic"], true);
    }

    #[tokio::test]
    async fn unsupported_scenario_returns_bad_request() {
        let response = app()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/decision-lab/demo?scenario=unsupported")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn offside_demo_distinguishes_early_and_corrected_run() {
        let response = app()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/offside/demo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["original"]["position"], "offside_position");
        assert_eq!(json["corrected"]["position"], "onside_position");
    }

    #[tokio::test]
    async fn edited_strengths_can_change_recommended_action() {
        use reactcoach_decision_engine::demo_profiles;
        let (mut assessed, opponent) = demo_profiles(ScenarioKind::OpenPlay);
        assessed.traits.acceleration = 5;
        assessed.traits.technique = 100;
        assessed.traits.composure = 100;
        assessed.traits.passing = 5;
        let json = serde_json::json!({
            "scenario": "open_play",
            "assessed_player": assessed,
            "opponent": opponent
        });
        let response = app()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/decision-lab/evaluate")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(json.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        let report: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(report["recommended_action_id"], "direct_dribble");
    }

    #[tokio::test]
    async fn edited_out_of_range_ratings_are_rejected() {
        use reactcoach_decision_engine::demo_profiles;
        let (mut assessed, opponent) = demo_profiles(ScenarioKind::Penalty);
        assessed.traits.acceleration = 120;
        let payload = serde_json::json!({
            "scenario": "penalty", "assessed_player": assessed, "opponent": opponent
        });
        let response = app()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/decision-lab/evaluate")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn health_is_200() {
        let response = app()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn snapshot_contains_one_goal_at_420_seconds() {
        let response = app()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/matches/demo/snapshot?at=420")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(json["score"]["home"], 1);
        assert_eq!(json["events_processed"], 23);
    }
}
