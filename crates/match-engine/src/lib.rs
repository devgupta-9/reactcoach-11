use reactcoach_analytics::summarize;
use reactcoach_shared::{EventKind, MatchEvent, MatchSnapshot, Score, Team};
use std::collections::HashSet;
use thiserror::Error;

pub mod fixtures;
pub mod intelligence;
pub const DEMO_MATCH_ID: &str = "demo-match-001";
pub const DEMO_DURATION_SECONDS: u32 = 420;

#[derive(Debug, Error, PartialEq)]
pub enum ReplayError {
    #[error("duplicate event id {0}")]
    DuplicateId(u64),
    #[error("invalid pitch coordinates in event {0}")]
    InvalidPosition(u64),
    #[error("player is missing for event {0}")]
    MissingPlayer(u64),
    #[error("invalid event evidence in event {0}: {1}")]
    InvalidEvidence(u64, &'static str),
}

pub fn validate_events(match_id: &str, events: &[MatchEvent]) -> Result<(), ReplayError> {
    let mut ids = HashSet::new();
    for event in events {
        if !ids.insert(event.id) {
            return Err(ReplayError::DuplicateId(event.id));
        }
        if !event.position.x.is_finite()
            || !event.position.y.is_finite()
            || !(0.0..=100.0).contains(&event.position.x)
            || !(0.0..=100.0).contains(&event.position.y)
        {
            return Err(ReplayError::InvalidPosition(event.id));
        }
        if event.player.trim().is_empty() {
            return Err(ReplayError::MissingPlayer(event.id));
        }
        if event.id == 0
            || event.timestamp_seconds > 86_400
            || match_id.trim().is_empty()
            || event.match_id.as_deref().is_some_and(|id| id != match_id)
        {
            return Err(ReplayError::InvalidEvidence(
                event.id,
                "invalid identifier, match or time",
            ));
        }
    }
    fixtures::validate_contexts(events)
}

/// Stable timestamp/id ordering also defines the causal order of authored contexts.
pub fn snapshot_at(
    match_id: &str,
    events: &[MatchEvent],
    at_seconds: u32,
) -> Result<MatchSnapshot, ReplayError> {
    validate_events(match_id, events)?;
    let mut selected: Vec<_> = events
        .iter()
        .filter(|e| e.timestamp_seconds <= at_seconds)
        .cloned()
        .collect();
    selected.sort_by_key(|e| (e.timestamp_seconds, e.id));
    let mut score = Score::default();
    for event in &selected {
        if event.kind == EventKind::Goal {
            match event.team {
                Team::Home => score.home += 1,
                Team::Away => score.away += 1,
            }
        }
    }
    Ok(MatchSnapshot {
        match_id: match_id.into(),
        elapsed_seconds: at_seconds,
        score,
        statistics: summarize(&selected),
        events_processed: selected.len(),
        latest_event: selected.last().cloned(),
    })
}

/// Explicitly fictional records, not a complete tracking or possession feed.
pub fn demo_events() -> Vec<MatchEvent> {
    fixtures::events()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replay_before_and_after_goal() {
        let events = demo_events();
        let before = snapshot_at(DEMO_MATCH_ID, &events, 419).unwrap();
        let after = snapshot_at(DEMO_MATCH_ID, &events, 420).unwrap();
        assert_eq!(before.score.home, 0);
        assert_eq!(after.score.home, 1);
        assert_eq!(after.statistics.home_shots, 2);
        assert_eq!(after.events_processed, 23);
    }
    #[test]
    fn replay_is_order_independent() {
        let events = demo_events();
        let reversed: Vec<_> = events.iter().rev().cloned().collect();
        assert_eq!(
            snapshot_at(DEMO_MATCH_ID, &events, 420).unwrap(),
            snapshot_at(DEMO_MATCH_ID, &reversed, 420).unwrap()
        );
    }
    #[test]
    fn invalid_coordinates_rejected() {
        let mut events = demo_events();
        events[0].position.x = 101.0;
        assert_eq!(
            snapshot_at(DEMO_MATCH_ID, &events, 420).unwrap_err(),
            ReplayError::InvalidPosition(1)
        );
    }
    #[test]
    fn duplicate_ids_rejected() {
        let mut events = demo_events();
        events[1].id = 1;
        assert_eq!(
            snapshot_at(DEMO_MATCH_ID, &events, 420).unwrap_err(),
            ReplayError::DuplicateId(1)
        );
    }
}
