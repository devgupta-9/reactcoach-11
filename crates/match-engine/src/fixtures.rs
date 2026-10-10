//! Fictional authored records. Percent positions never become inferred tracking geometry.
use crate::{ReplayError, DEMO_MATCH_ID};
use reactcoach_shared::{
    CarryDirection, EventContext, EventEvidence, EventKind, MatchEvent, PitchPosition, Team,
};

pub const EVENT_CONTEXT_VERSION: &str = "synthetic_event_context_v1";

pub fn roster_team(player: &str) -> Option<Team> {
    match player {
        "Home 5" | "Home 6" | "Home 7" | "Home 8" | "Home 9" | "Home 10" | "Home 11" => {
            Some(Team::Home)
        }
        "Away 4" | "Away 9" | "Away 10" => Some(Team::Away),
        _ => None,
    }
}

pub fn validate_contexts(events: &[MatchEvent]) -> Result<(), ReplayError> {
    for event in events {
        let fail = || {
            ReplayError::InvalidEvidence(
                event.id,
                "context kind, identity or causal reference mismatch",
            )
        };
        if event.match_id.as_deref() == Some(DEMO_MATCH_ID)
            && roster_team(&event.player) != Some(event.team)
        {
            return Err(fail());
        }
        let Some(context) = &event.context else {
            continue;
        };
        if context.schema_version != EVENT_CONTEXT_VERSION {
            return Err(ReplayError::InvalidEvidence(
                event.id,
                "unsupported context version",
            ));
        }
        let previous = |id| {
            events.iter().find(|p| {
                p.id == id && (p.timestamp_seconds, p.id) < (event.timestamp_seconds, event.id)
            })
        };
        let uninterrupted = |p: &MatchEvent| {
            !events.iter().any(|between| {
                (p.timestamp_seconds, p.id) < (between.timestamp_seconds, between.id)
                    && (between.timestamp_seconds, between.id) < (event.timestamp_seconds, event.id)
                    && between.kind != EventKind::Pressure
            })
        };
        let has_ball = |p: &MatchEvent, player: &str| {
            (p.kind == EventKind::Carry && p.player == player)
                || matches!(p.context.as_ref().map(|c| &c.evidence), Some(EventEvidence::CompletedPass { receiver }) if receiver == player)
        };
        let valid = match &context.evidence {
            EventEvidence::CompletedPass { receiver } => event.kind == EventKind::Pass && receiver != &event.player && roster_team(receiver) == Some(event.team),
            EventEvidence::Carry { .. } => event.kind == EventKind::Carry,
            EventEvidence::Pressure { ball_carrier, possession_event_id } => event.kind == EventKind::Pressure
                && roster_team(ball_carrier).is_some_and(|t| t != event.team)
                && previous(*possession_event_id).is_some_and(|p| p.team != event.team && has_ball(p, ball_carrier) && uninterrupted(p)),
            EventEvidence::Recovery { dispossessed_player, possession_event_id } => matches!(event.kind, EventKind::Tackle | EventKind::Interception)
                && roster_team(dispossessed_player).is_some_and(|t| t != event.team)
                && previous(*possession_event_id).is_some_and(|p| p.team != event.team && has_ball(p, dispossessed_player) && uninterrupted(p)),
            EventEvidence::LostPossession { opponent_event_id } => event.kind == EventKind::Turnover
                && previous(*opponent_event_id).is_some_and(|p| p.team != event.team && uninterrupted(p) && matches!(p.context.as_ref().map(|c| &c.evidence), Some(EventEvidence::Recovery { dispossessed_player, .. }) if dispossessed_player == &event.player)),
        };
        if !valid {
            return Err(fail());
        }
    }
    Ok(())
}

