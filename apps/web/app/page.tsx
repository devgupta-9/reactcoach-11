"use client";

import DecisionLab from "./decision-lab";
import TacticalInsights from "./tactical-insights";
import TacticalStudio from "./tactical-studio";
import { TimedTacticalMoment } from "./match-broadcast";
import { useRef, useState } from "react";
import { evidenceButtonId } from "./match-presentation";
import { timecode, type EventKind } from "./match-contracts";
import { useMatchReplay } from "./use-match-replay";

function label(kind: EventKind) { return kind.replaceAll("_", " "); }

export default function HomePage() {
  const [replay, setReplay] = useState({ at: 0, generation: 0 });
  const [seek, setSeek] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<string | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);
  const inspectionTrigger = useRef<HTMLElement | null>(null);
  const { snapshot, events, insights, status, error } = useMatchReplay(replay);
  const stats = snapshot?.statistics;
  const latest = events.find(event => event.id === selectedEvent) ?? snapshot?.latest_event;
  function inspectMoment(id: string | null) {
    if (id) {
      inspectionTrigger.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      setFocusRevision(previous => previous + 1);
    } else {
      const fallback = selectedInsight ? document.getElementById(evidenceButtonId(selectedInsight)) : null;
      (inspectionTrigger.current?.isConnected ? inspectionTrigger.current : fallback)?.focus();
    }
    setSelectedInsight(id);
    const source = insights.find(insight => insight.insight_id === id)?.source_event_ids.at(-1);
    if (source !== undefined) setSelectedEvent(source);
  }
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ReactCoach 11 home"><span className="brand-mark">R<span>C</span></span><span>REACTCOACH <em>11</em></span></a>
        <nav className="main-nav" aria-label="Main navigation"><a href="#studio">Tactical Studio</a><a href="#match-center">Match Center</a><a href="#decision-lab">Decision Lab</a></nav>
        <span className="topbar-meta"><span className="status-dot" /> SYNTHETIC DEMO</span>
      </header>

      <section className="intro" id="top">
        <div><div className="eyebrow">FOOTBALL INTELLIGENCE, IN MOTION</div><h1>See the play.<br /><span>Find your next move.</span></h1><p>Read the opponent. Explore a different decision. See how a small tactical change unfolds on the pitch.</p><a className="intro-link" href="#studio">Explore a tactical moment <span>↗</span></a></div>
        <div className="intro-method"><span className="method-label">A CLEARER WAY TO UNDERSTAND THE GAME</span><div><span>01</span><strong>Your decision</strong><small>Start from the same situation.</small></div><div><span>02</span><strong>Their reaction</strong><small>See the defender choose a counter.</small></div><div><span>03</span><strong>Your next move</strong><small>Compare an evidence-backed correction.</small></div></div>
      </section>

      <TacticalStudio />

      <section id="match-center" className="match-center" aria-labelledby="match-center-title">
        <div className="section-intro"><div><div className="eyebrow">MATCH CENTER</div><h2 id="match-center-title">Every moment has a story.</h2><p>Follow the fictional replay, select an event, and inspect the tactical moments it triggers.</p></div><span className="pill"><span className="status-dot" /> {status}</span></div>
        <section className="scoreboard" aria-label="Synthetic match scoreboard">
          <div className="team"><span className="team-crest home-crest">N<span>C</span></span><div><small>HOME / FICTIONAL</small><strong>North City</strong></div></div>
          <div className="score-center"><div className="score">{snapshot?.score.home ?? "–"} <span>:</span> {snapshot?.score.away ?? "–"}</div><small>{timecode(snapshot?.elapsed_seconds ?? 0)} · {status.toUpperCase()}</small></div>
          <div className="team away"><div><small>AWAY / FICTIONAL</small><strong>South United</strong></div><span className="team-crest away-crest">S<span>U</span></span></div>
        </section>

        <div className="replay-controls" aria-label="Replay controls">
          <button type="button" aria-label="Restart replay" onClick={() => { setSelectedEvent(null); setSelectedInsight(null); setSeek(0); setReplay(previous => ({ at: 0, generation: previous.generation + 1 })); }}>↺ Restart replay</button>
          <label>Start at second <input type="number" min="0" max="420" step="1" value={seek} onChange={event => setSeek(Number(event.target.value))} /></label>
          <button type="button" disabled={!Number.isInteger(seek) || seek < 0 || seek > 420} onClick={() => { setSelectedEvent(null); setSelectedInsight(null); setReplay(previous => ({ at: seek, generation: previous.generation + 1 })); }}>Seek replay</button>
          <span className="replay-note">Accelerated playback · 23 authored events</span>
        </div>
        {error && <div className="error" role="alert">Match replay: {error}.</div>}

        <TacticalInsights key={replay.generation} insights={insights} selected={selectedInsight} focusRevision={focusRevision} onSelect={inspectMoment} />

        <section className="content-grid">
          <div className="panel pitch-panel">
            <div className="panel-heading"><div><small>THE MATCH, AT A GLANCE</small><h2>Where it happened</h2></div><span className="pill">{events.length} streamed events</span></div>
            <div className="match-pitch-stage"><div className="pitch" aria-label="Synthetic football pitch and event positions">
              <div className="midline" /><div className="centercircle" /><div className="box-left" /><div className="box-right" />
              {events.map(event => <button type="button" key={event.id} className={`pitch-dot ${event.team} ${event.kind === "goal" ? "goal" : ""}`} aria-label={`Event ${event.id}: ${event.player}, ${label(event.kind)} at ${timecode(event.timestamp_seconds)}`} aria-pressed={latest?.id === event.id} onClick={() => setSelectedEvent(event.id)} style={{ left: `${event.position.x}%`, top: `${event.position.y}%` }} />)}
            </div>
              <TimedTacticalMoment key={replay.generation} insights={insights} events={events} snapshot={snapshot}
                complete={status === "replay complete"} startAt={replay.at} unavailable={Boolean(error)} onInspect={inspectMoment} />
            </div>
            <div className="legend"><span><i className="legend-home" /> North City</span><span><i className="legend-away" /> South United</span><span>Select a dot to inspect the event</span></div>
          </div>

          <div className="panel metrics-panel">
            <div className="panel-heading"><div><small>FROM THE EVENT RECORDS</small><h2>Match signals</h2></div></div>
            <div className="metric"><div><span>Action share</span><strong>{stats ? stats.home_action_share_pct.toFixed(0) : "–"}% <small>vs</small> {stats ? stats.away_action_share_pct.toFixed(0) : "–"}%</strong></div><div className="meter"><span style={{ width: `${stats?.home_action_share_pct ?? 50}%` }} /></div><small>Discrete logged actions, not time in possession</small></div>
            <div className="statrow"><span>Completed pass events</span><strong>{stats?.home_passes ?? 0} <small>—</small> {stats?.away_passes ?? 0}</strong></div>
            <div className="statrow"><span>Shot events (goals included)</span><strong>{stats?.home_shots ?? 0} <small>—</small> {stats?.away_shots ?? 0}</strong></div>
            <div className="statrow"><span>Processed events</span><strong>{snapshot?.events_processed ?? 0}</strong></div>
            <div className="insight" aria-live="polite"><small>{selectedEvent !== null && latest?.id === selectedEvent ? "SELECTED EVENT" : "LATEST VERIFIED EVENT"}</small><h3>{latest ? label(latest.kind).toUpperCase() : "AWAITING DATA"}</h3><p>{latest ? `${latest.player} · ${latest.team} · ${timecode(latest.timestamp_seconds)}` : "Waiting for the fictional replay."}</p></div>
          </div>
        </section>

        <section className="panel timeline-panel">
          <div className="panel-heading"><div><small>FOLLOW THE BUILDUP</small><h2>Event timeline</h2></div><span className="pill">Fictional match</span></div>
          <div className="timeline">
            {[...events].reverse().map(event => <button type="button" className="timeline-item" key={event.id} data-event-id={event.id} aria-pressed={latest?.id === event.id} onClick={() => setSelectedEvent(event.id)}><time>{timecode(event.timestamp_seconds)}</time><span className={`event-type ${event.team}`}>{label(event.kind)}</span><strong>{event.player}</strong><span>{event.team === "home" ? "North City" : "South United"}</span></button>)}
            {events.length === 0 && <div className="timeline-empty">Waiting for the first synthetic event...</div>}
          </div>
        </section>
      </section>

      <div id="decision-lab" className="decision-lab-anchor"><DecisionLab /></div>

      <footer><div className="footer-brand">REACTCOACH <span>11</span></div><p>Learn the decision. Understand the difference.</p><small>Synthetic dataset only · No affiliation with football clubs or leagues · Saved, evidence-validated Microsoft Foundry coaching.</small></footer>
    </main>
  );
}
