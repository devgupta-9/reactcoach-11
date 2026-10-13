"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { matchApi, timecode, type InsightDetail, type TacticalInsight } from "./match-contracts";
import { actionLabel, responseLabel, type Participant, type SimulationTrace, type Vector2 } from "./simulation-contracts";
import "./tactical-studio.css";

function eventText(event: SimulationTrace["events"][number]) {
  const evidence = event.evidence;
  switch (evidence.kind) {
    case "action_selected": return actionLabel(evidence.action);
    case "opponent_decision": return `Defender: ${responseLabel(evidence.chosen_response_id)}`;
    case "adaptation": return evidence.feasible ? `Adapt: ${actionLabel(evidence.action)}` : "Correction unavailable";
    case "pass_released": return "Pass released to the supporting teammate";
    case "possession_changed": return evidence.owner === "opponent" ? "Defender wins possession" : evidence.owner === "teammate" ? "Teammate receives the ball" : evidence.owner === "assessed" ? "Attacker has possession" : "Ball is loose";
  }
}

export function TracePlayer({ detail }: { detail: InsightDetail }) {
  const report = detail.simulation;
  const corrected = report.alternatives.find(alternative => alternative.trace?.id === report.recommended_trace_id)?.trace;
  const [branch, setBranch] = useState("original");
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.5);
  const [camera, setCamera] = useState<"angled" | "overhead">("angled");
  const [wholePitch, setWholePitch] = useState(false);
  const [participant, setParticipant] = useState<Participant>("assessed");
  const [reducedMotion, setReducedMotion] = useState(false);
  const playheadRef = useRef(0);
  const duration = report.input.config.duration_ms;
  const trace = branch === "corrected" && corrected ? corrected : report.baseline;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(query.matches); if (query.matches) setPlaying(false); };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!playing || reducedMotion) return;
    let animation = 0;
    let previous: number | undefined;
    function tick(now: number) {
      const delta = previous === undefined ? 0 : Math.min(now - previous, 100);
      previous = now;
      playheadRef.current = Math.min(duration, playheadRef.current + delta * speed);
      setPlayhead(playheadRef.current);
      if (playheadRef.current < duration) animation = requestAnimationFrame(tick);
      else setPlaying(false);
    }
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, speed, duration, reducedMotion]);

  function seek(next: number) { setPlaying(false); playheadRef.current = next; setPlayhead(next); }
  function chooseBranch(next: string) { setBranch(next); seek(0); }
  const index = Math.min(Math.floor(playhead / report.input.config.tick_ms), trace.steps.length - 1);
  const state = trace.steps[index].state;
  const next = trace.steps[Math.min(index + 1, trace.steps.length - 1)].state;
  const fraction = Math.min(1, (playhead - state.elapsed_ms) / report.input.config.tick_ms);
  const interpolate = (from: Vector2, to: Vector2) => ({ x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction });
  const positions = {
    assessed: interpolate(state.assessed.position_mm, next.assessed.position_mm),
    opponent: interpolate(state.opponent.position_mm, next.opponent.position_mm),
    teammate: state.teammate && next.teammate ? interpolate(state.teammate.position_mm, next.teammate.position_mm) : null,
    ball: interpolate(state.ball.position_mm, next.ball.position_mm),
  };
  const pitch = report.input.config.pitch;
  // Both branches share one camera frame, so changing decisions never changes the spatial scale.
  const points = [report.baseline, ...(corrected ? [corrected] : [])].flatMap(item => item.steps.flatMap(step => [step.state.assessed.position_mm, step.state.opponent.position_mm, step.state.ball.position_mm, ...(step.state.teammate ? [step.state.teammate.position_mm] : [])]));
  const width = Math.min(pitch.length_mm, Math.max(32000, Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) + 12000));
  const height = Math.min(pitch.width_mm, Math.max(23000, Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) + 12000));
  const frame = wholePitch ? { x: 0, y: 0, width: pitch.length_mm, height: pitch.width_mm } : {
    x: Math.max(0, Math.min(pitch.length_mm - width, (Math.min(...points.map(point => point.x)) + Math.max(...points.map(point => point.x)) - width) / 2)),
    y: Math.max(0, Math.min(pitch.width_mm - height, (Math.min(...points.map(point => point.y)) + Math.max(...points.map(point => point.y)) - height) / 2)), width, height,
  };
  const pointStyle = (point: Vector2): CSSProperties => ({ left: `${100 * (point.x - frame.x) / frame.width}%`, top: `${100 * (point.y - frame.y) / frame.height}%` });
  const path = (role: "assessed" | "opponent") => trace.steps.map(step => `${step.state[role].position_mm.x},${step.state[role].position_mm.y}`).join(" ");
  const completedPath = (role: "assessed" | "opponent") => [...trace.steps.slice(0, index + 1).map(step => step.state[role].position_mm), positions[role]].map(point => `${point.x},${point.y}`).join(" ");
  const profile = participant === "assessed" ? report.input.assessed_player : participant === "opponent" ? report.input.opponent : report.input.supporting_teammate;
  const currentPlayer = state[participant];
  const visibleEvents = trace.events.filter(event => event.elapsed_ms <= playhead);
  const latest = visibleEvents.at(-1);
  const response = [...visibleEvents].reverse().find(event => event.evidence.kind === "opponent_decision");
  const possession = state.ball.possession;
  const ballOwner = possession.kind === "owned" ? possession.owner === "opponent" ? "Defender" : possession.owner === "teammate" ? "Supporting teammate" : "Attacker" : possession.kind === "in_flight" ? "Pass in flight" : "Loose ball";
  const adaptation = report.input.config.adaptation_at_ms;
  const phase = playhead >= duration ? "Outcome" : playhead >= adaptation ? branch === "corrected" ? "Adaptation" : "Continuation" : response ? "Opponent response" : "Initial decision";

  return <div className="trace-player" data-trace-id={`${detail.trace_namespace}/${trace.id}`} data-step-id={trace.steps[index].id} data-elapsed-ms={state.elapsed_ms}>
    <div className="trace-workspace">
      <div className="trace-visual">
        <div className="trace-toolbar">
          <div className="segmented" role="group" aria-label="Compare tactical decisions">
            <button type="button" aria-pressed={branch === "original"} onClick={() => chooseBranch("original")}>Original decision</button>
            <button type="button" aria-pressed={branch === "corrected"} disabled={!corrected} onClick={() => chooseBranch("corrected")}>Corrected decision</button>
          </div>
          <div className="camera-controls"><span className="current-camera">{camera === "angled" ? "3D camera" : "Overhead camera"}</span><button type="button" onClick={() => setCamera(camera === "angled" ? "overhead" : "angled")}>{camera === "angled" ? "Overhead view" : "3D view"}</button><button type="button" onClick={() => setWholePitch(!wholePitch)}>{wholePitch ? "Focus play" : "Whole pitch"}</button></div>
        </div>
        <div className={`pitch-stage ${camera} ${wholePitch ? "whole-pitch" : ""}`} aria-label="Interactive tactical pitch" data-camera={camera}>
          <div className="stage-caption"><span className="status-dot" /> {actionLabel(state.current_action)}<span>Attack direction →</span></div>
          <div className="pitch-perspective"><div className="spatial-field" style={{ "--frame-aspect": frame.width / frame.height } as CSSProperties}>
            <svg className="spatial-lines" viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-hidden="true">
              <rect x="0" y="0" width={pitch.length_mm} height={pitch.width_mm} fill="#1b4539" />
              {Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 10500} y="0" width="5250" height={pitch.width_mm} fill="#255342" opacity=".4" />)}
              <g fill="none" stroke="#c8e7ce" strokeOpacity=".38" strokeWidth="160">
                <rect x="400" y="400" width={pitch.length_mm - 800} height={pitch.width_mm - 800} />
                <path d={`M 52500 400 V ${pitch.width_mm - 400}`} /><circle cx="52500" cy="34000" r="9150" />
                <rect x="400" y="13840" width="16500" height="40320" /><rect x="88100" y="13840" width="16500" height="40320" />
                <rect x="400" y="24840" width="5500" height="18320" /><rect x="99100" y="24840" width="5500" height="18320" />
              </g>
              <polyline points={path("assessed")} fill="none" stroke="#cbf58a" strokeWidth="160" strokeDasharray="450 450" opacity=".25" />
              <polyline points={path("opponent")} fill="none" stroke="#f7ad91" strokeWidth="140" strokeDasharray="450 450" opacity=".25" />
              <polyline points={completedPath("assessed")} fill="none" stroke="#cbf58a" strokeWidth="250" strokeLinecap="round" />
              <polyline points={completedPath("opponent")} fill="none" stroke="#f7ad91" strokeWidth="210" strokeLinecap="round" />
            </svg>
            {(["assessed", "opponent", "teammate"] as const).map(role => {
              const position = positions[role];
              if (!position) return null;
              const name = role === "assessed" ? "Attacker" : role === "opponent" ? "Defender" : "Supporting teammate";
              return <button key={role} type="button" className={`spatial-player ${role} ${participant === role ? "selected" : ""}`} style={pointStyle(position)} aria-label={`Inspect ${name.toLowerCase()}`} aria-pressed={participant === role} onClick={() => setParticipant(role)} data-participant={role} data-x-mm={state[role]?.position_mm.x} data-y-mm={state[role]?.position_mm.y}>
                <span className="player-shadow" /><span className="player-body"><span className="player-head" /><span className="player-shirt">{role === "assessed" ? "A" : role === "opponent" ? "D" : "S"}</span></span><span className="player-name">{name}</span>
              </button>;
            })}
            <div className="spatial-ball" style={pointStyle(positions.ball)} data-owner={possession.kind === "owned" ? possession.owner : possession.kind} aria-label={`Ball: ${ballOwner}`}><span /></div>
          </div></div>
          <div className="pitch-stage-footer"><span><i className="legend-attacker" /> Attacker</span><span><i className="legend-defender" /> Defender</span><span><i className="legend-support" /> Support</span><span>Click a player to inspect</span></div>
        </div>
        <div className="playback-controls">
          <button className="play-button" type="button" disabled={reducedMotion} onClick={() => { if (playheadRef.current >= duration) { playheadRef.current = 0; setPlayhead(0); } setPlaying(!playing); }} aria-label={playing ? "Pause tactical playback" : "Play tactical playback"}>{playing ? "Ⅱ" : "▶"}</button>
          <button className="reset-button" type="button" onClick={() => seek(0)} aria-label="Reset tactical playback">↺</button>
          <div className="playback-track"><div className="playback-time"><strong>{(playhead / 1000).toFixed(1)}s <span>/ {(duration / 1000).toFixed(1)}s</span></strong><span>{phase}</span></div><input type="range" min="0" max={duration} step={report.input.config.tick_ms} value={Math.round(playhead / report.input.config.tick_ms) * report.input.config.tick_ms} onChange={event => seek(Number(event.target.value))} aria-label="Simulation time" /><span className="adaptation-marker" style={{ left: `${adaptation / duration * 100}%` }} /></div>
          <label className="playback-speed"><span>Speed</span><select aria-label="Playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="0.25">0.25×</option></select></label>
        </div>
        {reducedMotion && <p className="motion-note">Reduced motion is enabled. Use the time slider or evidence steps to explore the play.</p>}
        <div className="trace-step-buttons" role="group" aria-label="Simulation chapters">
          <button type="button" onClick={() => seek(0)} aria-pressed={phase === "Initial decision"}><span>01</span> Decision</button>
          <button type="button" onClick={() => seek(trace.events.find(event => event.evidence.kind === "opponent_decision")?.elapsed_ms ?? 0)} aria-pressed={phase === "Opponent response"}><span>02</span> Counter</button>
          <button type="button" onClick={() => seek(adaptation)} aria-pressed={phase === "Adaptation" || phase === "Continuation"}><span>03</span> Adapt</button>
          <button type="button" onClick={() => seek(duration)} aria-pressed={phase === "Outcome"}><span>04</span> Outcome</button>
        </div>
      </div>
      <aside className="trace-coaching" aria-label="Tactical coaching and evidence">
        <div className="coach-label"><span className="status-dot" /> THE DECISION, EXPLAINED</div>
        <h3>{branch === "corrected" && corrected?.corrective_action ? actionLabel(corrected.corrective_action) : actionLabel(report.input.initial_state.current_action)}</h3>
        <p className="coach-description">{branch === "corrected" ? detail.insight.comparison_evidence.summary : "Watch the original move, see how the defender counters, then compare the modeled correction."}</p>
        <div className="current-evidence" aria-live={playing ? "off" : "polite"}><span>{(state.elapsed_ms / 1000).toFixed(1)}s · {phase}</span><strong>{latest ? eventText(latest) : "Ready to play"}</strong><small>Ball: {ballOwner}</small></div>
        <div className="outcome-comparison"><div><span>Original outcome</span><strong className={report.baseline.evaluation.friendly_possession ? "outcome-good" : "outcome-loss"}>{report.baseline.evaluation.friendly_possession ? "Possession retained" : "Possession lost"}</strong><small>{(report.baseline.evaluation.forward_ball_progress_mm / 1000).toFixed(1)}m forward ball progress</small></div><div><span>Corrected outcome</span><strong className={corrected ? corrected.evaluation.friendly_possession ? "outcome-good" : "outcome-loss" : ""}>{corrected ? corrected.evaluation.friendly_possession ? "Possession retained" : "Possession lost" : "No better option found"}</strong>{corrected && <small>{(corrected.evaluation.forward_ball_progress_mm / 1000).toFixed(1)}m forward ball progress</small>}</div></div>
        <div className="participant-controls" role="group" aria-label="Inspect a player">{(["assessed", "opponent", "teammate"] as const).map(role => <button key={role} type="button" aria-pressed={participant === role} disabled={role === "teammate" && !state.teammate} onClick={() => setParticipant(role)}>{role === "assessed" ? "Attacker" : role === "opponent" ? "Defender" : "Support"}</button>)}</div>
        {profile && currentPlayer && <div className="player-inspector"><span className="inspector-label">SELECTED PLAYER · SYNTHETIC</span><h4>{profile.label}</h4><div className="inspector-traits">{(["acceleration", "passing", "positioning"] as const).map(trait => <div key={trait}><span>{trait}</span><strong>{profile.traits[trait]}<small>/100</small></strong><i style={{ width: `${profile.traits[trait]}%` }} /></div>)}</div><small className="player-coordinates">Position {(currentPlayer.position_mm.x / 1000).toFixed(1)}, {(currentPlayer.position_mm.y / 1000).toFixed(1)}m · Synthetic ratings</small></div>}
      </aside>
    </div>
    <details className="studio-evidence"><summary>How this scene connects to the match <span>Evidence & assumptions ↗</span></summary><p>{detail.insight.fixture_relation === "hypothetical_precursor" ? "A hypothetical precursor to the logged turnover. This is authored geometry, not a reconstruction of tracked movement." : "An authored decision point linked to the pressure record. Player movements are simulated, not observed."}</p><dl><div><dt>Source events</dt><dd>{detail.insight.source_event_ids.join(", ")}</dd></div><div><dt>Scenario fixture</dt><dd>{detail.insight.scenario_fixture_id}</dd></div><div><dt>Selected trace</dt><dd>{detail.trace_namespace}/{trace.id}</dd></div></dl><p>Positions between the engine&apos;s 100ms snapshots are interpolated for display. The paths, possession, response choices and final outcomes come from the Rust report. Dotted paths preview the selected branch; solid paths show elapsed movement.</p><ul>{[...detail.insight.synthetic_scenario_assumptions, ...detail.insight.limitations].map((item, i) => <li key={i}>{item}</li>)}</ul><a href={`${matchApi}/api/v1/matches/demo/insights/${encodeURIComponent(detail.insight.insight_id)}`} target="_blank" rel="noreferrer">Open complete simulation evidence ↗</a></details>
    <p className="studio-footnote">Fictional players · Authored spatial scenario · Model outcomes, not success probabilities</p>
  </div>;
}

