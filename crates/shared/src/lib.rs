//! Shared wire contracts. Coordinates are percentages of pitch length/width (0..=100).
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Team {
    Home,
    Away,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    KickOff,
    Pass,
    Shot,
    Goal,
    Tackle,
    Turnover,
    FullTime,
    Carry,
    Pressure,
    Interception,
}

/// Optional authored evidence, never inferred from sparse event positions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventContext {
    pub schema_version: String,
    pub evidence: EventEvidence,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EventEvidence {
    CompletedPass {
        receiver: String,
    },
    Carry {
        direction: CarryDirection,
    },
    Pressure {
        ball_carrier: String,
        possession_event_id: u64,
    },
    Recovery {
        dispossessed_player: String,
        possession_event_id: u64,
    },
    LostPossession {
        opponent_event_id: u64,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CarryDirection {
    Forward,
    WideRight,
    WideLeft,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PitchPosition {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MatchEvent {
    pub id: u64,
    pub timestamp_seconds: u32,
    pub team: Team,
    pub kind: EventKind,
    pub player: String,
    pub position: PitchPosition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub match_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<EventContext>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Score {
    pub home: u16,
    pub away: u16,
}

/// Event share is deliberately NOT called possession: the synthetic event log
/// contains discrete actions, not time-in-possession tracking.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct MatchStatistics {
    pub home_passes: u32,
    pub away_passes: u32,
    pub home_shots: u32,
    pub away_shots: u32,
    pub home_actions: u32,
    pub away_actions: u32,
    pub home_action_share_pct: f32,
    pub away_action_share_pct: f32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MatchSnapshot {
    pub match_id: String,
    pub elapsed_seconds: u32,
    pub score: Score,
    pub statistics: MatchStatistics,
    pub events_processed: usize,
    pub latest_event: Option<MatchEvent>,
}
