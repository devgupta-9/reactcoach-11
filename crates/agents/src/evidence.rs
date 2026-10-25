use crate::contracts::*;
use reactcoach_decision_engine::simulation::EventKind;
use reactcoach_match_engine::intelligence::{
    FixtureRelation, InsightDetail, MomentKind, FIXTURE_VERSION, INTELLIGENCE_VERSION,
    MATCH_VERSION,
};
use sha2::{Digest, Sha256};

pub fn fingerprint(value: &impl serde::Serialize) -> String {
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("typed evidence serializes"))
    )
}

fn fact(
    id: &str,
    kind: EvidenceKind,
    source_refs: Vec<String>,
    fan: [String; 2],
    analyst: [String; 2],
    mandatory: bool,
) -> EvidenceFact {
    EvidenceFact {
        id: id.into(),
        kind,
        source_refs,
        fan,
        analyst,
        mandatory,
    }
}

pub fn packet(detail: &InsightDetail) -> Result<EvidencePacket, FailureReason> {
    let i = &detail.insight;
    let s = &detail.simulation;
    let scoped = |id: &str| format!("{}/{id}", detail.trace_namespace);
    let mut source_ids = detail.moment.supporting_event_ids.clone();
    source_ids.push(detail.moment.source_event_id);
    let corrected = s.recommended_trace_id.as_ref().and_then(|id| {
        s.alternatives
            .iter()
            .filter_map(|a| a.trace.as_ref())
            .find(|t| &t.id == id)
    });
    if i.schema_version != INTELLIGENCE_VERSION
        || i.scenario_version != "open_play_spatial_v1"
        || detail.moment.schema_version != INTELLIGENCE_VERSION
        || detail.fixture.schema_version != FIXTURE_VERSION
        || i.provenance.match_version != MATCH_VERSION
        || i.provenance.fixture_version != FIXTURE_VERSION
        || i.provenance.detector_version != INTELLIGENCE_VERSION
        || i.provenance.engine_version != "open_play_spatial_v1"
        || !i.provenance.fictional
        || !i.provenance.geometry_authored
        || format!("{}/{}", i.insight_id, i.scenario_version) != detail.trace_namespace
        || i.match_id != detail.moment.match_id
        || i.match_id != detail.fixture.match_id
        || i.scenario_fixture_id != detail.fixture.fixture_id
        || i.insight_kind != detail.moment.moment_kind
        || i.insight_kind != detail.fixture.moment_kind
        || i.fixture_relation != detail.fixture.relation
        || i.event_timestamp != detail.fixture.event_timestamp
        || detail.moment.source_event_id != detail.fixture.source_event_id
        || i.event_timestamp != detail.moment.event_timestamp
        || i.source_event_ids != source_ids
        || i.source_event_ids.is_empty()
        || !s.input.assessed_player.synthetic
        || !s.input.opponent.synthetic
        || s.input
            .supporting_teammate
            .as_ref()
            .is_some_and(|p| !p.synthetic)
        || i.observed_event_facts.len() != i.source_event_ids.len()
        || i.observed_event_facts.iter().any(|e| {
            e.timestamp_seconds > i.event_timestamp
                || !e.position.x.is_finite()
                || !e.position.y.is_finite()
                || !(0.0..=100.0).contains(&e.position.x)
                || !(0.0..=100.0).contains(&e.position.y)
        })
        || i.source_event_ids.iter().any(|id| {
            i.observed_event_facts
                .iter()
                .filter(|e| e.id == *id && e.match_id.as_deref() == Some(i.match_id.as_str()))
                .count()
                != 1
        })
        || !i.observed_event_facts.iter().any(|e| {
            e.id == detail.moment.source_event_id && e.timestamp_seconds == i.event_timestamp
        })
        || !i.observed_event_facts.iter().any(|e| {
            e.id == detail.moment.source_event_id
                && matches!(
                    (i.insight_kind, e.kind),
                    (
                        MomentKind::AttackingTurnover,
                        reactcoach_shared::EventKind::Turnover
                    ) | (
                        MomentKind::DecisionUnderPressure,
                        reactcoach_shared::EventKind::Pressure
                    )
                )
        })
        || i.original_action != s.input.initial_state.current_action
        || i.baseline_trace_id != scoped(&s.baseline.id)
        || i.comparison_evidence.baseline != s.baseline.evaluation
        || i.recommended_action != s.recommended_correction
        || i.corrected_trace_id != s.recommended_trace_id.as_ref().map(|id| scoped(id))
        || i.comparison_evidence.corrected.as_ref() != corrected.map(|t| &t.evaluation)
        || i.recommended_action.is_some() != corrected.is_some()
        || s.baseline.steps.is_empty()
        || serde_json::to_value(&detail.fixture.request).ok() != serde_json::to_value(&s.input).ok()
    {
        return Err(FailureReason::InvalidEvidence);
    }
    if let Some(c) = corrected {
        if c.corrective_action != i.recommended_action
            || !c.correction_applied
            || c.evaluation.objective_key <= s.baseline.evaluation.objective_key
            || c.steps.is_empty()
            || serde_json::to_value(&c.steps[0].state).ok()
                != serde_json::to_value(&s.baseline.steps[0].state).ok()
        {
            return Err(FailureReason::InvalidEvidence);
        }
    }
    let event_refs: Vec<_> = i
        .source_event_ids
        .iter()
        .map(|id| format!("match-event/{}/{id}", i.match_id))
        .collect();
    let original = action_name(i.original_action);
    let observed = match i.insight_kind {
        MomentKind::AttackingTurnover => {
            "The fictional event log records an attacker losing possession."
        }
        MomentKind::DecisionUnderPressure => {
            "The fictional event log records opposing pressure on the attacker."
        }
    };
    let relation = match i.fixture_relation {
        FixtureRelation::HypotheticalPrecursor => "This linked scenario explores a hypothetical precursor to the turnover, not a tracking reconstruction.",
        FixtureRelation::AuthoredDecisionPoint => "This is an authored decision point linked to the pressure event, not observed player movement.",
    };
    let base = &s.baseline.evaluation;
    let friendly = |retained| {
        if retained {
            "with friendly possession"
        } else {
            "without friendly possession"
        }
    };
    let mut counter_ids = Vec::new();
    let mut counter_refs = Vec::new();
    for event in &s.baseline.events {
        if let EventKind::OpponentDecision {
            chosen_response_id,
            options,
            ..
        } = &event.evidence
        {
            if !options
                .iter()
                .any(|o| o.id == *chosen_response_id && o.feasible)
            {
                return Err(FailureReason::InvalidEvidence);
            }
            counter_ids.push(chosen_response_id.replace('_', " "));
            counter_refs.push(scoped(&event.id));
        }
    }
    if counter_ids.is_empty() {
        return Err(FailureReason::InvalidEvidence);
    }
    let counters = counter_ids.join("; then ");
    let correction = match (i.recommended_action, corrected) {
        (Some(action), Some(trace)) => format!("The simulator supports comparing {}: it ended {} and improved the configured objective.", action_name(action), friendly(trace.evaluation.friendly_possession)),
        (None, None) => "No feasible alternative improved the configured objective; the model does not support a corrective recommendation among these options.".into(),
        _ => return Err(FailureReason::InvalidEvidence),
    };
    let mut comparison_refs = vec![i.baseline_trace_id.clone()];
    if let Some(id) = &i.corrected_trace_id {
        comparison_refs.push(id.clone());
    }
    let objective = format!("Lexicographic objective (friendly possession, defender bypass, metre-bucketed progress, capped clearance): baseline {:?}; corrected {:?}.", base.objective_key, corrected.map(|t| t.evaluation.objective_key));
    let mut facts = vec![
        fact("observed", EvidenceKind::ObservedFictionalEvent, event_refs,
            [observed.into(), format!("What the fictional records show: {}", observed.to_lowercase())],
            [format!("At {} seconds, source events {:?}: {observed}", i.event_timestamp, i.source_event_ids), format!("Logged event evidence at {}s ({:?}): {observed}", i.event_timestamp, i.source_event_ids)], true),
        fact("authored", EvidenceKind::AuthoredScenario, vec![format!("{}/fixture", i.insight_id)],
            [format!("{relation} Positions and ratings are synthetic and uncalibrated."), format!("Positions and ratings were authored and are uncalibrated. {relation}")],
            [format!("Fixture {} ({:?}): {relation} Synthetic ratings are not physical measurements.", i.scenario_fixture_id, i.fixture_relation), format!("Scenario {} uses authored geometry and uncalibrated profiles. {relation}", i.scenario_fixture_id)], true),
        fact("defender", EvidenceKind::SimulationResult, counter_refs,
            [format!("Against the original continuation, the modeled defender selected: {counters}."), format!("The defender's simulated response sequence was: {counters}.")],
            [format!("Baseline opponent-decision events select [{counters}]."), format!("Recorded baseline defensive counters: {counters}; these are simulated choices.")], true),
        fact("baseline", EvidenceKind::SimulationResult, vec![i.baseline_trace_id.clone()],
            [format!("Continuing {original} ended {} in the model.", friendly(base.friendly_possession)), format!("The original {original} continuation finished {} in this authored situation.", friendly(base.friendly_possession))],
            [format!("Baseline action {original}: friendly_possession={}, bypassed_defender={}.", base.friendly_possession, base.bypassed_defender), format!("Original branch ({original}) ends {} with defender bypass={}.", friendly(base.friendly_possession), base.bypassed_defender)], true),
        fact("correction", EvidenceKind::SimulationResult, comparison_refs.clone(),
            [correction.clone(), format!("Model comparison: {correction}")],
            [format!("{correction} Comparison uses cloned initial world states."), format!("Under identical starting inputs: {correction}")], true),
        fact("objective", EvidenceKind::SimulationResult, comparison_refs,
            ["The comparison prioritizes keeping possession, then bypassing the defender, forward progress and clearance.".into(), "Possession comes first in this model; bypass, progress and clearance break subsequent ties.".into()],
            [objective.clone(), format!("Deterministic comparison, not a probability: {objective}")], true),
        fact("support", EvidenceKind::AuthoredScenario, vec![format!("{}/simulation/input", i.insight_id)],
            if s.input.supporting_teammate.is_some() { ["This authored situation includes a supporting teammate.".into(), "A supporting teammate is available in this synthetic setup.".into()] } else { ["No supporting teammate is available in this scenario.".into(), "This authored setup has no supporting teammate.".into()] },
            [format!("Supporting teammate present: {}. This is scenario input, not observed tracking.", s.input.supporting_teammate.is_some()), format!("Authored supporting-teammate availability: {}.", s.input.supporting_teammate.is_some())], false),
        fact("limits", EvidenceKind::ModelLimitation, vec![format!("{}/limitations", i.insight_id)],
            ["This synthetic comparison predicts no real-match success probability and guarantees no outcome.".into(), "These modeled alternatives are not calibrated predictions or promises about a real player or match.".into()],
            ["Uncalibrated synthetic attributes; simplified ball transport and interception; horizon-bounded defensive feasibility. No calibrated success probability or real-athlete measurement.".into(), "The spatial model simplifies ball movement and defensive perception. Its objective is a synthetic index, not real-match success probability or measured human reflexes.".into()], true),
    ];
    // The model may omit optional context, but observed/authored/outcome/limits are mandatory.
    facts.shrink_to_fit();
    let mut packet = EvidencePacket {
        schema_version: COACHING_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        insight_id: i.insight_id.clone(),
        match_id: i.match_id.clone(),
        event_timestamp: i.event_timestamp,
        source_event_ids: i.source_event_ids.clone(),
        evidence_digest: String::new(),
        has_correction: corrected.is_some(),
        facts,
    };
    let policy: Vec<_> = [
        WorkflowRole::Interpreter,
        WorkflowRole::Challenger,
        WorkflowRole::Narrator,
    ]
    .into_iter()
    .map(|role| {
        (
            role,
            crate::workflow::instructions(role),
            role.output_cap(),
            crate::workflow::model_schema(role, &packet),
        )
    })
    .collect();
    packet.evidence_digest = fingerprint(&(
        detail,
        &packet,
        crate::workflow::SYSTEM_PROMPT,
        policy,
        DEPLOYMENT,
    ));
    if serde_json::to_vec(&packet).expect("typed packet").len() > 16 * 1024 {
        return Err(FailureReason::ResourceLimit);
    }
    Ok(packet)
}

pub fn action_name(action: reactcoach_decision_engine::simulation::TacticalAction) -> String {
    serde_json::to_value(action)
        .expect("action serializes")
        .as_str()
        .expect("action is enum")
        .replace('_', " ")
}
