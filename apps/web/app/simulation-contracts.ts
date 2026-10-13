import type { TacticalAction, TacticalEvaluation } from "./match-contracts";

export type Vector2 = { x: number; y: number };
export type Participant = "assessed" | "opponent" | "teammate";
export type SpatialProfile = {
  id: string; label: string; description: string; synthetic: boolean;
  traits: Record<"acceleration" | "technique" | "passing" | "finishing" | "anticipation" | "positioning" | "reactions" | "goalkeeping" | "composure", number>;
};
export type PlayerState = { position_mm: Vector2; velocity_mm_s: Vector2 };
export type SimulationState = {
  elapsed_ms: number; assessed: PlayerState; opponent: PlayerState; teammate: PlayerState | null;
  ball: {
    position_mm: Vector2; velocity_mm_s: Vector2;
    possession: { kind: "owned"; owner: Participant } | { kind: "in_flight"; from: Participant; to: Participant; target_mm: Vector2 } | { kind: "loose" };
  };
  current_action: TacticalAction;
};
export type SimulationEvent = {
  id: string; elapsed_ms: number;
  evidence:
    | { kind: "action_selected"; action: TacticalAction }
    | { kind: "adaptation"; action: TacticalAction; feasible: boolean; reason: string }
    | { kind: "opponent_decision"; observed_action: TacticalAction; chosen_response_id: string; target_mm: Vector2 }
    | { kind: "pass_released"; from: Participant; to: Participant; target_mm: Vector2 }
    | { kind: "possession_changed"; owner: Participant | null; reason: string };
};
export type SimulationTrace = {
  id: string; corrective_action: TacticalAction | null; correction_applied: boolean;
  events: SimulationEvent[]; steps: { id: string; state: SimulationState }[]; evaluation: TacticalEvaluation;
};
export type SimulationReport = {
  scenario_version: "open_play_spatial_v1";
  input: {
    assessed_player: SpatialProfile; opponent: SpatialProfile; supporting_teammate: SpatialProfile | null;
    initial_state: SimulationState;
    config: { pitch: { length_mm: number; width_mm: number }; tick_ms: number; duration_ms: number; adaptation_at_ms: number };
  };
  baseline: SimulationTrace;
  alternatives: { action: TacticalAction; feasible_at_adaptation: boolean; reason: string; trace: SimulationTrace | null }[];
  recommended_correction: TacticalAction | null; recommended_trace_id: string | null;
  comparison_reason: string; assumptions: string[]; limitations: string[];
};
export function actionLabel(action: TacticalAction) {
  return { direct_dribble: "Direct dribble", wide_left: "Move into the left channel", wide_right: "Move into the right channel", release_pass: "Release the pass", one_two: "Play a one-two", retain: "Retain and reset" }[action];
}
export function responseLabel(id: string) { return id.replaceAll("_", " "); }
