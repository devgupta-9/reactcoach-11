import type { MatchEvent, MatchSnapshot, TacticalInsight } from "./match-contracts";

// Display duration in the accelerated replay, never a modeled reaction window.
export const MOMENT_WINDOW_SECONDS = 120;
export const evidenceButtonId = (insightId: string) => `inspect-evidence-${insightId}`;

export function availableMoments(insights: TacticalInsight[], events: MatchEvent[], snapshot: MatchSnapshot | null) {
  if (!snapshot) return [];
  const records = new Map(events.map(event => [event.id, event]));
  const seen = new Set<string>();
  return insights.filter(insight => {
    const trigger = records.get(insight.source_event_ids.at(-1) ?? -1);
    if (seen.has(insight.insight_id) || insight.schema_version !== "tactical_intelligence_v1"
        || insight.match_id !== snapshot.match_id || insight.event_timestamp > snapshot.elapsed_seconds
        || !trigger || trigger.timestamp_seconds !== insight.event_timestamp
        || !insight.source_event_ids.every(id => {
          const record = records.get(id);
          return record && record.timestamp_seconds <= insight.event_timestamp
            && (record.match_id === undefined || record.match_id === snapshot.match_id);
        })) return false;
    seen.add(insight.insight_id);
    return true;
  }).sort((a, b) => a.event_timestamp - b.event_timestamp || (a.insight_id < b.insight_id ? -1 : a.insight_id > b.insight_id ? 1 : 0));
}

export function timedMoment(insights: TacticalInsight[], events: MatchEvent[], snapshot: MatchSnapshot | null, complete: boolean) {
  if (complete || events.at(-1)?.kind === "full_time") return null;
  const moment = availableMoments(insights, events, snapshot).at(-1);
  return moment && snapshot && snapshot.elapsed_seconds - moment.event_timestamp < MOMENT_WINDOW_SECONDS ? moment : null;
}
