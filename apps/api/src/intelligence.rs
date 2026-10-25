use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::get,
    Json, Router,
};
use futures_util::{stream, Stream};
use reactcoach_match_engine::{
    demo_events,
    intelligence::{demo_fixtures, materialize, IntelligenceError, TacticalInsight},
    DEMO_DURATION_SECONDS, DEMO_MATCH_ID,
};
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, sync::Arc, time::Duration};

const MAX_DETAIL_BYTES: usize = 512 * 1024;

#[cfg(test)]
#[path = "coaching_tests.rs"]
mod coaching_tests;

#[derive(Clone)]
struct Record {
    timestamp: u32,
    name: &'static str,
    id: String,
    data: String,
    delay: bool,
}

pub struct DemoReplay {
    insights: Vec<TacticalInsight>,
    details: Vec<(String, String)>,
    coachings: Vec<(String, String)>,
    records: Vec<Record>,
}

impl DemoReplay {
    /// Called once on a bounded blocking worker before binding the API, never per subscriber.
    pub fn build() -> Result<Self, IntelligenceError> {
        Self::build_with_artifact(reactcoach_agents::EMBEDDED_ARTIFACT)
    }

    fn build_with_artifact(artifact: &str) -> Result<Self, IntelligenceError> {
        let events = demo_events();
        let catalog = materialize(DEMO_MATCH_ID, &events, &demo_fixtures())?;
        let mut details = Vec::new();
        let mut coachings = Vec::new();
        for detail in &catalog.details {
            #[derive(Serialize)]
            struct WithCoaching<'a> {
                #[serde(flatten)]
                detail: &'a reactcoach_match_engine::intelligence::InsightDetail,
                coaching: &'a reactcoach_agents::contracts::CoachingExplanation,
            }
            let coaching = reactcoach_agents::workflow::resolve(detail, artifact)
                .map_err(|_| IntelligenceError::Fixture("invalid coaching evidence"))?;
            tracing::info!(insight_id = %detail.insight.insight_id, mode = ?coaching.mode,
                explanation_id = %coaching.explanation_id, "Materialized evidence-grounded coaching");
            coachings.push((
                detail.insight.insight_id.clone(),
                serde_json::to_string(&coaching).expect("coaching serializes"),
            ));
            let json = serde_json::to_string(&WithCoaching {
                detail,
                coaching: &coaching,
            })
            .expect("validated integer report serializes");
            if json.len() > MAX_DETAIL_BYTES {
                return Err(IntelligenceError::Limit);
            }
            details.push((detail.insight.insight_id.clone(), json));
        }
        let insights: Vec<_> = catalog.details.into_iter().map(|d| d.insight).collect();
        let mut records = Vec::new();
        for event in events {
            records.push(Record {
                timestamp: event.timestamp_seconds,
                name: "match-event",
                id: format!("demo-v2:event:{}", event.id),
                data: serde_json::to_string(&event).expect("validated events serialize"),
                delay: true,
            });
            for insight in insights
                .iter()
                .filter(|i| i.source_event_ids.last() == Some(&event.id))
            {
                records.push(Record {
                    timestamp: event.timestamp_seconds,
                    name: "tactical-insight",
                    id: insight.insight_id.clone(),
                    data: serde_json::to_string(insight).expect("validated insight serializes"),
                    delay: false,
                });
            }
        }
        Ok(Self {
            insights,
            details,
            coachings,
            records,
        })
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TimeQuery {
    at: Option<u32>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StreamQuery {
    after: Option<u32>,
}

#[derive(Serialize)]
struct ApiError {
    code: &'static str,
    message: &'static str,
}
fn error(status: StatusCode, code: &'static str, message: &'static str) -> Response {
    (status, Json(ApiError { code, message })).into_response()
}
fn valid_time(at: Option<u32>) -> Result<u32, &'static str> {
    let at = at.unwrap_or(DEMO_DURATION_SECONDS);
    if at > DEMO_DURATION_SECONDS {
        Err("Time must be within the fictional replay.")
    } else {
        Ok(at)
    }
}

async fn list(
    State(replay): State<Arc<DemoReplay>>,
    query: Result<Query<TimeQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    let Ok(Query(query)) = query else {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            "Expected an integer at timestamp.",
        );
    };
    let at = match valid_time(query.at) {
        Ok(at) => at,
        Err(e) => return error(StatusCode::BAD_REQUEST, "invalid_time", e),
    };
    Json(
        replay
            .insights
            .iter()
            .filter(|i| i.event_timestamp <= at)
            .collect::<Vec<_>>(),
    )
    .into_response()
}

