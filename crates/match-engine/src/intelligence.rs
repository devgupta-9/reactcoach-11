//! Deterministic event evidence -> authored scenario -> unchanged Phase 2A simulator.
use crate::{fixtures::roster_team, validate_events, ReplayError, DEMO_MATCH_ID};
use reactcoach_analytics::summarize;
use reactcoach_decision_engine::simulation::{
    demo_request, simulate, SimulationReport, SimulationRequest, TacticalAction,
    TacticalEvaluation, SCENARIO_VERSION,
};
use reactcoach_shared::{CarryDirection, EventEvidence, MatchEvent, MatchStatistics, Team};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;

pub const INTELLIGENCE_VERSION: &str = "tactical_intelligence_v1";
pub const FIXTURE_VERSION: &str = "synthetic_scenario_fixture_v1";
pub const MATCH_VERSION: &str = "fictional_replay_v2";
pub const MAX_EVENTS: usize = 128;
pub const MAX_FIXTURES: usize = 8;

#[cfg(test)]
#[path = "intelligence_tests.rs"]
mod tests;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MomentKind {
    AttackingTurnover,
    DecisionUnderPressure,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FixtureRelation {
    HypotheticalPrecursor,
    AuthoredDecisionPoint,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticalMoment {
    pub schema_version: String,
    pub moment_id: String,
    pub match_id: String,
    pub source_event_id: u64,
    pub event_timestamp: u32,
    pub moment_kind: MomentKind,
    pub involved_player_ids: Vec<String>,
    pub detection_reason: String,
    pub supporting_event_ids: Vec<u64>,
    pub detected_statistics: MatchStatistics,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScenarioFixture {
    pub schema_version: String,
    pub fixture_id: String,
    pub match_id: String,
    pub source_event_id: u64,
    pub event_timestamp: u32,
    pub anchor_event_id: u64,
    pub anchor_timestamp: u32,
    pub moment_kind: MomentKind,
    pub relation: FixtureRelation,
    pub attacking_team: Team,
    pub assumptions: Vec<String>,
    pub request: SimulationRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provenance {
    pub match_version: String,
    pub fixture_version: String,
    pub detector_version: String,
    pub engine_version: String,
    pub fictional: bool,
    pub geometry_authored: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonEvidence {
    pub baseline: TacticalEvaluation,
    pub corrected: Option<TacticalEvaluation>,
    pub summary: String,
    pub reason: String,
    /// Scoped references resolve through detail.trace_namespace + raw report event IDs.
    pub opponent_decision_event_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticalInsight {
    pub schema_version: String,
    pub insight_id: String,
    pub match_id: String,
    pub moment_id: String,
    pub source_event_ids: Vec<u64>,
    pub event_timestamp: u32,
    pub insight_kind: MomentKind,
    pub headline: String,
    pub significance_reason: String,
    pub observed_event_facts: Vec<MatchEvent>,
    pub detected_statistics: MatchStatistics,
    pub synthetic_scenario_assumptions: Vec<String>,
    pub scenario_fixture_id: String,
    pub scenario_version: String,
    pub fixture_relation: FixtureRelation,
    pub original_action: TacticalAction,
    pub recommended_action: Option<TacticalAction>,
    pub baseline_trace_id: String,
    pub corrected_trace_id: Option<String>,
    pub comparison_evidence: ComparisonEvidence,
    pub limitations: Vec<String>,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightDetail {
    pub insight: TacticalInsight,
    pub moment: TacticalMoment,
    pub fixture: ScenarioFixture,
    pub trace_namespace: String,
    pub simulation: SimulationReport,
}

#[derive(Debug, Default)]
pub struct IntelligenceCatalog {
    pub details: Vec<InsightDetail>,
    pub unlinked_moment_ids: Vec<String>,
}

#[derive(Debug, Error)]
pub enum IntelligenceError {
    #[error(transparent)]
    Replay(#[from] ReplayError),
    #[error("invalid fixture: {0}")]
    Fixture(&'static str),
    #[error("invalid simulation: {0}")]
    Simulation(String),
    #[error("intelligence resource limit exceeded")]
    Limit,
}

fn order(e: &MatchEvent) -> (u32, u64) {
    (e.timestamp_seconds, e.id)
}

pub fn detect_moments(
    match_id: &str,
    events: &[MatchEvent],
) -> Result<Vec<TacticalMoment>, IntelligenceError> {
    if events.len() > MAX_EVENTS {
        return Err(IntelligenceError::Limit);
    }
    validate_events(match_id, events)?;
    let mut sorted = events.to_vec();
    sorted.sort_by_key(order);
    let mut moments = Vec::new();
    for (index, event) in sorted.iter().enumerate() {
        let Some(evidence) = event.context.as_ref().map(|c| &c.evidence) else {
            continue;
        };
        let (kind, anchor_id, opponent_id, attacker, defender, reason) = match evidence {
            EventEvidence::LostPossession { opponent_event_id } => {
                let recovery = sorted.iter().find(|e| e.id == *opponent_event_id).expect("validated reference");
                let Some(EventEvidence::Recovery { possession_event_id, .. }) = recovery.context.as_ref().map(|c| &c.evidence) else { continue; };
                (MomentKind::AttackingTurnover,*possession_event_id,Some(recovery.id),event.player.clone(),recovery.player.clone(),"A logged attacking advance was followed within five seconds by an opposing recovery and an explicit loss of possession.")
            }
            EventEvidence::Pressure { ball_carrier, possession_event_id } =>
                (MomentKind::DecisionUnderPressure,*possession_event_id,None,ball_carrier.clone(),event.player.clone(),"An explicit opposing pressure record followed an attacking possession record by three to ten seconds, creating an authored decision point."),
            _ => continue,
        };
        let anchor = sorted
            .iter()
            .find(|e| e.id == anchor_id)
            .expect("validated reference");
        let gap = event.timestamp_seconds - anchor.timestamp_seconds;
        let attacking_zone = match anchor.team {
            Team::Home => 40.0..=75.0,
            Team::Away => 25.0..=60.0,
        };
        if !attacking_zone.contains(&anchor.position.x)
            || gap
                > if kind == MomentKind::AttackingTurnover {
                    5
                } else {
                    10
                }
            || (kind == MomentKind::DecisionUnderPressure && gap < 3)
        {
            continue;
        }
        let mut supporting_event_ids = vec![anchor_id];
        if let Some(id) = opponent_id {
            supporting_event_ids.push(id);
        }
        moments.push(TacticalMoment {
            schema_version: INTELLIGENCE_VERSION.into(),
            moment_id: format!("{match_id}:{MATCH_VERSION}:moment:{}", event.id),
            match_id: match_id.into(),
            source_event_id: event.id,
            event_timestamp: event.timestamp_seconds,
            moment_kind: kind,
            involved_player_ids: vec![attacker, defender],
            detection_reason: reason.into(),
            supporting_event_ids,
            detected_statistics: summarize(&sorted[..=index]),
        });
    }
    Ok(moments)
}

pub fn demo_fixtures() -> Vec<ScenarioFixture> {
    [("turnover-wide-001",9,112,6,110,MomentKind::AttackingTurnover,FixtureRelation::HypotheticalPrecursor,TacticalAction::WideRight),
     ("pressure-forward-001",17,335,16,330,MomentKind::DecisionUnderPressure,FixtureRelation::AuthoredDecisionPoint,TacticalAction::DirectDribble)]
    .into_iter().map(|(id,source,time,anchor,anchor_time,kind,relation,action)| {
        let mut request = demo_request();
        request.assessed_player.id = "Home 7".into(); request.assessed_player.label = "Fictional Home 7".into();
        request.opponent.id = "Away 4".into(); request.opponent.label = "Fictional Away 4".into();
        if let Some(teammate) = &mut request.supporting_teammate { teammate.id="Home 10".into(); teammate.label="Fictional Home 10".into(); }
        request.initial_state.current_action=action;
        ScenarioFixture { schema_version:FIXTURE_VERSION.into(), fixture_id:id.into(), match_id:DEMO_MATCH_ID.into(), source_event_id:source,
            event_timestamp:time, anchor_event_id:anchor, anchor_timestamp:anchor_time, moment_kind:kind, relation, attacking_team:Team::Home,
            assumptions:vec!["All identities and ratings are fictional; synthetic ratings are uncalibrated indices.".into(),
                "Home attacks along +x on the authored 105 x 68 metre pitch. Positions, velocities and ball ownership are authored, not recovered from tracking.".into(),
                "The carry record anchors this hypothetical starting location. The four-second rollout and 1200ms adaptation are model time, not a reconstruction of event time.".into(),
                "One attacker, one defender and one stationary supporting teammate; separate replay events are not forced to match simulation outcomes.".into()], request }
    }).collect()
}

fn validate_fixture(
    f: &ScenarioFixture,
    m: &TacticalMoment,
    events: &[MatchEvent],
) -> Result<(), IntelligenceError> {
    let invalid = |reason| IntelligenceError::Fixture(reason);
    if f.attacking_team != Team::Home {
        return Err(invalid("only Home attacking spatial fixtures are supported; Away would require explicit coordinate normalization"));
    }
    if f.schema_version != FIXTURE_VERSION || f.request.scenario_version != SCENARIO_VERSION {
        return Err(invalid("unsupported version"));
    }
    if f.fixture_id.is_empty()
        || f.fixture_id.len() > 80
        || !f
            .fixture_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        || f.match_id != m.match_id
        || f.source_event_id != m.source_event_id
        || f.event_timestamp != m.event_timestamp
        || f.moment_kind != m.moment_kind
    {
        return Err(invalid("source identity or timestamp mismatch"));
    }
    let anchor = events
        .iter()
        .find(|e| e.id == f.anchor_event_id)
        .ok_or(invalid("missing anchor"))?;
    if !m.supporting_event_ids.contains(&anchor.id)
        || anchor.timestamp_seconds != f.anchor_timestamp
        || f.anchor_timestamp > f.event_timestamp
        || anchor.team != f.attacking_team
        || f.assumptions.is_empty()
        || f.assumptions.iter().any(|a| a.trim().is_empty())
    {
        return Err(invalid("anchor or authored assumptions mismatch"));
    }
    let expected_relation = if m.moment_kind == MomentKind::AttackingTurnover {
        FixtureRelation::HypotheticalPrecursor
    } else {
        FixtureRelation::AuthoredDecisionPoint
    };
    let r = &f.request;
    if f.relation != expected_relation
        || r.assessed_player.id != m.involved_player_ids[0]
        || r.opponent.id != m.involved_player_ids[1]
        || roster_team(&r.assessed_player.id) != Some(f.attacking_team)
        || roster_team(&r.opponent.id) == Some(f.attacking_team)
        || r.supporting_teammate
            .as_ref()
            .is_some_and(|p| roster_team(&p.id) != Some(f.attacking_team))
    {
        return Err(invalid("participant identity or relationship mismatch"));
    }
    let expected_action = match anchor.context.as_ref().map(|c| &c.evidence) {
        Some(EventEvidence::Carry {
            direction: CarryDirection::Forward,
        }) => Some(TacticalAction::DirectDribble),
        Some(EventEvidence::Carry {
            direction: CarryDirection::WideRight,
        }) => Some(TacticalAction::WideRight),
        Some(EventEvidence::Carry {
            direction: CarryDirection::WideLeft,
        }) => Some(TacticalAction::WideLeft),
        _ => None,
    };
    if expected_action != Some(r.initial_state.current_action) {
        return Err(invalid("authored action contradicts anchor"));
    }
    // Only an anchor-consistency check. Never derive simulation positions from observations.
    let x = r.initial_state.assessed.position_mm.x as f32 * 100.0 / r.config.pitch.length_mm as f32;
    let y = r.initial_state.assessed.position_mm.y as f32 * 100.0 / r.config.pitch.width_mm as f32;
    if !x.is_finite()
        || !y.is_finite()
        || (x - anchor.position.x).abs() > 2.0
        || (y - anchor.position.y).abs() > 2.0
    {
        return Err(invalid("authored anchor position contradicts event"));
    }
    Ok(())
}

pub fn materialize(
    match_id: &str,
    events: &[MatchEvent],
    fixtures: &[ScenarioFixture],
) -> Result<IntelligenceCatalog, IntelligenceError> {
    if fixtures.len() > MAX_FIXTURES {
        return Err(IntelligenceError::Limit);
    }
    let moments = detect_moments(match_id, events)?;
    let mut ids = HashSet::new();
    let mut links = HashSet::new();
    for fixture in fixtures {
        if !ids.insert(&fixture.fixture_id)
            || !links.insert((fixture.match_id.as_str(), fixture.source_event_id))
        {
            return Err(IntelligenceError::Fixture(
                "duplicate fixture identity or source",
            ));
        }
        let m = moments
            .iter()
            .find(|m| {
                m.source_event_id == fixture.source_event_id && m.match_id == fixture.match_id
            })
            .ok_or(IntelligenceError::Fixture(
                "fixture source is not an eligible moment",
            ))?;
        validate_fixture(fixture, m, events)?;
    }
    let mut catalog = IntelligenceCatalog::default();
    for moment in moments {
        let Some(fixture) = fixtures
            .iter()
            .find(|f| f.source_event_id == moment.source_event_id && f.match_id == moment.match_id)
        else {
            catalog.unlinked_moment_ids.push(moment.moment_id);
            continue;
        };
        let report = simulate(fixture.request.clone())
            .map_err(|e| IntelligenceError::Simulation(e.to_string()))?;
        let insight_id = format!(
            "{}:{MATCH_VERSION}:{INTELLIGENCE_VERSION}:{}",
            moment.match_id, fixture.fixture_id
        );
        let trace_namespace = format!("{insight_id}/{SCENARIO_VERSION}");
        let scoped = |id: &str| format!("{trace_namespace}/{id}");
        let corrected = report.recommended_trace_id.as_ref().and_then(|id| {
            report
                .alternatives
                .iter()
                .filter_map(|a| a.trace.as_ref())
                .find(|t| &t.id == id)
        });
        let possession_label = |retained| {
            if retained {
                "with friendly possession"
            } else {
                "without friendly possession"
            }
        };
        let summary = if let (Some(action), Some(trace)) =
            (report.recommended_correction, corrected)
        {
            format!("In the authored scenario, {} ended {}; {} ended {} and improved the modeled tactical objective. This does not guarantee a real match outcome.",
                report.input.initial_state.current_action.id().replace('_', " "), possession_label(report.baseline.evaluation.friendly_possession),
                action.id().replace('_', " "), possession_label(trace.evaluation.friendly_possession))
        } else {
            format!("In the authored scenario, {} ended {}. No strictly better feasible correction was found; the model does not support a change recommendation.",
                report.input.initial_state.current_action.id().replace('_', " "), possession_label(report.baseline.evaluation.friendly_possession))
        };
        let mut source_event_ids = moment.supporting_event_ids.clone();
        source_event_ids.push(moment.source_event_id);
        let observed_event_facts = source_event_ids
            .iter()
            .map(|id| {
                events
                    .iter()
                    .find(|e| e.id == *id)
                    .expect("validated source")
                    .clone()
            })
            .collect();
        let headline = match moment.moment_kind {
            MomentKind::AttackingTurnover => {
                "Attacking possession lost: compare the linked alternatives"
            }
            MomentKind::DecisionUnderPressure => {
                "Pressure on the ball carrier: inspect the next decision"
            }
        }
        .into();
        let opponent_decision_event_ids = std::iter::once(&report.baseline)
            .chain(corrected)
            .flat_map(|t| &t.events)
            .filter(|e| {
                matches!(
                    e.evidence,
                    reactcoach_decision_engine::simulation::EventKind::OpponentDecision { .. }
                )
            })
            .map(|e| scoped(&e.id))
            .collect();
        let mut limitations = report.limitations.clone();
        limitations.push("This counterfactual is an authored synthetic scenario, not recovered match tracking or a real success probability. A missing correction means no strictly better feasible branch was found.".into());
        let insight = TacticalInsight {
            schema_version: INTELLIGENCE_VERSION.into(),
            insight_id,
            match_id: moment.match_id.clone(),
            moment_id: moment.moment_id.clone(),
            source_event_ids,
            event_timestamp: moment.event_timestamp,
            insight_kind: moment.moment_kind,
            headline,
            significance_reason: moment.detection_reason.clone(),
            observed_event_facts,
            detected_statistics: moment.detected_statistics.clone(),
            synthetic_scenario_assumptions: fixture.assumptions.clone(),
            scenario_fixture_id: fixture.fixture_id.clone(),
            scenario_version: report.scenario_version.clone(),
            fixture_relation: fixture.relation,
            original_action: report.input.initial_state.current_action,
            recommended_action: report.recommended_correction,
            baseline_trace_id: scoped(&report.baseline.id),
            corrected_trace_id: corrected.map(|t| scoped(&t.id)),
            comparison_evidence: ComparisonEvidence {
                baseline: report.baseline.evaluation.clone(),
                corrected: corrected.map(|t| t.evaluation.clone()),
                summary,
                reason: report.comparison_reason.clone(),
                opponent_decision_event_ids,
            },
            limitations,
            provenance: Provenance {
                match_version: MATCH_VERSION.into(),
                fixture_version: FIXTURE_VERSION.into(),
                detector_version: INTELLIGENCE_VERSION.into(),
                engine_version: SCENARIO_VERSION.into(),
                fictional: true,
                geometry_authored: true,
            },
        };
        catalog.details.push(InsightDetail {
            insight,
            moment,
            fixture: fixture.clone(),
            trace_namespace,
            simulation: report,
        });
    }
    Ok(catalog)
}
