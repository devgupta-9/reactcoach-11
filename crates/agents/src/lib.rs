//! Evidence-grounded coaching. Paid generation is an explicit, optional backend job.
pub mod contracts;
pub mod evidence;
#[cfg(feature = "foundry")]
pub mod provider;
pub mod workflow;

#[cfg(test)]
mod tests;

pub const EMBEDDED_ARTIFACT: &str = include_str!("../fixtures/foundry-demo-v1.json");

// Legacy planning vocabulary retained for compatibility; workflow contains the active pipeline.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentRole {
    TacticalAnalyst,
    NarrativeWriter,
    AudiencePersonalizer,
    EvidenceValidator,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStep {
    pub role: AgentRole,
    pub description: String,
}

/// Describes planned handoffs, not an active AI or model invocation.
pub fn planned_workflow() -> Vec<AgentStep> {
    vec![
        AgentStep {
            role: AgentRole::TacticalAnalyst,
            description: "Interpret supplied deterministic analytics".into(),
        },
        AgentStep {
            role: AgentRole::NarrativeWriter,
            description: "Draft evidence-linked match narrative".into(),
        },
        AgentStep {
            role: AgentRole::AudiencePersonalizer,
            description: "Adapt tone and language for audience".into(),
        },
        AgentStep {
            role: AgentRole::EvidenceValidator,
            description: "Check claims against source event identifiers".into(),
        },
    ]
}

#[cfg(test)]
mod legacy_tests {
    use super::*;
    #[test]
    fn validator_is_final_step() {
        assert_eq!(
            planned_workflow().last().unwrap().role,
            AgentRole::EvidenceValidator
        );
    }
}
