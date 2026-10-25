"use client";

import { useState } from "react";
import type { CoachingExplanation as Explanation } from "./match-contracts";
import "./coaching-explanation.css";

const evidenceLabels = {
  observed_fictional_event: "Event record",
  authored_scenario: "Authored scenario",
  simulation_result: "Simulation evidence",
  model_limitation: "Model limits",
};

function validLines(lines: Explanation["fan"]): boolean {
  return Array.isArray(lines) && lines.length > 0 && lines.length <= 8
    && lines.every(line => line && typeof line.fact_id === "string"
      && typeof line.text === "string" && Object.hasOwn(evidenceLabels, line.kind)
      && Array.isArray(line.source_refs) && line.source_refs.every(ref => typeof ref === "string"));
}

export default function CoachingExplanation({ explanation, insightId }: { explanation?: Explanation; insightId: string }) {
  const [audience, setAudience] = useState<"fan" | "analyst">("fan");
  if (!explanation || explanation.schema_version !== "coaching_v1"
      || !["foundry_composition", "deterministic_fallback"].includes(explanation.mode)
      || explanation.insight_id !== insightId
      || !validLines(explanation.fan) || !validLines(explanation.analyst)) {
    return <p className="coaching-unavailable">Coaching explanation unavailable. The deterministic comparison and traces remain available.</p>;
  }
  const foundry = explanation.mode === "foundry_composition";
  const lines = explanation[audience];
  return <section className="coaching-explanation" aria-label="Evidence-grounded coaching" data-explanation-id={explanation.explanation_id}>
    <div className="coaching-heading"><div><small>{foundry ? "FOUNDRY COMPOSITION · VERIFIED EVIDENCE" : "DETERMINISTIC FALLBACK · NO AI EXPLANATION"}</small><h4>The decision, explained.</h4></div>
      <div className="coaching-audience" role="group" aria-label="Coaching audience">
        <button type="button" aria-pressed={audience === "fan"} onClick={() => setAudience("fan")}>Fan</button>
        <button type="button" aria-pressed={audience === "analyst"} onClick={() => setAudience("analyst")}>Analyst</button>
      </div>
    </div>
    <p className="coaching-source">{foundry
      ? "Foundry selected and ordered approved evidence-backed wording. This saved explanation makes no new model call when viewed."
      : "This explanation is rendered directly from Rust evidence. It is not presented as AI-generated."}</p>
    <div className="coaching-lines" aria-live="polite">{lines.map(line => <div key={line.fact_id} data-fact-id={line.fact_id}>
      <small>{evidenceLabels[line.kind]}</small><p>{line.text}</p>
    </div>)}</div>
    <details><summary>Explanation sources and provenance</summary>
      <p>Fictional match · Authored geometry · Uncalibrated ratings · No real-match success probabilities.</p>
      <p>Both audience views use the same selected facts. The analyst wording exposes more of the model evidence.</p>
      {foundry && <p>Three completed Foundry role calls; wording and references checked by Rust. Delivery is precomputed, not a live provider-availability check.</p>}
      {!foundry && <p>Fallback status: {explanation.fallback_reason?.replaceAll("_", " ") ?? "explanation unavailable"}.</p>}
      <ul>{lines.map(line => <li key={line.fact_id}><strong>{line.fact_id}</strong>: {line.source_refs.map(ref => <code key={ref}>{ref} </code>)}</li>)}</ul>
      <p>Evidence fingerprint: <code>{explanation.evidence_digest}</code></p>
    </details>
  </section>;
}