function SceneLoader({ id }: { id: string }) {
  const [detail, setDetail] = useState<InsightDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`${matchApi}/api/v1/matches/demo/insights/${encodeURIComponent(id)}?at=420`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Scenario HTTP ${response.status}`);
        const data = await response.json() as InsightDetail;
        if (data.insight.insight_id !== id || data.simulation.scenario_version !== "open_play_spatial_v1" || !data.simulation.baseline.steps.length) throw new Error("The scenario evidence does not match this selection.");
        if (!controller.signal.aborted) setDetail(data);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Scenario unavailable"); }
    }
    void load();
    return () => controller.abort();
  }, [id, attempt]);
  if (error) return <div className="studio-loading" role="alert"><h3>We couldn’t load this scene.</h3><p>{error}</p><button type="button" onClick={() => { setError(null); setAttempt(attempt + 1); }}>Try again</button></div>;
  if (!detail) return <div className="studio-loading" role="status"><span className="loading-orbit" /><p>Loading the linked simulation…</p></div>;
  return <TracePlayer detail={detail} />;
}

export default function TacticalStudio() {
  const [moments, setMoments] = useState<TacticalInsight[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${matchApi}/api/v1/matches/demo/insights?at=420`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(`Scenario library HTTP ${response.status}`);
      const data = await response.json() as TacticalInsight[];
      if (!Array.isArray(data) || data.some(item => item.schema_version !== "tactical_intelligence_v1")) throw new Error("Unsupported scenario evidence.");
      if (!controller.signal.aborted) setMoments(data);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Scenario library unavailable"); });
    return () => controller.abort();
  }, [attempt]);
  const active = moments?.find(moment => moment.insight_id === selected) ?? moments?.[0];
  return <section className="tactical-studio" id="studio" aria-labelledby="studio-title">
    <div className="studio-heading"><div><div className="eyebrow">TACTICAL STUDIO</div><h2 id="studio-title">One moment. A different move.</h2><p>Play the situation. Read the counter. Compare what changes.</p></div><span className="studio-preview">Scenario preview · synthetic</span></div>
    <div className="studio-scenarios" role="group" aria-label="Choose a tactical moment">{moments?.map((moment, i) => <button className="studio-moment" type="button" key={moment.insight_id} aria-pressed={active?.insight_id === moment.insight_id} onClick={() => setSelected(moment.insight_id)}><span className="moment-number">0{i + 1}</span><span><strong>{moment.insight_kind === "attacking_turnover" ? "The wide-channel turnover" : "A decision under pressure"}</strong><small>{timecode(moment.event_timestamp)} · {moment.insight_kind === "attacking_turnover" ? "Find the earlier release" : "Find the passing angle"}</small></span><span className="moment-arrow">↗</span></button>)}</div>
    {error ? <div className="studio-loading" role="alert"><p>{error}. Start the local Rust API to load simulation evidence.</p><button type="button" onClick={() => { setError(null); setAttempt(attempt + 1); }}>Retry scenario library</button></div> : active ? <SceneLoader key={active.insight_id} id={active.insight_id} /> : <div className="studio-loading" role="status"><p>{moments === null ? "Loading authored tactical moments…" : "No linked scenarios available."}</p></div>}
  </section>;
}
