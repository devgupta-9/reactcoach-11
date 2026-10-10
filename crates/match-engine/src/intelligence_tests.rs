use super::*;
use crate::{demo_events, snapshot_at};
use reactcoach_decision_engine::simulation::{EventKind as SimulationEvent, Vector2};
use reactcoach_shared::EventKind;

fn catalog() -> IntelligenceCatalog {
    materialize(DEMO_MATCH_ID, &demo_events(), &demo_fixtures()).unwrap()
}

#[test]
fn fixture_ids_order_statistics_and_score_come_from_records() {
    let events = demo_events();
    assert_eq!(events.len(), 23);
    assert!(events.windows(2).all(|w| order(&w[0]) < order(&w[1])));
    assert_eq!(
        events.iter().map(|e| e.id).collect::<HashSet<_>>().len(),
        23
    );
    let snapshot = snapshot_at(DEMO_MATCH_ID, &events, 420).unwrap();
    assert_eq!((snapshot.score.home, snapshot.score.away), (1, 0));
    assert_eq!(
        (
            snapshot.statistics.home_passes,
            snapshot.statistics.away_passes
        ),
        (8, 2)
    );
    assert_eq!(
        (
            snapshot.statistics.home_shots,
            snapshot.statistics.away_shots
        ),
        (2, 1)
    );
    assert_eq!(
        snapshot.statistics.home_actions + snapshot.statistics.away_actions,
        23
    );
}

#[test]
fn two_distinct_moments_have_stable_ids_and_prefix_statistics() {
    let events = demo_events();
    let moments = detect_moments(DEMO_MATCH_ID, &events).unwrap();
    assert_eq!(moments.len(), 2);
    assert_eq!(moments[0].source_event_id, 9);
    assert_eq!(moments[1].source_event_id, 17);
    assert_ne!(moments[0].moment_kind, moments[1].moment_kind);
    assert_eq!(
        moments[0].detected_statistics.home_actions + moments[0].detected_statistics.away_actions,
        9
    );
    let reversed: Vec<_> = events.into_iter().rev().collect();
    assert_eq!(
        serde_json::to_value(&moments).unwrap(),
        serde_json::to_value(detect_moments(DEMO_MATCH_ID, &reversed).unwrap()).unwrap()
    );
    assert_eq!(
        moments
            .iter()
            .map(|m| &m.moment_id)
            .collect::<HashSet<_>>()
            .len(),
        2
    );
}

#[test]
fn serialized_catalog_repeatability_and_provenance() {
    let first = catalog();
    let second = catalog();
    assert_eq!(
        serde_json::to_vec(&first.details).unwrap(),
        serde_json::to_vec(&second.details).unwrap()
    );
    let decoded: Vec<InsightDetail> =
        serde_json::from_slice(&serde_json::to_vec(&first.details).unwrap()).unwrap();
    for d in decoded {
        assert!(d.insight.provenance.fictional && d.insight.provenance.geometry_authored);
        assert_eq!(d.insight.provenance.engine_version, SCENARIO_VERSION);
    }
}

#[test]
fn linked_evidence_resolves_to_source_and_same_start_simulations() {
    for detail in catalog().details {
        let i = detail.insight;
        let r = detail.simulation;
        assert_eq!(i.event_timestamp, detail.fixture.event_timestamp);
        assert_eq!(
            i.source_event_ids.last(),
            Some(&detail.moment.source_event_id)
        );
        assert_eq!(
            i.observed_event_facts
                .iter()
                .map(|e| e.id)
                .collect::<Vec<_>>(),
            i.source_event_ids
        );
        assert_eq!(
            i.baseline_trace_id,
            format!("{}/{}", detail.trace_namespace, r.baseline.id)
        );
        assert_eq!(r.input.assessed_player.id, "Home 7");
        assert_eq!(r.input.opponent.id, "Away 4");
        assert!(i
            .comparison_evidence
            .summary
            .contains("In the authored scenario"));
        assert!(i.comparison_evidence.summary.contains(
            if r.baseline.evaluation.friendly_possession {
                "ended with friendly possession"
            } else {
                "ended without friendly possession"
            }
        ));
        for trace in r.alternatives.iter().filter_map(|a| a.trace.as_ref()) {
            assert_eq!(trace.steps[0].state, r.baseline.steps[0].state);
        }
        for event_ref in &i.comparison_evidence.opponent_decision_event_ids {
            assert!(std::iter::once(&r.baseline)
                .chain(r.alternatives.iter().filter_map(|a| a.trace.as_ref()))
                .flat_map(|t| &t.events)
                .any(
                    |e| format!("{}/{}", detail.trace_namespace, e.id) == *event_ref
                        && matches!(e.evidence, SimulationEvent::OpponentDecision { .. })
                ));
        }
        if let Some(id) = r.recommended_trace_id {
            assert_eq!(
                i.corrected_trace_id,
                Some(format!("{}/{id}", detail.trace_namespace))
            );
            assert!(
                i.comparison_evidence.corrected.unwrap().objective_key
                    > i.comparison_evidence.baseline.objective_key
            );
        }
    }
}

