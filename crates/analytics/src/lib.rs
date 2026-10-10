//! Pure, reproducible statistics computed only from provided event records.
use reactcoach_shared::{EventKind, MatchEvent, MatchStatistics, Team};

pub fn summarize(events: &[MatchEvent]) -> MatchStatistics {
    let mut stats = MatchStatistics::default();
    for event in events {
        let home = event.team == Team::Home;
        if home {
            stats.home_actions += 1;
        } else {
            stats.away_actions += 1;
        }
        match (home, event.kind) {
            (true, EventKind::Pass) => stats.home_passes += 1,
            (false, EventKind::Pass) => stats.away_passes += 1,
            (true, EventKind::Shot | EventKind::Goal) => stats.home_shots += 1,
            (false, EventKind::Shot | EventKind::Goal) => stats.away_shots += 1,
            _ => {}
        }
    }
    let total = stats.home_actions + stats.away_actions;
    if total > 0 {
        stats.home_action_share_pct = stats.home_actions as f32 * 100.0 / total as f32;
        stats.away_action_share_pct = stats.away_actions as f32 * 100.0 / total as f32;
    }
    stats
}

#[cfg(test)]
mod tests {
    use super::*;
    use reactcoach_shared::PitchPosition;

    #[test]
    fn empty_events_have_zero_share() {
        assert_eq!(summarize(&[]), MatchStatistics::default());
    }

    #[test]
    fn goal_counts_as_shot() {
        let event = MatchEvent {
            id: 1,
            timestamp_seconds: 42,
            team: Team::Home,
            kind: EventKind::Goal,
            player: "Forward".into(),
            position: PitchPosition { x: 90.0, y: 50.0 },
            match_id: None,
            context: None,
        };
        let result = summarize(&[event]);
        assert_eq!(result.home_shots, 1);
        assert_eq!(result.home_action_share_pct, 100.0);
    }
}
