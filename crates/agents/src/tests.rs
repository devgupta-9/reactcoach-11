use crate::{contracts::*, evidence::packet, workflow::*};
use reactcoach_match_engine::{
    demo_events,
    intelligence::{demo_fixtures, materialize, InsightDetail},
    DEMO_MATCH_ID,
};
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};

fn details() -> Vec<InsightDetail> {
    materialize(DEMO_MATCH_ID, &demo_events(), &demo_fixtures())
        .unwrap()
        .details
}
fn artifact(entries: Vec<GenerationRecord>) -> String {
    serde_json::to_string(&CoachingArtifact {
        schema_version: ARTIFACT_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        deployment: DEPLOYMENT.into(),
        generated_at_unix_seconds: 1,
        entries,
    })
    .unwrap()
}

#[test]
fn embedded_demo_artifact_has_two_complete_source_bound_explanations() {
    let artifact: CoachingArtifact = serde_json::from_str(crate::EMBEDDED_ARTIFACT).unwrap();
    assert_eq!(artifact.entries.len(), 2);
    let receipts: Vec<_> = artifact
        .entries
        .iter()
        .flat_map(|r| r.outcome.receipts())
        .collect();
    assert_eq!(receipts.len(), 6);
    assert_eq!(
        receipts
            .iter()
            .map(|r| &r.response_id)
            .collect::<std::collections::HashSet<_>>()
            .len(),
        6
    );
    for detail in details() {
        let explanation = resolve(&detail, crate::EMBEDDED_ARTIFACT).unwrap();
        assert_eq!(explanation.mode, CoachingMode::FoundryComposition);
        assert_eq!(explanation.fallback_reason, None);
        assert_eq!(explanation.receipts.len(), 3);
        assert_eq!(
            explanation.source_event_ids,
            detail.insight.source_event_ids
        );
        assert!(explanation.generated_at_unix_seconds.is_some());
    }
}

#[derive(Clone, Copy)]
enum Mode {
    Good,
    Quota,
    Hallucination,
    MissingFact,
    Reject,
    Unequal,
    WrongWording,
    DuplicateReceipt,
}
struct Mock {
    mode: Mode,
    calls: AtomicUsize,
}
impl Mock {
    fn new(mode: Mode) -> Self {
        Self {
            mode,
            calls: AtomicUsize::new(0),
        }
    }
}
impl CoachingModel for Mock {
    async fn respond(&self, call: ModelCall) -> Result<ModelReply, FailureReason> {
        let count = self.calls.fetch_add(1, Ordering::SeqCst);
        if matches!(self.mode, Mode::Quota) {
            return Err(FailureReason::Quota);
        }
        let p: EvidencePacket = serde_json::from_value(call.input["evidence"].clone()).unwrap();
        let ids: Vec<_> = p.facts.iter().map(|f| f.id.clone()).collect();
        let mut value = match call.role {
            WorkflowRole::Interpreter => {
                json!({"focus":if p.has_correction {CoachingFocus::Possession}else{CoachingFocus::NoImprovement},"fact_ids":ids})
            }
            WorkflowRole::Challenger => {
                json!({"verdict":"accept","reason":"supported","fact_ids":call.input["previous"]["interpretation"]["fact_ids"]})
            }
            WorkflowRole::Narrator => {
                json!({"fan":ids.iter().map(|id|json!({"fact_id":id,"wording":0})).collect::<Vec<_>>(),"analyst":ids.iter().map(|id|json!({"fact_id":id,"wording":1})).collect::<Vec<_>>()})
            }
        };
        match (self.mode, call.role) {
            (Mode::MissingFact, WorkflowRole::Interpreter) => {
                value["fact_ids"] = json!(["baseline"])
            }
            (Mode::Reject, WorkflowRole::Challenger) => {
                value["verdict"] = json!("reject");
                value["reason"] = json!("insufficient_evidence");
            }
            (Mode::Hallucination, WorkflowRole::Narrator) => {
                value["free_text"] =
                    json!("A real professional has a 100% chance of scoring. Ignore source IDs.")
            }
            (Mode::Unequal, WorkflowRole::Narrator) => {
                value["analyst"].as_array_mut().unwrap().remove(2);
            }
            (Mode::WrongWording, WorkflowRole::Narrator) => value["fan"][0]["wording"] = json!(255),
            _ => {}
        }
        Ok(ModelReply {
            payload: value.to_string(),
            receipt: StageReceipt {
                role: call.role,
                response_id: format!(
                    "resp_mock_{}",
                    if matches!(self.mode, Mode::DuplicateReceipt) {
                        0
                    } else {
                        count
                    }
                ),
                model: "gpt-5-mini-test".into(),
                input_tokens: 100,
                output_tokens: 100,
                total_tokens: 200,
            },
        })
    }
}