pub fn events() -> Vec<MatchEvent> {
    use EventEvidence as E;
    use EventKind as K;
    use Team::{Away as A, Home as H};
    let records = [
        (0, H, K::KickOff, "Home 8", 50., 50., None),
        (
            20,
            H,
            K::Pass,
            "Home 8",
            48.,
            50.,
            Some(E::CompletedPass {
                receiver: "Home 6".into(),
            }),
        ),
        (
            40,
            H,
            K::Pass,
            "Home 6",
            42.,
            30.,
            Some(E::CompletedPass {
                receiver: "Home 10".into(),
            }),
        ),
        (
            70,
            H,
            K::Carry,
            "Home 10",
            40.,
            42.,
            Some(E::Carry {
                direction: CarryDirection::Forward,
            }),
        ),
        (
            90,
            H,
            K::Pass,
            "Home 10",
            41.,
            45.,
            Some(E::CompletedPass {
                receiver: "Home 7".into(),
            }),
        ),
        (
            110,
            H,
            K::Carry,
            "Home 7",
            42.857,
            50.,
            Some(E::Carry {
                direction: CarryDirection::WideRight,
            }),
        ),
        (
            111,
            A,
            K::Pressure,
            "Away 4",
            49.524,
            53.676,
            Some(E::Pressure {
                ball_carrier: "Home 7".into(),
                possession_event_id: 6,
            }),
        ),
        (
            112,
            A,
            K::Tackle,
            "Away 4",
            44.,
            52.,
            Some(E::Recovery {
                dispossessed_player: "Home 7".into(),
                possession_event_id: 6,
            }),
        ),
        (
            112,
            H,
            K::Turnover,
            "Home 7",
            44.,
            52.,
            Some(E::LostPossession {
                opponent_event_id: 8,
            }),
        ),
        (
            130,
            A,
            K::Pass,
            "Away 4",
            44.,
            52.,
            Some(E::CompletedPass {
                receiver: "Away 10".into(),
            }),
        ),
        (
            150,
            A,
            K::Pass,
            "Away 10",
            30.,
            67.,
            Some(E::CompletedPass {
                receiver: "Away 9".into(),
            }),
        ),
        (180, A, K::Shot, "Away 9", 14., 47., None),
        (245, H, K::Interception, "Home 5", 35., 60., None),
        (
            270,
            H,
            K::Pass,
            "Home 5",
            35.,
            60.,
            Some(E::CompletedPass {
                receiver: "Home 6".into(),
            }),
        ),
        (
            300,
            H,
            K::Pass,
            "Home 6",
            40.,
            42.,
            Some(E::CompletedPass {
                receiver: "Home 7".into(),
            }),
        ),
        (
            330,
            H,
            K::Carry,
            "Home 7",
            42.857,
            50.,
            Some(E::Carry {
                direction: CarryDirection::Forward,
            }),
        ),
        (
            335,
            A,
            K::Pressure,
            "Away 4",
            49.524,
            53.676,
            Some(E::Pressure {
                ball_carrier: "Home 7".into(),
                possession_event_id: 16,
            }),
        ),
        (
            350,
            H,
            K::Pass,
            "Home 7",
            46.,
            48.,
            Some(E::CompletedPass {
                receiver: "Home 10".into(),
            }),
        ),
        (
            360,
            H,
            K::Pass,
            "Home 10",
            65.,
            42.,
            Some(E::CompletedPass {
                receiver: "Home 11".into(),
            }),
        ),
        (365, H, K::Shot, "Home 11", 86., 55., None),
        (
            390,
            H,
            K::Carry,
            "Home 11",
            86.,
            55.,
            Some(E::Carry {
                direction: CarryDirection::Forward,
            }),
        ),
        (
            400,
            H,
            K::Pass,
            "Home 11",
            88.,
            52.,
            Some(E::CompletedPass {
                receiver: "Home 9".into(),
            }),
        ),
        (420, H, K::Goal, "Home 9", 92., 48., None),
    ];
    records
        .into_iter()
        .enumerate()
        .map(
            |(index, (timestamp_seconds, team, kind, player, x, y, evidence))| MatchEvent {
                id: index as u64 + 1,
                timestamp_seconds,
                team,
                kind,
                player: player.into(),
                position: PitchPosition { x, y },
                match_id: Some(DEMO_MATCH_ID.into()),
                context: evidence.map(|evidence| EventContext {
                    schema_version: EVENT_CONTEXT_VERSION.into(),
                    evidence,
                }),
            },
        )
        .collect()
}
