"use client";

import { useEffect, useRef, useState } from "react";
import "./decision-lab.css";

type Scenario = "open_play" | "penalty" | "free_kick" | "offside";
type TraitName = "acceleration" | "technique" | "passing" | "finishing" | "anticipation" | "positioning" | "reactions" | "goalkeeping" | "composure";
type Traits = Record<TraitName, number>;
type PlayerProfile = { id: string; label: string; description: string; traits: Traits; synthetic: boolean };
type OpponentResponse = { id: string; label: string; explanation: string; effectiveness_index: number; opponent_dominant_trait: string; assessed_escape_trait: string };
type ActionAssessment = {
  id: string; label: string; decision_fit_index: number; player_fit_index: number;
  opponent_resistance_index: number; uncountered_fit_index: number; counter_suppression_points: number; chosen_opponent_response_id: string; opponent_responses: OpponentResponse[]; modeled_opponent_response: string;
  coaching_instruction: string; relevant_player_strength: string; opponent_vulnerability: string;
};
type MatchupReport = {
  scenario: Exclude<Scenario, "offside">; assessed_player: PlayerProfile; opponent: PlayerProfile;
  original_action_id: string; recommended_action_id: string; improvement_index_points: number;
  actions: ActionAssessment[]; explanation: string; limitations: string;
};
type OffsideResult = {
  position: "onside_position" | "offside_position";
  attacker_forward_edge: number; offside_line: number;
  explanation: string; rule_scope: string;
};
type OffsideDemo = { original: OffsideResult; corrected: OffsideResult; correction: string };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const modes: { id: Scenario; title: string; description: string }[] = [
  { id: "open_play", title: "Open play", description: "Attacker versus defender" },
  { id: "penalty", title: "Penalties", description: "Taker versus goalkeeper" },
  { id: "free_kick", title: "Free kicks", description: "Kicker versus defensive setup" },
  { id: "offside", title: "Offside timing", description: "Run versus defensive line" },
];
const labeledTraits: { key: TraitName; label: string }[] = [
  { key: "acceleration", label: "Acceleration" },
  { key: "technique", label: "Technique" },
  { key: "passing", label: "Passing" },
  { key: "finishing", label: "Finishing" },
  { key: "anticipation", label: "Anticipation" },
  { key: "positioning", label: "Positioning" },
  { key: "reactions", label: "Reactions" },
  { key: "goalkeeping", label: "Goalkeeping" },
  { key: "composure", label: "Composure" },
];

function ScoreBar({ score, muted = false }: { score: number; muted?: boolean }) {
  return <div className="rx-meter" aria-label={`Decision fit index ${score} out of 100`}><span className={muted ? "rx-meter-muted" : ""} style={{ width: `${score}%` }} /></div>;
}