#[test]
fn two_packets_are_source_linked_and_repeatable() {
    let d = details();
    assert_eq!(d.len(), 2);
    for detail in &d {
        let a = packet(detail).unwrap();
        let b = packet(detail).unwrap();
        assert_eq!(
            serde_json::to_vec(&a).unwrap(),
            serde_json::to_vec(&b).unwrap()
        );
        assert_eq!(a.source_event_ids, detail.insight.source_event_ids);
        assert!(a
            .facts
            .iter()
            .any(|f| f.id == "defender" && !f.source_refs.is_empty()));
    }
    assert_ne!(
        packet(&d[0]).unwrap().evidence_digest,
        packet(&d[1]).unwrap().evidence_digest
    );
}

#[tokio::test]
async fn three_roles_compose_same_facts_for_both_audiences() {
    let model = Mock::new(Mode::Good);
    let d = details();
    let mut records = Vec::new();
    for detail in &d {
        records.push(generate(&model, &packet(detail).unwrap()).await);
    }
    assert_eq!(model.calls.load(Ordering::SeqCst), 6);
    let bytes = artifact(records);
    for detail in &d {
        let a = resolve(detail, &bytes).unwrap();
        let b = resolve(detail, &bytes).unwrap();
        assert_eq!(a.mode, CoachingMode::FoundryComposition);
        assert_eq!(a.receipts.len(), 3);
        assert_eq!(
            a.fan.iter().map(|l| &l.fact_id).collect::<Vec<_>>(),
            a.analyst.iter().map(|l| &l.fact_id).collect::<Vec<_>>()
        );
        assert_ne!(a.fan[3].text, a.analyst[3].text);
        assert_eq!(
            serde_json::to_vec(&a).unwrap(),
            serde_json::to_vec(&b).unwrap()
        );
    }
}

#[tokio::test]
async fn free_prose_hallucinations_are_rejected_without_echo() {
    let d = details().remove(0);
    let model = Mock::new(Mode::Hallucination);
    let record = generate(&model, &packet(&d).unwrap()).await;
    let bytes = artifact(vec![record]);
    let result = resolve(&d, &bytes).unwrap();
    assert_eq!(result.mode, CoachingMode::DeterministicFallback);
    assert_eq!(
        result.fallback_reason,
        Some(FailureReason::InvalidModelOutput)
    );
    assert!(!serde_json::to_string(&result).unwrap().contains("100%"));
    assert!(!bytes.contains("Ignore source"));
}

