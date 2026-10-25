use serde::{Deserialize, Serialize};

pub const COACHING_VERSION: &str = "coaching_v1";
pub const ARTIFACT_VERSION: &str = "foundry_coaching_artifact_v1";
pub const PROMPT_VERSION: &str = "evidence_composition_v1";
pub const DEPLOYMENT: &str = "reactcoach-coach";
pub const MAX_ARTIFACT_BYTES: usize = 256 * 1024;
pub const MAX_MODEL_RESPONSE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EvidenceKind {
    ObservedFictionalEvent,
    AuthoredScenario,
    SimulationResult,
    ModelLimitation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvidenceFact {
    pub id: String,
    pub kind: EvidenceKind,
    pub source_refs: Vec<String>,
    pub fan: [String; 2],
    pub analyst: [String; 2],
    pub mandatory: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvidencePacket {
    pub schema_version: String,
    pub prompt_version: String,
    pub insight_id: String,
    pub match_id: String,
    pub event_timestamp: u32,
    pub source_event_ids: Vec<u64>,
    pub evidence_digest: String,
    pub has_correction: bool,
    pub facts: Vec<EvidenceFact>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CoachingFocus {
    Possession,
    DefenderResponse,
    AvailableSpace,
    NoImprovement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Interpretation {
    pub focus: CoachingFocus,
    pub fact_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Accept,
    Reject,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChallengeReason {
    Supported,
    InsufficientEvidence,
    InconsistentSelection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Challenge {
    pub verdict: Verdict,
    pub reason: ChallengeReason,
    pub fact_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClauseChoice {
    pub fact_id: String,
    pub wording: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Narration {
    pub fan: Vec<ClauseChoice>,
    pub analyst: Vec<ClauseChoice>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowRole {
    Interpreter,
    Challenger,
    Narrator,
}
impl WorkflowRole {
    pub fn output_cap(self) -> u32 {
        match self {
            Self::Interpreter | Self::Challenger => 256,
            Self::Narrator => 768,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StageReceipt {
    pub role: WorkflowRole,
    pub response_id: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FailureReason {
    NotGenerated,
    ArtifactRejected,
    InvalidEvidence,
    InvalidModelOutput,
    ChallengerRejected,
    Authentication,
    ProviderUnavailable,
    Quota,
    RefusalOrIncomplete,
    ResourceLimit,
    UnsupportedConfiguration,
}
impl std::fmt::Display for FailureReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for FailureReason {}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case", deny_unknown_fields)]
pub enum GenerationOutcome {
    Generated {
        interpretation: Interpretation,
        challenge: Challenge,
        narration: Narration,
        receipts: Vec<StageReceipt>,
    },
    Fallback {
        reason: FailureReason,
        attempted_calls: u8,
        receipts: Vec<StageReceipt>,
    },
}
impl GenerationOutcome {
    pub fn receipts(&self) -> &[StageReceipt] {
        match self {
            Self::Generated { receipts, .. } | Self::Fallback { receipts, .. } => receipts,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GenerationRecord {
    pub insight_id: String,
    pub evidence_digest: String,
    pub outcome: GenerationOutcome,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CoachingArtifact {
    pub schema_version: String,
    pub prompt_version: String,
    pub deployment: String,
    pub generated_at_unix_seconds: u64,
    pub entries: Vec<GenerationRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CoachingMode {
    FoundryComposition,
    DeterministicFallback,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NarrativeLine {
    pub fact_id: String,
    pub kind: EvidenceKind,
    pub text: String,
    pub source_refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoachingExplanation {
    pub schema_version: String,
    pub insight_id: String,
    pub match_id: String,
    pub event_timestamp: u32,
    pub source_event_ids: Vec<u64>,
    pub explanation_id: String,
    pub evidence_digest: String,
    pub mode: CoachingMode,
    pub delivery: String,
    pub focus: CoachingFocus,
    pub fallback_reason: Option<FailureReason>,
    pub generated_at_unix_seconds: Option<u64>,
    pub fan: Vec<NarrativeLine>,
    pub analyst: Vec<NarrativeLine>,
    pub receipts: Vec<StageReceipt>,
}
