"use client";
import DecisionLab from "./decision-lab";
import TacticalInsights from "./tactical-insights";
import { useState } from "react";
import { timecode, type EventKind } from "./match-contracts";
import { useMatchReplay } from "./use-match-replay";

function label(kind: EventKind) { return kind.replaceAll("_", " "); }

export default function HomePage() {
  const [replay, setReplay] = useState({ at: 0, generation: 0 });
  const [seek, setSeek] = useState(0);
  const { snapshot, events, insights, status, error } = useMatchReplay(replay);
  const stats = snapshot?.statistics;
  const latest = snapshot?.latest_event;
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">R<span>C</span></span><span>REACTCOACH <em>11</em></span></div>
        <div className="topbar-meta"><span className="status-dot" /> SYNTHETIC DEMONSTRATION <span className="separator">/</span> RUST EVENT ENGINE</div>
      </header>

      <section className="intro">
        <div className="eyebrow">INSIDE THE GAME · DEVELOPER HACKATHON</div>
        <h1>Know your strengths.<br /><span>Outthink your opponent.</span></h1>
        <p>Adaptive football decision intelligence. Compare synthetic player strengths, evaluate opponent vulnerabilities, and discover an evidence-labeled tactical correction.</p>
      </section>

      <DecisionLab />

      <section className="scoreboard" aria-label="Synthetic match scoreboard">
        <div className="team"><small>HOME / DEMO</small><strong>North City</strong></div>
        <div className="score-center"><div className="score">{snapshot?.score.home ?? "–"} <span>:</span> {snapshot?.score.away ?? "–"}</div><small>{timecode(snapshot?.elapsed_seconds ?? 0)} · {status.toUpperCase()}</small></div>
        <div className="team away"><small>AWAY / DEMO</small><strong>South United</strong></div>
      </section>

      <div className="replay-controls" aria-label="Replay controls">
        <button type="button" onClick={() => { setSeek(0); setReplay(previous => ({ at: 0, generation: previous.generation + 1 })); }}>Restart replay</button>
        <label>Start at second <input type="number" min="0" max="420" step="1" value={seek} onChange={event => setSeek(Number(event.target.value))} /></label>
        <button type="button" disabled={!Number.isInteger(seek) || seek < 0 || seek > 420} onClick={() => setReplay(previous => ({ at: seek, generation: previous.generation + 1 }))}>Seek replay</button>
      </div>
      {error && <div className="error" role="alert">Match replay: {error}.</div>}

      <TacticalInsights key={replay.generation} insights={insights} />

      <section className="content-grid">
        <div className="panel pitch-panel">
          <div className="panel-heading"><div><small>LIVE TACTICAL VIEW</small><h2>Event positions</h2></div><span className="pill">{events.length} streamed events</span></div>
          <div className="pitch" aria-label="Synthetic football pitch and event positions">
            <div className="midline" /><div className="centercircle" /><div className="box-left" /><div className="box-right" />
            {events.map((event) => (
              <span key={event.id} className={`pitch-dot ${event.team} ${event.kind === "goal" ? "goal" : ""}`} title={`${event.player}: ${label(event.kind)} at ${timecode(event.timestamp_seconds)}`} style={{ left: `${event.position.x}%`, top: `${event.position.y}%` }} />
            ))}
          </div>
          <div className="legend"><span><i className="legend-home" /> North City</span><span><i className="legend-away" /> South United</span><span>Positions are fictional</span></div>
        </div>

        <div className="panel metrics-panel">
          <div className="panel-heading"><div><small>DETERMINISTIC ANALYTICS</small><h2>Match signals</h2></div></div>
          <div className="metric"><div><span>Action share</span><strong>{stats ? stats.home_action_share_pct.toFixed(0) : "–"}% <small>vs</small> {stats ? stats.away_action_share_pct.toFixed(0) : "–"}%</strong></div><div className="meter"><span style={{ width: `${stats?.home_action_share_pct ?? 50}%` }} /></div><small>Discrete logged actions, not time in possession</small></div>
          <div className="statrow"><span>Completed pass events</span><strong>{stats?.home_passes ?? 0} <small>—</small> {stats?.away_passes ?? 0}</strong></div>
          <div className="statrow"><span>Shot events (goals included)</span><strong>{stats?.home_shots ?? 0} <small>—</small> {stats?.away_shots ?? 0}</strong></div>
          <div className="statrow"><span>Processed events</span><strong>{snapshot?.events_processed ?? 0}</strong></div>
          <div className="insight"><small>LATEST VERIFIED EVENT</small><h3>{latest ? label(latest.kind).toUpperCase() : "AWAITING DATA"}</h3><p>{latest ? `${latest.player} · ${latest.team} · ${timecode(latest.timestamp_seconds)}` : "Waiting for the Rust replay stream."}</p></div>
        </div>
      </section>

      <section className="panel timeline-panel">
        <div className="panel-heading"><div><small>REPLAY STREAM</small><h2>Event timeline</h2></div><span className="pill">SSE / AXUM</span></div>
        <div className="timeline">
          {[...events].reverse().map((event) => <div className="timeline-item" key={event.id} data-event-id={event.id}><time>{timecode(event.timestamp_seconds)}</time><span className={`event-type ${event.team}`}>{label(event.kind)}</span><strong>{event.player}</strong><span>{event.team === "home" ? "North City" : "South United"}</span></div>)}
          {events.length === 0 && <div className="timeline-empty">Waiting for the first synthetic event...</div>}
        </div>
      </section>

      <footer>ReactCoach 11 · Synthetic dataset only · No affiliation with football clubs or leagues · Agent orchestration is planned for Phase 3.</footer>
    </main>
  );
}
