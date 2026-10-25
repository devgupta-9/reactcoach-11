"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { matchApi, timecode, type MatchEvent, type MatchSnapshot, type TacticalInsight } from "./match-contracts";
import { availableMoments, evidenceButtonId, finalSnapshotReady, timedMoment } from "./match-presentation";
import "./match-broadcast.css";

export function TimedTacticalMoment({ insights, events, snapshot, complete, startAt, unavailable, onInspect }: {
  insights: TacticalInsight[]; events: MatchEvent[]; snapshot: MatchSnapshot | null;
  complete: boolean; startAt: number; unavailable: boolean; onInspect: (id: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const moment = timedMoment(insights, events, snapshot, complete);
  if (unavailable || !moment || dismissed === moment.insight_id) return null;
  return <MomentCue key={moment.insight_id} moment={moment} historical={moment.event_timestamp <= startAt}
    onDismiss={() => setDismissed(moment.insight_id)} onInspect={onInspect} />;
}

function MomentCue({ moment, historical, onDismiss, onInspect }: {
  moment: TacticalInsight; historical: boolean; onDismiss: () => void; onInspect: (id: string) => void;
}) {
  const cue = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const node = cue.current;
    return () => {
      if (node?.contains(document.activeElement)) document.getElementById(evidenceButtonId(moment.insight_id))?.focus();
    };
  }, [moment.insight_id]);
  return <aside ref={cue} className="timed-moment" aria-label="Timed tactical moment"
    aria-live={historical ? "off" : "polite"} data-insight-id={moment.insight_id}
    data-source-event-id={moment.source_event_ids.at(-1)}>
    <div className="moment-cue-heading"><small>{historical ? "MOMENT IN REPLAY" : "TACTICAL MOMENT"} <time>{timecode(moment.event_timestamp)}</time></small>
      <button type="button" className="moment-dismiss" aria-label={`Dismiss moment at ${timecode(moment.event_timestamp)}`} onClick={onDismiss}>×</button></div>
    <h3>{moment.headline}</h3>
    <p className="moment-actions"><span>Original <strong>{moment.original_action.replaceAll("_", " ")}</strong></span>
      {moment.recommended_action ? <span>Modeled option <strong>{moment.recommended_action.replaceAll("_", " ")}</strong></span> : <span>No better feasible correction</span>}</p>
    <div className="moment-cue-footer"><small>Fictional match · Authored scenario</small>
      <button type="button" className="moment-inspect" onClick={() => onInspect(moment.insight_id)}>Inspect this moment <span aria-hidden="true">↗</span></button></div>
  </aside>;
}

