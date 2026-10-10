"use client";
import { useEffect, useState } from "react";
import { matchApi, type MatchEvent, type MatchSnapshot, type TacticalInsight } from "./match-contracts";

export function useMatchReplay(replay: { at: number; generation: number }) {
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [insights, setInsights] = useState<TacticalInsight[]>([]);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState<string | null>(null);
  const [loadedGeneration, setLoadedGeneration] = useState(-1);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    let clock = replay.at;
    let source: EventSource | undefined;
    const controller = new AbortController();
    const seenEvents = new Set<number>();
    const seenInsights = new Set<string>();
    async function get<T>(path: string): Promise<T> {
      const response = await fetch(`${matchApi}/api/v1/matches/demo/${path}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Replay HTTP ${response.status}`);
      return await response.json() as T;
    }
    async function refresh(at: number) {
      const request = ++latestRequest;
      try {
        const data = await get<MatchSnapshot>(`snapshot?at=${at}`);
        if (active && request === latestRequest) { setSnapshot(data); setError(null); }
      } catch (cause) {
        if (active && request === latestRequest) setError(cause instanceof Error ? cause.message : "API unavailable");
      }
    }
    async function start() {
      try {
        const [records, available, initial] = await Promise.all([
          get<MatchEvent[]>("events"), get<TacticalInsight[]>(`insights?at=${replay.at}`), get<MatchSnapshot>(`snapshot?at=${replay.at}`),
        ]);
        if (!active) return;
        const selected = records.filter(e => e.timestamp_seconds <= replay.at);
        selected.forEach(e => seenEvents.add(e.id));
        available.forEach(i => seenInsights.add(i.insight_id));
        setEvents(selected); setInsights(available); setSnapshot(initial); setError(null); setStatus("connecting"); setLoadedGeneration(replay.generation);
        source = new EventSource(`${matchApi}/api/v1/matches/demo/stream?after=${replay.at}`);
        source.addEventListener("open", () => { if (active) setStatus("live replay"); });
        source.addEventListener("match-event", raw => {
          const event = JSON.parse((raw as MessageEvent).data) as MatchEvent;
          if (!active || seenEvents.has(event.id) || event.timestamp_seconds < clock) return;
          seenEvents.add(event.id); clock = event.timestamp_seconds;
          setEvents(previous => [...previous, event]);
          void refresh(event.timestamp_seconds);
        });
        source.addEventListener("tactical-insight", raw => {
          const insight = JSON.parse((raw as MessageEvent).data) as TacticalInsight;
          if (!active || insight.schema_version !== "tactical_intelligence_v1" || seenInsights.has(insight.insight_id)
              || insight.event_timestamp > clock || !insight.source_event_ids.every(id => seenEvents.has(id))) return;
          seenInsights.add(insight.insight_id);
          setInsights(previous => [...previous, insight]);
        });
        source.addEventListener("replay-complete", () => { if (active) setStatus("replay complete"); source?.close(); });
        source.onerror = () => { if (active && source?.readyState !== EventSource.CLOSED) setStatus("reconnecting"); };
      } catch (cause) { if (active) { setSnapshot(null); setEvents([]); setInsights([]); setLoadedGeneration(replay.generation); setStatus("unavailable"); setError(cause instanceof Error ? cause.message : "API unavailable"); } }
    }
    void start();
    return () => { active = false; controller.abort(); source?.close(); };
  }, [replay.at, replay.generation]);
  return loadedGeneration === replay.generation ? { snapshot, events, insights, status, error }
    : { snapshot: null, events: [], insights: [], status: "connecting", error: null };
}
