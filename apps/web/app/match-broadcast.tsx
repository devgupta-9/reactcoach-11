"use client";

import { useState } from "react";
import { timecode, type MatchEvent, type MatchSnapshot, type TacticalInsight } from "./match-contracts";
import { evidenceButtonId, timedMoment } from "./match-presentation";
import "./match-broadcast.css";

export function TimedTacticalMoment({ insights, events, snapshot, complete, startAt, unavailable, onInspect }: {
  insights: TacticalInsight[]; events: MatchEvent[]; snapshot: MatchSnapshot | null;
  complete: boolean; startAt: number; unavailable: boolean; onInspect: (id: string) => void;
}) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const moment = timedMoment(insights, events, snapshot, complete);
  if (unavailable || !moment || dismissed === moment.insight_id) return null;
  const historical = moment.event_timestamp <= startAt;
  return <aside className="timed-moment" aria-label="Timed tactical moment"
    aria-live={historical ? "off" : "polite"} data-insight-id={moment.insight_id}
    data-source-event-id={moment.source_event_ids.at(-1)}>
    <div className="moment-cue-heading"><small>{historical ? "MOMENT IN REPLAY" : "TACTICAL MOMENT"} <time>{timecode(moment.event_timestamp)}</time></small>
      <button type="button" className="moment-dismiss" aria-label={`Dismiss moment at ${timecode(moment.event_timestamp)}`} onClick={() => {
        setDismissed(moment.insight_id); document.getElementById(evidenceButtonId(moment.insight_id))?.focus();
      }}>×</button></div>
    <h3>{moment.headline}</h3>
    <p className="moment-actions"><span>Original <strong>{moment.original_action.replaceAll("_", " ")}</strong></span>
      {moment.recommended_action ? <span>Modeled option <strong>{moment.recommended_action.replaceAll("_", " ")}</strong></span> : <span>No better feasible correction</span>}</p>
    <div className="moment-cue-footer"><small>Fictional match · Authored scenario</small>
      <button type="button" className="moment-inspect" onClick={() => onInspect(moment.insight_id)}>Inspect this moment <span aria-hidden="true">↗</span></button></div>
  </aside>;
}