export function MatchRecap({ snapshot, events, insights, complete, unavailable, onInspect, onReload }: {
  snapshot: MatchSnapshot | null; events: MatchEvent[]; insights: TacticalInsight[];
  complete: boolean; unavailable: boolean; onInspect: (id: string) => void; onReload: () => void;
}) {
  if (!complete) return null;
  const finalEvent = events.at(-1);
  if (unavailable || !finalEvent || !finalSnapshotReady(snapshot, events, complete)) {
    return <section id="match-recap" className="panel match-recap" aria-labelledby="match-recap-title" data-state="awaiting_snapshot">
      <div className="eyebrow">REPLAY ENDED · VERIFYING FINAL EVIDENCE</div><h2 id="match-recap-title">Match recap</h2>
      <p role="status">Waiting for the final snapshot to match the last replay event and all accepted records. Final totals are not ready yet.</p>
      <button type="button" className="moment-inspect" onClick={onReload}>Reload final evidence</button>
    </section>;
  }
  const moments = availableMoments(insights, events, snapshot);
  const goals = events.filter(event => event.kind === "goal");
  const stats = snapshot.statistics;
  return <section id="match-recap" className="panel match-recap" aria-labelledby="match-recap-title" data-state="ready" data-final-event-id={finalEvent.id}>
    <div className="recap-heading"><div><div className="eyebrow">REPLAY COMPLETE · FICTIONAL MATCH SEGMENT</div><h2 id="match-recap-title">Match recap</h2>
      <p>Review the recorded result and each modeled alternative.</p></div><span className="pill">{timecode(snapshot.elapsed_seconds)} · {snapshot.events_processed} records</span></div>
    <div className="recap-result" aria-label="Recorded final result"><span>North City<small>FICTIONAL HOME</small></span>
      <strong className="recap-score" aria-label="Recorded final score">{snapshot.score.home} <span>:</span> {snapshot.score.away}</strong>
      <span>South United<small>FICTIONAL AWAY</small></span></div>
    <div className="recap-grid"><div className="recap-records"><h3>From the event records</h3>
      <p>The score and counts below come from the verified Rust snapshot.</p>
      <dl><div data-stat="passes"><dt>Completed pass events</dt><dd>{stats.home_passes} <span>—</span> {stats.away_passes}</dd></div>
        <div data-stat="shots"><dt>Shot events, goals included</dt><dd>{stats.home_shots} <span>—</span> {stats.away_shots}</dd></div>
        <div><dt>Recorded tactical moments</dt><dd>{moments.length}</dd></div></dl>
      <h4>Recorded goals</h4>
      {goals.length ? <ul className="recap-goals">{goals.map(goal => <li key={goal.id} data-goal-event-id={goal.id}>
        <time>{timecode(goal.timestamp_seconds)}</time><div><strong>{goal.player}</strong><span>{goal.team === "home" ? "North City" : "South United"} · event {goal.id}</span></div>
      </li>)}</ul> : <p>No goals appear in the recorded sequence.</p>}
      <small className="recap-observation-note">These are discrete event counts. They are not time in possession or real-player measurements.</small>
    </div><div className="recap-scenarios"><h3>From the linked scenarios</h3>
      <p>Authored situations explore different decisions under the same starting conditions.</p>
      {moments.length === 0 && <p>No compatible tactical comparisons are available for this replay.</p>}
      {moments.map(moment => {
        const correction = moment.recommended_action && moment.corrected_trace_id && moment.comparison_evidence.corrected;
        return <article className="recap-moment" key={moment.insight_id} data-insight-id={moment.insight_id}
          data-baseline-trace-id={moment.baseline_trace_id} data-corrected-trace-id={correction ? moment.corrected_trace_id! : undefined}>
          <time>{timecode(moment.event_timestamp)}</time><h4>{moment.headline}</h4>
          <p>Original: <strong>{moment.original_action.replaceAll("_", " ")}</strong></p>
          {correction ? <><p className="recap-modeled-option">Modeled option: <strong>{moment.recommended_action!.replaceAll("_", " ")}</strong></p>
            <p>{moment.comparison_evidence.summary}</p></> : <p>No better feasible correction is supported by this scenario.</p>}
          <small>{moment.fixture_relation === "hypothetical_precursor" ? "Hypothetical precursor" : "Authored decision point"} · Source events {moment.source_event_ids.join(", ")}</small>
          <button type="button" className="moment-inspect" aria-label={`Review coaching at ${timecode(moment.event_timestamp)}`} onClick={() => onInspect(moment.insight_id)}>Open coaching and comparison <span aria-hidden="true">↗</span></button>
        </article>;
      })}
    </div></div>
    <details className="recap-provenance"><summary>Recap sources and model limits</summary>
      <p>The recorded result is fixed. Tactical alternatives use authored geometry and uncalibrated ratings; they are not real-match success probabilities.</p>
      <p>This recap uses event records and Rust insight evidence. Open a moment for its saved coaching explanation, actual origin label and inspectable traces.</p>
      <div className="recap-source-links"><a href={`${matchApi}/api/v1/matches/demo/events`} target="_blank" rel="noreferrer">Event records (JSON)</a>
        <a href={`${matchApi}/api/v1/matches/demo/snapshot?at=${snapshot.elapsed_seconds}`} target="_blank" rel="noreferrer">Final snapshot (JSON)</a>
        <a href={`${matchApi}/api/v1/matches/demo/insights?at=${snapshot.elapsed_seconds}`} target="_blank" rel="noreferrer">Linked insights (JSON)</a></div>
    </details>
  </section>;
}