#[test]
fn no_improvement_keeps_null_correction_and_honest_evidence() {
    let mut fixtures = demo_fixtures();
    fixtures[0].request.initial_state.opponent.position_mm = Vector2 { x: 46200, y: 35200 };
    let c = materialize(DEMO_MATCH_ID, &demo_events(), &fixtures).unwrap();
    let i = &c.details[0].insight;
    assert!(!i.comparison_evidence.baseline.friendly_possession);
    assert!(i
        .comparison_evidence
        .summary
        .contains("No strictly better feasible correction was found"));
    assert!(
        i.recommended_action.is_none()
            && i.corrected_trace_id.is_none()
            && i.comparison_evidence.corrected.is_none()
    );
}

#[test]
fn missing_fixture_is_explicit_and_does_not_invent_results() {
    let c = materialize(DEMO_MATCH_ID, &demo_events(), &[]).unwrap();
    assert!(c.details.is_empty());
    assert_eq!(c.unlinked_moment_ids.len(), 2);
    let c = materialize(DEMO_MATCH_ID, &demo_events(), &demo_fixtures()[..1]).unwrap();
    assert_eq!(c.details.len(), 1);
    assert_eq!(c.unlinked_moment_ids.len(), 1);
}

#[test]
fn corrupt_registry_source_version_and_timestamp_are_rejected() {
    for field in 0..8 {
        let mut f = demo_fixtures();
        match field {
            0 => f[0].source_event_id = 999,
            1 => f[0].schema_version = "v99".into(),
            2 => f[0].request.scenario_version = "v99".into(),
            3 => f[0].event_timestamp += 1,
            4 => f[0].match_id = "other".into(),
            5 => f[0].anchor_timestamp += 1,
            6 => f[0].anchor_event_id = 5,
            _ => f[0].fixture_id = "bad/id".into(),
        }
        assert!(
            materialize(DEMO_MATCH_ID, &demo_events(), &f).is_err(),
            "case {field}"
        );
    }
}

#[test]
fn corrupt_registry_players_actions_geometry_and_assumptions_are_rejected() {
    for field in 0..7 {
        let mut f = demo_fixtures();
        match field {
            0 => f[0].request.assessed_player.id = "Home 9".into(),
            1 => f[0].request.opponent.id = "Home 5".into(),
            2 => f[0].request.supporting_teammate.as_mut().unwrap().id = "Away 9".into(),
            3 => f[0].request.initial_state.current_action = TacticalAction::DirectDribble,
            4 => f[0].request.initial_state.assessed.position_mm.x = 90000,
            5 => f[0].relation = FixtureRelation::AuthoredDecisionPoint,
            _ => f[0].assumptions.clear(),
        }
        assert!(
            materialize(DEMO_MATCH_ID, &demo_events(), &f).is_err(),
            "case {field}"
        );
    }
}

#[test]
fn duplicate_fixtures_and_execution_limits_rejected() {
    let mut f = demo_fixtures();
    f.push(f[0].clone());
    assert!(materialize(DEMO_MATCH_ID, &demo_events(), &f).is_err());
    assert!(matches!(
        materialize(
            DEMO_MATCH_ID,
            &demo_events(),
            &vec![demo_fixtures()[0].clone(); MAX_FIXTURES + 1]
        ),
        Err(IntelligenceError::Limit)
    ));
    assert!(matches!(
        detect_moments(
            DEMO_MATCH_ID,
            &vec![demo_events()[0].clone(); MAX_EVENTS + 1]
        ),
        Err(IntelligenceError::Limit)
    ));
    let mut f = demo_fixtures();
    f[0].request.config.duration_ms = 6001;
    assert!(matches!(
        materialize(DEMO_MATCH_ID, &demo_events(), &f),
        Err(IntelligenceError::Simulation(_))
    ));
}

#[test]
fn malformed_event_versions_ids_times_and_positions_rejected() {
    for field in 0..7 {
        let mut e = demo_events();
        match field {
            0 => e[0].id = 0,
            1 => e[0].timestamp_seconds = 86401,
            2 => e[0].position.x = f32::NAN,
            3 => e[5].context.as_mut().unwrap().schema_version = "v99".into(),
            4 => e[5].team = Team::Away,
            5 => e[5].match_id = Some("other".into()),
            _ => e[8].id = 8,
        }
        assert!(detect_moments(DEMO_MATCH_ID, &e).is_err(), "case {field}");
    }
}