async fn detail(
    State(replay): State<Arc<DemoReplay>>,
    Path(id): Path<String>,
    query: Result<Query<TimeQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    detail_response(replay, id, query, false)
}

async fn coaching(
    State(replay): State<Arc<DemoReplay>>,
    Path(id): Path<String>,
    query: Result<Query<TimeQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    detail_response(replay, id, query, true)
}

fn detail_response(
    replay: Arc<DemoReplay>,
    id: String,
    query: Result<Query<TimeQuery>, axum::extract::rejection::QueryRejection>,
    coaching_only: bool,
) -> Response {
    let Ok(Query(query)) = query else {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            "Expected an integer at timestamp.",
        );
    };
    let at = match valid_time(query.at) {
        Ok(at) => at,
        Err(e) => return error(StatusCode::BAD_REQUEST, "invalid_time", e),
    };
    if id.len() > 240
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'-' | b'_'))
    {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_insight_id",
            "Invalid insight identifier.",
        );
    }
    if !replay
        .insights
        .iter()
        .any(|i| i.insight_id == id && i.event_timestamp <= at)
    {
        return error(
            StatusCode::NOT_FOUND,
            "insight_not_available",
            "Insight does not exist or has not occurred at this timestamp.",
        );
    }
    let bodies = if coaching_only {
        &replay.coachings
    } else {
        &replay.details
    };
    let body = &bodies
        .iter()
        .find(|(key, _)| key == &id)
        .expect("materialized detail")
        .1;
    (
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        body.clone(),
    )
        .into_response()
}

fn replay_records(
    replay: Arc<DemoReplay>,
    after: Option<u32>,
) -> impl Stream<Item = Result<Event, Infallible>> {
    stream::unfold(
        (0usize, replay, false),
        move |(mut index, replay, started)| async move {
            while index < replay.records.len()
                && after.is_some_and(|at| replay.records[index].timestamp <= at)
            {
                index += 1;
            }
            if index > replay.records.len() {
                return None;
            }
            if index == replay.records.len() {
                return Some((
                    Ok(Event::default().event("replay-complete").data("complete")),
                    (index + 1, replay, true),
                ));
            }
            let record = &replay.records[index];
            if started && record.delay {
                tokio::time::sleep(Duration::from_millis(1_250)).await;
            }
            let event = Event::default()
                .event(record.name)
                .id(&record.id)
                .data(&record.data);
            Some((Ok(event), (index + 1, replay, true)))
        },
    )
}

async fn event_stream(
    State(replay): State<Arc<DemoReplay>>,
    query: Result<Query<StreamQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    let Ok(Query(query)) = query else {
        return error(
            StatusCode::BAD_REQUEST,
            "invalid_query",
            "Expected an integer after timestamp.",
        );
    };
    if let Err(e) = valid_time(query.after) {
        return error(StatusCode::BAD_REQUEST, "invalid_time", e);
    }
    Sse::new(replay_records(replay, query.after))
        .keep_alive(KeepAlive::default())
        .into_response()
}