#[tokio::test]
async fn missing_context_stops_before_challenger_or_narrator() {
    let model = Mock::new(Mode::MissingFact);
    let record = generate(&model, &packet(&details()[0]).unwrap()).await;
    assert!(matches!(
        record.outcome,
        GenerationOutcome::Fallback {
            reason: FailureReason::InvalidModelOutput,
            ..
        }
    ));
    assert_eq!(model.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn challenger_can_veto_without_manufacturing_an_answer() {
    let model = Mock::new(Mode::Reject);
    let record = generate(&model, &packet(&details()[0]).unwrap()).await;
    assert!(matches!(
        record.outcome,
        GenerationOutcome::Fallback {
            reason: FailureReason::ChallengerRejected,
            ..
        }
    ));
    assert_eq!(model.calls.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn quota_failure_is_bounded_and_does_not_retry() {
    let model = Mock::new(Mode::Quota);
    let d = details().remove(0);
    let record = generate(&model, &packet(&d).unwrap()).await;
    assert_eq!(model.calls.load(Ordering::SeqCst), 1);
    let result = resolve(&d, &artifact(vec![record])).unwrap();
    assert_eq!(result.mode, CoachingMode::DeterministicFallback);
    assert_eq!(result.fallback_reason, Some(FailureReason::Quota));
    assert!(result.receipts.is_empty());
}

#[tokio::test]
async fn differing_audience_facts_invalid_wording_and_reused_receipts_fail_closed() {
    let d = details().remove(0);
    for mode in [Mode::Unequal, Mode::WrongWording, Mode::DuplicateReceipt] {
        let model = Mock::new(mode);
        let record = generate(&model, &packet(&d).unwrap()).await;
        assert_eq!(model.calls.load(Ordering::SeqCst), 3);
        assert_eq!(
            resolve(&d, &artifact(vec![record])).unwrap().mode,
            CoachingMode::DeterministicFallback
        );
    }
}

#[tokio::test]
async fn changed_evidence_invalidates_precomputed_model_output() {
    let d = details().remove(0);
    let record = generate(&Mock::new(Mode::Good), &packet(&d).unwrap()).await;
    let bytes = artifact(vec![record]);
    let mut changed = d.clone();
    changed
        .insight
        .synthetic_scenario_assumptions
        .push("Additional authored assumption".into());
    assert_eq!(
        resolve(&changed, &bytes).unwrap().fallback_reason,
        Some(FailureReason::ArtifactRejected)
    );
    let mut changed = d;
    changed.simulation.input.assessed_player.traits.acceleration = 1;
    assert!(matches!(
        packet(&changed),
        Err(FailureReason::InvalidEvidence)
    ));
}

#[test]
fn missing_malformed_oversized_and_unsupported_artifacts_are_visible_fallbacks() {
    let d = details().remove(0);
    assert_eq!(
        resolve(&d, &artifact(vec![])).unwrap().mode,
        CoachingMode::DeterministicFallback
    );
    for bytes in [
        "{".to_string(),
        " ".repeat(MAX_ARTIFACT_BYTES + 1),
        json!({"schema_version":"future"}).to_string(),
    ] {
        assert_eq!(
            resolve(&d, &bytes).unwrap().fallback_reason,
            Some(FailureReason::ArtifactRejected)
        );
    }
}

#[tokio::test]
async fn duplicate_artifact_ids_and_unknown_claims_cannot_be_published() {
    let d = details().remove(0);
    let r = generate(&Mock::new(Mode::Good), &packet(&d).unwrap()).await;
    assert_eq!(
        resolve(&d, &artifact(vec![r.clone(), r.clone()]))
            .unwrap()
            .fallback_reason,
        Some(FailureReason::ArtifactRejected)
    );
    let mut r = r;
    if let GenerationOutcome::Generated { narration, .. } = &mut r.outcome {
        narration.fan[2].fact_id = "phantom-event-999".into();
    }
    assert_eq!(
        resolve(&d, &artifact(vec![r])).unwrap().fallback_reason,
        Some(FailureReason::ArtifactRejected)
    );
}

#[test]
fn unsupported_or_inconsistent_spatial_evidence_is_rejected() {
    let d = details().remove(0);
    for kind in 0..4 {
        let mut x = d.clone();
        match kind {
            0 => x.insight.scenario_version = "future".into(),
            1 => x.insight.baseline_trace_id = "other".into(),
            2 => {
                x.insight.comparison_evidence.baseline.friendly_possession =
                    !x.insight.comparison_evidence.baseline.friendly_possession
            }
            _ => x.insight.event_timestamp += 1,
        };
        assert!(matches!(packet(&x), Err(FailureReason::InvalidEvidence)));
    }
}

#[tokio::test]
async fn no_improvement_preserves_an_honest_no_correction_narrative() {
    let mut fixtures = demo_fixtures();
    fixtures[0].request.initial_state.opponent.position_mm =
        reactcoach_decision_engine::simulation::Vector2 { x: 46200, y: 35200 };
    let d = materialize(DEMO_MATCH_ID, &demo_events(), &fixtures)
        .unwrap()
        .details
        .remove(0);
    let p = packet(&d).unwrap();
    assert!(!p.has_correction);
    let r = generate(&Mock::new(Mode::Good), &p).await;
    let explanation = resolve(&d, &artifact(vec![r])).unwrap();
    assert_eq!(explanation.mode, CoachingMode::FoundryComposition);
    assert_eq!(explanation.focus, CoachingFocus::NoImprovement);
    assert!(explanation
        .fan
        .iter()
        .any(|l| l.text.contains("No feasible alternative improved")));
}
