"use client";
import { useEffect, useState } from "react";
import { matchApi, timecode, type InsightDetail, type TacticalInsight } from "./match-contracts";
import { TracePlayer } from "./tactical-studio";

export default function TacticalInsights({ insights }: { insights: TacticalInsight[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<InsightDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController(); let active = true;
    async function load() {
      try {
        const response = await fetch(`${matchApi}/api/v1/matches/demo/insights/${encodeURIComponent(selected!)}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Evidence HTTP ${response.status}`);
        const data = await response.json() as InsightDetail;
        if (data.insight.insight_id !== selected) throw new Error("Evidence identity mismatch");
        if (active) setDetail(data);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Evidence unavailable"); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [selected]);
  function select(id: string | null) { setDetail(null); setError(null); setSelected(id); }
  return <section className="panel tactical-panel" aria-label="Live tactical insights">
    <div className="panel-heading"><div><small>MATCH-TRIGGERED EVIDENCE</small><h2>Tactical moments</h2></div><span className="pill">Synthetic scenarios</span></div>
    {insights.length === 0 && <p className="tactical-empty">Waiting for an eligible moment with a linked authored scenario.</p>}
    <div className="tactical-cards">{insights.map(insight => <article className="tactical-card" key={insight.insight_id} data-event-id={insight.source_event_ids.at(-1)}>
      <time>{timecode(insight.event_timestamp)}</time><h3>{insight.headline}</h3><p>{insight.significance_reason}</p>
      <div className="tactical-actions"><span>Original: <strong>{insight.original_action.replaceAll("_", " ")}</strong></span><span>{insight.recommended_action ? <>Modeled correction: <strong>{insight.recommended_action.replaceAll("_", " ")}</strong></> : "No better feasible correction found"}</span></div>
      <small>Fictional match · Authored geometry · Uncalibrated ratings</small>
      <button type="button" onClick={() => select(insight.insight_id)} aria-pressed={selected === insight.insight_id}>Inspect evidence at {timecode(insight.event_timestamp)}</button>
    </article>)}</div>
    {selected && <div className="tactical-evidence" aria-label="Tactical evidence" aria-live="polite">
      <button type="button" onClick={() => select(null)}>Close evidence</button>
      {error ? <p role="alert">{error}</p> : !detail ? <p>Loading linked evidence…</p> : <>
        <h3>{timecode(detail.insight.event_timestamp)} · {detail.insight.headline}</h3>
        <p>{detail.insight.fixture_relation === "hypothetical_precursor" ? "Hypothetical precursor to the logged turnover; this is not a tracking reconstruction." : "Authored decision point linked to the pressure record; this is not observed player movement."}</p>
        <p>{detail.insight.comparison_evidence.summary}</p>
        <dl><div><dt>Source events</dt><dd>{detail.insight.source_event_ids.join(", ")}</dd></div><div><dt>Scenario fixture</dt><dd>{detail.insight.scenario_fixture_id}</dd></div><div><dt>Original possession retained</dt><dd>{detail.insight.comparison_evidence.baseline.friendly_possession ? "Yes" : "No"}</dd></div>
          {detail.insight.comparison_evidence.corrected && <div><dt>Corrected friendly possession retained</dt><dd>{detail.insight.comparison_evidence.corrected.friendly_possession ? "Yes" : "No"}</dd></div>}
        </dl>
        <details><summary>Authored assumptions and model limits</summary><ul>{[...detail.insight.synthetic_scenario_assumptions, ...detail.insight.limitations].map((text, i) => <li key={i}>{text}</li>)}</ul>
          <p>The model compares friendly possession, then bypassing the defender, then forward progress and defender clearance. Each later criterion breaks ties in the earlier criteria.</p>
          <p><code>Q = (P, B, P × ⌊G / 1000⌋, P × ⌊min(C, 15000) / 1000⌋)</code></p>
          <p>P is 1 for friendly possession, otherwise 0. B is 1 when friendly possession is at least one metre beyond the defender, otherwise 0. G is forward ball progress in millimetres; C is modeled defender clearance in millimetres. A correction requires a strictly greater Q, compared left to right; ties keep the original continuation.</p>
          <p>{detail.insight.comparison_evidence.reason}</p>
        </details>
        <TracePlayer key={detail.insight.insight_id} detail={detail} />
        <a href={`${matchApi}/api/v1/matches/demo/insights/${encodeURIComponent(detail.insight.insight_id)}`} target="_blank" rel="noreferrer">Open full simulation evidence (JSON)</a>
      </>}
    </div>}
  </section>;
}