pub fn router(replay: Arc<DemoReplay>) -> Router {
    Router::new()
        .route("/api/v1/matches/demo/insights", get(list))
        .route("/api/v1/matches/demo/insights/{id}", get(detail))
        .route("/api/v1/matches/demo/insights/{id}/coaching", get(coaching))
        .route("/api/v1/matches/demo/stream", get(event_stream))
        .with_state(replay)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;

    async fn request(uri: &str) -> (StatusCode, Vec<u8>) {
        let response = router(Arc::new(DemoReplay::build().unwrap()))
            .oneshot(Request::builder().uri(uri).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        (
            status,
            to_bytes(response.into_body(), 1024 * 1024)
                .await
                .unwrap()
                .to_vec(),
        )
    }
    #[tokio::test]
    async fn list_is_timestamp_scoped_and_stable() {
        for (time, count) in [(111, 0), (112, 1), (334, 1), (335, 2), (420, 2)] {
            let uri = format!("/api/v1/matches/demo/insights?at={time}");
            let (status, body) = request(&uri).await;
            assert_eq!(status, StatusCode::OK);
            let json: Vec<TacticalInsight> = serde_json::from_slice(&body).unwrap();
            assert_eq!(json.len(), count);
            assert_eq!(body, request(&uri).await.1);
        }
    }
    #[tokio::test]
    async fn detail_links_full_report_and_never_arrives_early() {
        let replay = DemoReplay::build().unwrap();
        let id = &replay.insights[0].insight_id;
        let uri = format!("/api/v1/matches/demo/insights/{id}");
        let (status, body) = request(&uri).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.len() <= MAX_DETAIL_BYTES);
        let d: reactcoach_match_engine::intelligence::InsightDetail =
            serde_json::from_slice(&body).unwrap();
        assert_eq!(
            d.insight.baseline_trace_id,
            format!("{}/{}", d.trace_namespace, d.simulation.baseline.id)
        );
        assert_eq!(
            request(&format!("{uri}?at=111")).await.0,
            StatusCode::NOT_FOUND
        );
    }
    #[tokio::test]
    async fn invalid_queries_identifiers_and_missing_ids() {
        for uri in [
            "/api/v1/matches/demo/insights?at=-1",
            "/api/v1/matches/demo/insights?at=421",
            "/api/v1/matches/demo/insights?at=1.5",
            "/api/v1/matches/demo/insights?unknown=1",
            "/api/v1/matches/demo/insights/bad%20id",
            "/api/v1/matches/demo/stream?after=999",
        ] {
            assert_eq!(request(uri).await.0, StatusCode::BAD_REQUEST, "{uri}");
        }
        assert_eq!(
            request("/api/v1/matches/demo/insights/missing").await.0,
            StatusCode::NOT_FOUND
        );
    }
    async fn collect(replay: Arc<DemoReplay>, after: Option<u32>) -> Vec<String> {
        let response = Sse::new(replay_records(replay, after)).into_response();
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
        String::from_utf8(bytes.to_vec())
            .unwrap()
            .split("\n\n")
            .filter(|r| !r.is_empty())
            .map(|r| format!("{r}\n"))
            .collect()
    }
    #[tokio::test(start_paused = true)]
    async fn sse_trigger_precedes_insight_for_simultaneous_subscribers_and_reconnect() {
        let replay = Arc::new(DemoReplay::build().unwrap());
        let (a, b) = tokio::join!(collect(replay.clone(), None), collect(replay.clone(), None));
        assert_eq!(a, b);
        assert_eq!(a, collect(replay.clone(), None).await);
        assert_eq!(a.len(), 26);
        for insight in &replay.insights {
            let at = a
                .iter()
                .position(|r| r.contains(&format!("id: {}\n", insight.insight_id)))
                .unwrap();
            assert!(a[at - 1].contains("event: match-event\n"));
            assert!(a[at - 1].contains(&format!(
                "\"id\":{}",
                insight.source_event_ids.last().unwrap()
            )));
        }
        let sought = collect(replay.clone(), Some(112)).await;
        assert!(!sought
            .iter()
            .any(|r| r.contains(&replay.insights[0].insight_id)));
        assert_eq!(
            sought
                .iter()
                .filter(|r| r.contains("event: tactical-insight\n"))
                .count(),
            1
        );
        assert_eq!(collect(replay, Some(420)).await.len(), 1);
    }
}