export default function DecisionLab() {
  const [mode, setMode] = useState<Scenario>("open_play");
  const [report, setReport] = useState<MatchupReport | null>(null);
  const [offside, setOffside] = useState<OffsideDemo | null>(null);
  const [profiles, setProfiles] = useState<{ assessed_player: PlayerProfile; opponent: PlayerProfile } | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const evaluationController = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const path = mode === "offside"
      ? "/api/v1/offside/demo"
      : `/api/v1/decision-lab/demo?scenario=${mode}`;
    fetch(`${API_URL}${path}`, { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);
        return res.json();
      })
      .then((data: MatchupReport | OffsideDemo) => {
        if (controller.signal.aborted) return;
        if (mode === "offside") setOffside(data as OffsideDemo);
        else {
          const report = data as MatchupReport;
          setReport(report);
          setProfiles({ assessed_player: report.assessed_player, opponent: report.opponent });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unknown API error");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      evaluationController.current?.abort();
      evaluationController.current = null;
    };
  }, [mode]);

  function selectMode(next: Scenario) {
    if (next === mode) return;
    evaluationController.current?.abort();
    evaluationController.current = null;
    setRecalculating(false);
    setMode(next);
    setLoading(true);
    setReport(null);
    setOffside(null);
    setProfiles(null);
    setError(null);
  }

  function editTrait(player: "assessed_player" | "opponent", trait: TraitName, value: number) {
    setProfiles((previous) => previous && ({
      ...previous,
      [player]: {
        ...previous[player],
        traits: { ...previous[player].traits, [trait]: value },
      },
    }));
  }

  async function recalculate() {
    if (!report || !profiles || recalculating || mode === "offside") return;
    const controller = new AbortController();
    evaluationController.current = controller;
    setRecalculating(true);
    setError(null);
    try {
      const result = await fetch(`${API_URL}/api/v1/decision-lab/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: mode, ...profiles }),
        signal: controller.signal,
      });
      if (!result.ok) throw new Error(`Evaluation returned HTTP ${result.status}`);
      const updated = (await result.json()) as MatchupReport;
      if (!controller.signal.aborted) setReport(updated);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to recalculate");
    } finally {
      if (evaluationController.current === controller) {
        evaluationController.current = null;
        setRecalculating(false);
      }
    }
  }

  const original = report?.actions.find((item) => item.id === report.original_action_id);
  const best = report?.actions.find((item) => item.id === report.recommended_action_id);
  const pendingEdits = report && profiles && (["assessed_player", "opponent"] as const).some(
    (player) => labeledTraits.some(({ key }) => profiles[player].traits[key] !== report[player].traits[key]),
  );
  return (
    <section className="rx-lab" aria-labelledby="rx-title">
      <div className="rx-heading">
        <div><div className="eyebrow">CORE FEATURE · RUST DECISION ENGINE</div><h2 id="rx-title">Adaptive decision lab</h2><p>Compare strengths, challenge an opponent, and see the correction that fits this synthetic matchup.</p></div>
        <span className="rx-tag">SYNTHETIC / EXPLAINABLE</span>
      </div>
      <div className="rx-tabs" role="group" aria-label="Football situation">
        {modes.map((item) => <button key={item.id} type="button" className={`rx-tab ${mode === item.id ? "active" : ""}`} aria-pressed={mode === item.id} onClick={() => selectMode(item.id)}><strong>{item.title}</strong><small>{item.description}</small></button>)}
      </div>
      {loading && <div className="rx-message" role="status">Evaluating synthetic scenario...</div>}
      {error && <div className="rx-message rx-error" role="alert">{error}. Start the Rust API on port 8080 to use the decision lab.</div>}
      {mode === "offside" && offside && (
        <div className="rx-body">
          <div className="rx-section-title">Offside position — pass timing comparison</div>
          <div className="rx-comparison">
            <div className="rx-choice"><small>ORIGINAL RUN</small><h3>{offside.original.position.replaceAll("_", " ")}</h3><p>Attacker forward edge: {offside.original.attacker_forward_edge.toFixed(0)} / 100</p><p>{offside.original.explanation}</p></div>
            <div className="rx-choice rx-choice-best"><small>CORRECTED RUN</small><h3>{offside.corrected.position.replaceAll("_", " ")}</h3><p>Attacker forward edge: {offside.corrected.attacker_forward_edge.toFixed(0)} / 100</p><p>{offside.corrected.explanation}</p></div>
          </div>
          <div className="rx-explanation"><strong>Suggested correction</strong><p>{offside.correction}</p></div>
          <p className="rx-footnote">{offside.original.rule_scope} <a href="https://theifab.com/laws/latest/offside/" target="_blank" rel="noreferrer">IFAB Law 11</a></p>
        </div>
      )}
      {mode !== "offside" && report && profiles && (
        <div className="rx-body">
          <div className="rx-profile-grid">
            <div className="rx-profile"><small>ASSESSED PLAYER</small><h3>{profiles.assessed_player.label}</h3><p>{profiles.assessed_player.description}</p>
              <div className="rx-traits">{labeledTraits.map(({ key, label }) => <label key={key} className="rx-trait"><span>{label}<b>{profiles.assessed_player.traits[key]}</b></span><input type="range" min={0} max={100} value={profiles.assessed_player.traits[key]} disabled={recalculating} onChange={(event) => editTrait("assessed_player", key, Number(event.target.value))} aria-label={`Assessed player ${label}`} /></label>)}</div>
            </div>
            <div className="rx-profile"><small>OPPOSING PLAYER</small><h3>{profiles.opponent.label}</h3><p>{profiles.opponent.description}</p>
              <div className="rx-traits">{labeledTraits.map(({ key, label }) => <label key={key} className="rx-trait"><span>{label}<b>{profiles.opponent.traits[key]}</b></span><input type="range" min={0} max={100} value={profiles.opponent.traits[key]} disabled={recalculating} onChange={(event) => editTrait("opponent", key, Number(event.target.value))} aria-label={`Opponent ${label}`} /></label>)}</div>
            </div>
          </div>
          <div className="rx-actions">
            <button type="button" onClick={() => void recalculate()} disabled={recalculating}>{recalculating ? "Evaluating..." : "Recalculate with these strengths →"}</button>
            <span>All ratings are editable synthetic assumptions. Recalculation reruns the same Rust model.</span>
          </div>
          {pendingEdits && <p className="rx-footnote" role="status">Ratings changed. Recalculate to update the recommendation; displayed results use the last evaluated ratings.</p>}
          <div className="rx-section-title">Original decision vs. recommended correction</div>
          <div className="rx-comparison">
            {original && <div className="rx-choice"><small>ORIGINAL ACTION</small><h3>{original.label}</h3><div className="rx-score">{original.decision_fit_index}<span>/100 fit index</span></div><ScoreBar score={original.decision_fit_index} muted /><p><strong>Opponent response: </strong>{original.modeled_opponent_response}</p></div>}
            {best && <div className="rx-choice rx-choice-best"><small>HIGHEST-FIT OPTION</small><h3>{best.label}</h3><div className="rx-score">{best.decision_fit_index}<span>/100 fit index</span></div><ScoreBar score={best.decision_fit_index} /><p>{best.coaching_instruction}</p></div>}
          </div>
          <div className="rx-gain"><strong>{report.improvement_index_points > 0 ? "+" : ""}{report.improvement_index_points} fit-index points</strong><span>Model comparison, not probability of success</span></div>
          <div className="rx-response-review">
            <div className="rx-section-title">Opponent best-response review</div>
            <p>For each attacking decision, the synthetic opponent evaluates two counters and selects the most effective option for their profile. These are relative fitness indices, not match probabilities.</p>
            {best && <div className="rx-counter-grid">{best.opponent_responses.map((response) => (
              <article key={response.id} className={`rx-counter ${response.id === best.chosen_opponent_response_id ? "selected" : ""}`}>
                <small>{response.id === best.chosen_opponent_response_id ? "SELECTED COUNTER" : "ALTERNATIVE COUNTER"}</small>
                <h4>{response.label}</h4>
                <div className="rx-score">{response.effectiveness_index}<span>/100 response fit</span></div>
                <ScoreBar score={response.effectiveness_index} muted={response.id !== best.chosen_opponent_response_id} />
                <p>{response.explanation}</p>
                <small>Primary opponent trait: {response.opponent_dominant_trait.replaceAll("_", " ")} · Attacker escape trait: {response.assessed_escape_trait.replaceAll("_", " ")}</small>
              </article>
            ))}</div>}
            {best && <p className="rx-response-impact">Before counter: {best.uncountered_fit_index} · Counter suppression: −{best.counter_suppression_points} index points · Final: {best.decision_fit_index}</p>}
          </div>
          <div className="rx-explanation"><strong>Why the recommendation changes</strong><p>{report.explanation}</p><p><strong>Opponent&apos;s modeled response:</strong> {best?.modeled_opponent_response}</p></div>
          <div className="rx-alternatives"><small>ALL MODELED ACTIONS</small>{report.actions.map((a) => <div key={a.id}><span>{a.label}</span><strong>{a.decision_fit_index}/100</strong></div>)}</div>
          <p className="rx-footnote">{report.limitations}</p>
        </div>
      )}
    </section>
  );
}
