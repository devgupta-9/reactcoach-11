export type Team = "home" | "away";
export type EventKind = "kick_off" | "pass" | "shot" | "goal" | "tackle" | "turnover" | "full_time" | "carry" | "pressure" | "interception";
export type MatchEvent = { id: number; timestamp_seconds: number; team: Team; kind: EventKind; player: string; position: { x: number; y: number } };
export type MatchStatistics = { home_passes: number; away_passes: number; home_shots: number; away_shots: number; home_actions: number; away_actions: number; home_action_share_pct: number; away_action_share_pct: number };
export type MatchSnapshot = { match_id: string; elapsed_seconds: number; score: { home: number; away: number }; statistics: MatchStatistics; events_processed: number; latest_event: MatchEvent | null };
export type TacticalAction = "direct_dribble" | "wide_left" | "wide_right" | "release_pass" | "one_two" | "retain";
export type TacticalEvaluation = { friendly_possession: boolean; bypassed_defender: boolean; forward_ball_progress_mm: number; defender_clearance_mm: number; objective_key: [boolean, boolean, number, number] };
export type TacticalInsight = {
  schema_version: "tactical_intelligence_v1"; insight_id: string; moment_id: string; match_id: string;
  event_timestamp: number; insight_kind: "attacking_turnover" | "decision_under_pressure";
  headline: string; significance_reason: string; source_event_ids: number[]; observed_event_facts: MatchEvent[];
  synthetic_scenario_assumptions: string[]; scenario_fixture_id: string; scenario_version: string;
  fixture_relation: "hypothetical_precursor" | "authored_decision_point";
  original_action: TacticalAction; recommended_action: TacticalAction | null;
  baseline_trace_id: string; corrected_trace_id: string | null;
  comparison_evidence: { baseline: TacticalEvaluation; corrected: TacticalEvaluation | null; summary: string; reason: string; opponent_decision_event_ids: string[] };
  limitations: string[];
};
export type CoachingExplanation = {
  schema_version: "coaching_v1";
  insight_id: string;
  explanation_id: string;
  evidence_digest: string;
  mode: "foundry_composition" | "deterministic_fallback";
  delivery: "precomputed";
  fallback_reason: string | null;
  generated_at_unix_seconds: number | null;
  fan: CoachingLine[];
  analyst: CoachingLine[];
};
type CoachingLine = {
  fact_id: string;
  kind: "observed_fictional_event" | "authored_scenario" | "simulation_result" | "model_limitation";
  text: string;
  source_refs: string[];
};
export type InsightDetail = { insight: TacticalInsight; trace_namespace: string; simulation: import("./simulation-contracts").SimulationReport; coaching?: CoachingExplanation };
export const matchApi = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export function timecode(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`; }