#[test]
fn causal_inversion_future_and_stale_possession_references_rejected() {
    let mut e = demo_events();
    e[7].id = 10;
    e[9].id = 8;
    e[8].context.as_mut().unwrap().evidence = EventEvidence::LostPossession {
        opponent_event_id: 10,
    };
    assert!(detect_moments(DEMO_MATCH_ID, &e).is_err());
    let mut e = demo_events();
    e[16].context.as_mut().unwrap().evidence = EventEvidence::Pressure {
        ball_carrier: "Home 7".into(),
        possession_event_id: 6,
    };
    assert!(detect_moments(DEMO_MATCH_ID, &e).is_err());
    let mut e = demo_events();
    e[6].context.as_mut().unwrap().evidence = EventEvidence::Pressure {
        ball_carrier: "Home 7".into(),
        possession_event_id: 16,
    };
    assert!(detect_moments(DEMO_MATCH_ID, &e).is_err());
}

#[test]
fn ordinary_shots_and_uncontextualized_turnovers_are_not_moments() {
    let mut e = demo_events();
    for event in &mut e {
        event.context = None;
    }
    e[5].kind = EventKind::Turnover;
    assert!(detect_moments(DEMO_MATCH_ID, &e).unwrap().is_empty());
}

#[test]
fn moment_statistics_exclude_later_records_at_the_same_timestamp() {
    let mut e = demo_events();
    let mut later = e[0].clone();
    later.id = 24;
    later.timestamp_seconds = 112;
    later.kind = EventKind::Goal;
    e.push(later);
    let moment = detect_moments(DEMO_MATCH_ID, &e).unwrap().remove(0);
    assert_eq!(moment.detected_statistics.home_shots, 0);
    assert_eq!(
        snapshot_at(DEMO_MATCH_ID, &e, 112)
            .unwrap()
            .statistics
            .home_shots,
        1
    );
}

#[test]
fn pressure_can_reference_an_explicit_completed_pass_receipt() {
    let mut e = demo_events();
    e[15].kind = EventKind::Pass;
    e[15].player = "Home 6".into();
    e[15].context.as_mut().unwrap().evidence = EventEvidence::CompletedPass {
        receiver: "Home 7".into(),
    };
    assert_eq!(detect_moments(DEMO_MATCH_ID, &e).unwrap().len(), 2);
    // Recognition alone cannot turn a receipt into an invented spatial dribble fixture.
    assert!(materialize(DEMO_MATCH_ID, &e, &demo_fixtures()).is_err());
}

#[test]
fn away_event_evidence_cannot_be_simulated_in_the_wrong_attack_direction() {
    let original = demo_events();
    let mut events = vec![
        original[5].clone(),
        original[7].clone(),
        original[8].clone(),
    ];
    events[0].team = Team::Away;
    events[0].player = "Away 10".into();
    events[1].team = Team::Home;
    events[1].player = "Home 5".into();
    events[1].context.as_mut().unwrap().evidence = EventEvidence::Recovery {
        dispossessed_player: "Away 10".into(),
        possession_event_id: 6,
    };
    events[2].team = Team::Away;
    events[2].player = "Away 10".into();
    assert_eq!(detect_moments(DEMO_MATCH_ID, &events).unwrap().len(), 1);
    let mut f = demo_fixtures()[0].clone();
    f.attacking_team = Team::Away;
    f.request.assessed_player.id = "Away 10".into();
    f.request.opponent.id = "Home 5".into();
    f.request.supporting_teammate.as_mut().unwrap().id = "Away 9".into();
    assert!(
        matches!(materialize(DEMO_MATCH_ID,&events,&[f]),Err(IntelligenceError::Fixture(reason)) if reason.contains("coordinate normalization"))
    );
}

#[test]
fn legacy_json_and_unknown_event_kind_compatibility() {
    let legacy = serde_json::json!({"id":1,"timestamp_seconds":0,"team":"home","kind":"kick_off","player":"Example","position":{"x":50.0,"y":50.0}});
    let e: MatchEvent = serde_json::from_value(legacy.clone()).unwrap();
    assert!(e.context.is_none() && e.match_id.is_none());
    assert_eq!(serde_json::to_value(&e).unwrap(), legacy);
    let mut invalid = legacy;
    invalid["kind"] = "unknown".into();
    assert!(serde_json::from_value::<MatchEvent>(invalid).is_err());
}
