import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { MatchEvent, MatchSnapshot, TacticalInsight } from "../app/match-contracts";

const api = `${process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080"}/api/v1/matches/demo`;
const frame = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

async function fixture(request: APIRequestContext) {
  const [records, moments] = await Promise.all([request.get(`${api}/events`), request.get(`${api}/insights`)]);
  expect(records.status()).toBe(200); expect(moments.status()).toBe(200);
  return { events: await records.json() as MatchEvent[], insights: await moments.json() as TacticalInsight[] };
}

async function stream(page: Page, after: number, body = "") {
  await page.route(`**/stream?after=${after}`, route => route.fulfill({
    contentType: "text/event-stream", body: `retry: 600000\n\n${body}`,
  }));
}

async function seek(page: Page, second: number) {
  await page.getByRole("spinbutton", { name: "Start at second" }).fill(String(second));
  await page.getByRole("button", { name: "Seek replay" }).click();
}

function fullReplay(events: MatchEvent[], insights: TacticalInsight[]) {
  return events.map(event => frame("match-event", event)
    + insights.filter(insight => insight.source_event_ids.at(-1) === event.id).map(insight => frame("tactical-insight", insight)).join("")).join("")
    + "event: replay-complete\ndata: complete\n\n";
}

test("the timed cue waits for its source and verified snapshot without duplicate moments", async ({ page, request }, testInfo) => {
  const { events, insights } = await fixture(request);
  const moment = insights[0]; const trigger = moment.source_event_ids.at(-1)!;
  const prefix = events.filter(event => event.id <= trigger);
  let release!: () => void; let captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(resolve => { captured = resolve; });
  await page.route(`**/snapshot?at=${moment.event_timestamp}`, async route => {
    const response = await route.fetch(); captured(); await gate; await route.fulfill({ response });
  });
  await stream(page, 0, frame("tactical-insight", insights[1]) // Future evidence must be ignored.
    + frame("tactical-insight", moment) // Trigger is still absent.
    + prefix.map(event => frame("match-event", event)).join("")
    + frame("tactical-insight", moment)
    + frame("match-event", prefix.at(-1)) + frame("tactical-insight", moment));
  try {
    await page.goto("/"); await held;
    await expect(page.locator(`.timeline-item[data-event-id="${trigger}"]`)).toBeVisible();
    await expect(page.locator(".tactical-card")).toHaveCount(1);
    await expect(page.locator(".timed-moment")).toHaveCount(0);
    // A slow entrance makes premature geometry sampling fail deterministically.
    await page.addStyleTag({ content: ".timed-moment { animation-duration: 1s; }" });
    release();
    await expect(page.locator(".timed-moment")).toHaveAttribute("data-source-event-id", String(trigger));
    await expect(page.locator(".timed-moment")).toHaveAttribute("data-insight-id", moment.insight_id);
    await expect(page.locator(".timed-moment")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator(".tactical-card")).toHaveCount(1);
    await expect(page.locator(".timeline-item")).toHaveCount(prefix.length);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      await page.locator(".timed-moment").evaluate(async cue => {
        await Promise.all(cue.getAnimations().map(animation => animation.finished));
      });
      const [cueBox, pitchBox, stageBox] = await page.locator(".match-pitch-stage").evaluate(stage =>
        [stage.querySelector(".timed-moment")!, stage.querySelector(".pitch")!, stage].map(element => {
          const { y, height } = element.getBoundingClientRect();
          return { y, height };
        }));
      expect(cueBox.y).toBeGreaterThanOrEqual(pitchBox.y + pitchBox.height);
      expect(cueBox.y + cueBox.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 1);
      const inspect = page.locator(".timed-moment").getByRole("button", { name: "Inspect this moment" });
      await inspect.scrollIntoViewIfNeeded(); await expect(inspect).toBeInViewport({ ratio: 1 });
      await page.locator(".pitch-panel").screenshot({ path: testInfo.outputPath(`moment-${width}.png`) });
    }
  } finally { release(); }
});

test("cue expiry and dismissal preserve evidence and seeking reconstructs the destination", async ({ page }) => {
  for (const at of [112, 231, 232, 335]) await stream(page, at);
  await page.goto("/"); await seek(page, 112);
  const cue = page.getByRole("complementary", { name: "Timed tactical moment" });
  await expect(cue).toContainText("01:52"); await expect(cue).toHaveAttribute("aria-live", "off");
  await cue.getByRole("button", { name: "Dismiss moment at 01:52" }).click();
  await expect(cue).toHaveCount(0); await expect(page.locator(".tactical-card")).toHaveCount(1);
  await seek(page, 231); await expect(cue).toContainText("01:52");
  await seek(page, 232); await expect(page.locator(".score-center small")).toContainText("03:52");
  await expect(cue).toHaveCount(0); await expect(page.locator(".tactical-card")).toHaveCount(1);
  await seek(page, 335); await expect(cue).toContainText("05:35");
  await seek(page, 112); await expect(cue).toContainText("01:52");
  await expect(page.locator(".tactical-card")).toHaveCount(1);
});

test("a cue opens the shared comparison and restart rejects its delayed evidence", async ({ page }) => {
  await stream(page, 335); await stream(page, 0);
  let release!: () => void; let captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(resolve => { captured = resolve; });
  await page.route("**/insights/*pressure-forward-001", async route => {
    const response = await route.fetch(); captured(); await gate; await route.fulfill({ response });
  });
  try {
    await page.goto("/"); await seek(page, 335);
    await page.locator(".timed-moment").getByRole("button", { name: "Inspect this moment" }).click();
    await held;
    await expect(page.locator(".tactical-evidence")).toContainText("Loading linked evidence");
    await expect(page.locator(".tactical-evidence")).toBeFocused();
    await expect(page.getByRole("button", { name: "Inspect evidence at 05:35" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Restart replay" }).click(); release();
    await expect(page.locator(".tactical-evidence")).toHaveCount(0);
    await expect(page.locator(".timed-moment")).toHaveCount(0);
    await expect(page.locator(".tactical-card")).toHaveCount(0);
  } finally { release(); }
});

test("repeated inspection preserves loaded evidence and restores keyboard focus", async ({ page }) => {
  await stream(page, 335);
  let requests = 0;
  page.on("request", request => { if (request.url().endsWith("pressure-forward-001")) requests++; });
  await page.goto("/"); await seek(page, 335);
  const inspect = page.locator(".timed-moment").getByRole("button", { name: "Inspect this moment" });
  await inspect.click();
  await expect(page.locator(".tactical-evidence .trace-player")).toBeVisible();
  const trace = await page.locator(".tactical-evidence .trace-player").getAttribute("data-trace-id");
  await inspect.click();
  await expect(page.locator(".tactical-evidence")).toBeFocused();
  await expect(page.locator(".tactical-evidence .trace-player")).toHaveAttribute("data-trace-id", trace!);
  expect(requests).toBe(1);
  await page.getByRole("button", { name: "Close evidence" }).click(); await expect(inspect).toBeFocused();
  await page.getByRole("button", { name: "Dismiss moment at 05:35" }).click();
  await expect(page.getByRole("button", { name: "Inspect evidence at 05:35" })).toBeFocused();
});

test("automatic cue expiry restores focus only when the removed cue owned it", async ({ page, request }) => {
  const { events, insights } = await fixture(request);
  const at = insights[0].event_timestamp + 119;
  const next = events.find(event => event.timestamp_seconds > at)!;
  let release = () => {};
  let gate = Promise.resolve();
  await page.route(`**/stream?after=${at}`, async route => {
    await gate;
    await route.fulfill({ contentType: "text/event-stream", body: `retry: 600000\n\n${frame("match-event", next)}` });
  });
  try {
    await page.goto("/");
    for (const inside of [true, false]) {
      gate = new Promise<void>(resolve => { release = resolve; });
      await seek(page, at); await expect(page.locator(".timed-moment")).toBeVisible();
      const target = inside ? page.locator(".timed-moment").getByRole("button", { name: "Inspect this moment" })
        : page.getByRole("button", { name: "Seek replay" });
      await target.focus(); release();
      await expect(page.locator(".timed-moment")).toHaveCount(0);
      await expect(inside ? page.getByRole("button", { name: "Inspect evidence at 01:52" }) : target).toBeFocused();
    }
  } finally { release(); }
});

test("recap waits for a coherent final snapshot after the stream completes", async ({ page, request }) => {
  const { events, insights } = await fixture(request);
  let release!: () => void; let captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(resolve => { captured = resolve; });
  await page.route("**/snapshot?at=420", async route => {
    const response = await route.fetch(); captured(); await gate; await route.fulfill({ response });
  });
  await stream(page, 0, fullReplay(events, insights));
  try {
    await page.goto("/"); await held;
    await expect(page.locator(".score-center small")).toContainText("REPLAY COMPLETE");
    await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "awaiting_snapshot");
    await expect(page.locator(".recap-score")).toHaveCount(0);
    release();
    await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "ready");
    await expect(page.locator(".recap-score")).toHaveText("1 : 0");
    await expect(page.locator(".timed-moment")).toHaveCount(0);
  } finally { release(); }
});

test("failed final evidence recovers even when the seek input is invalid", async ({ page, request }) => {
  const { events, insights } = await fixture(request);
  let allowFinal = false;
  await page.route("**/snapshot?at=420", async route => {
    if (allowFinal) await route.fulfill({ response: await route.fetch() });
    else await route.fulfill({ status: 503, body: "final snapshot unavailable" });
  });
  await stream(page, 0, fullReplay(events, insights));
  await stream(page, 420, "event: replay-complete\ndata: complete\n\n");
  await page.goto("/");
  await expect(page.locator(".match-center > .error")).toContainText("503");
  await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "awaiting_snapshot");
  await expect(page.locator(".recap-score")).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("421");
  await expect(page.getByRole("button", { name: "Seek replay" })).toBeDisabled();
  allowFinal = true; await page.getByRole("button", { name: "Reload final evidence" }).click();
  await expect(page.getByRole("group", { name: "Replay controls" })).toBeFocused();
  await expect(page.getByRole("spinbutton", { name: "Start at second" })).toHaveValue("420");
  await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "ready");
  await expect(page.locator(".match-center > .error")).toHaveCount(0);
});

test("recap matches source totals and opens saved coaching by keyboard", async ({ page, request }, testInfo) => {
  const { events, insights } = await fixture(request);
  const expected = await (await request.get(`${api}/snapshot?at=420`)).json() as MatchSnapshot;
  // Completion is an SSE signal; the authored segment ends on a goal record.
  expect(expected.latest_event?.kind).toBe("goal");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/"); await seek(page, 420);
  const recap = page.getByRole("region", { name: "Match recap", exact: true });
  await expect(recap).toHaveAttribute("data-state", "ready");
  await expect(recap).toHaveAttribute("data-final-event-id", String(expected.latest_event!.id));
  await expect(recap.locator(".recap-score")).toHaveText(`${expected.score.home} : ${expected.score.away}`);
  await expect(recap.locator('[data-stat="passes"] dd')).toHaveText(`${expected.statistics.home_passes} — ${expected.statistics.away_passes}`);
  await expect(recap.locator('[data-stat="shots"] dd')).toHaveText(`${expected.statistics.home_shots} — ${expected.statistics.away_shots}`);
  await expect(recap.locator(".recap-moment")).toHaveCount(insights.length);
  const goals = events.filter(event => event.kind === "goal");
  await expect(recap.locator("[data-goal-event-id]")).toHaveCount(goals.length);
  for (const goal of goals) await expect(recap.locator(`[data-goal-event-id="${goal.id}"]`)).toContainText(goal.player);
  const review = recap.getByRole("button", { name: "Review coaching at 01:52" });
  await review.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".tactical-evidence")).toBeFocused();
  await expect(page.locator(".tactical-evidence .coaching-explanation")).toContainText("FOUNDRY COMPOSITION");
  await expect(page.locator(".tactical-evidence .trace-player")).toHaveAttribute("data-trace-id", insights[0].baseline_trace_id);
  await page.getByRole("button", { name: "Close evidence" }).focus(); await page.keyboard.press("Enter");
  await expect(review).toBeFocused();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await recap.screenshot({ path: testInfo.outputPath(`recap-${width}.png`) });
  }
  await recap.getByText("Recap sources and model limits", { exact: true }).click();
  await expect(recap.getByRole("link", { name: "Final snapshot (JSON)" })).toHaveAttribute("href", `${api}/snapshot?at=420`);
  await expect(recap).toContainText("uncalibrated");
});

test("recap never manufactures a missing corrective recommendation", async ({ page }) => {
  await page.route("**/insights?at=420", async route => {
    const response = await route.fetch(); const moments = await response.json() as TacticalInsight[];
    moments[0].recommended_action = null; moments[0].corrected_trace_id = null;
    moments[0].comparison_evidence.corrected = null;
    moments[0].comparison_evidence.summary = "UNSUPPORTED CORRECTION CLAIM";
    await route.fulfill({ response, json: moments });
  });
  await page.goto("/"); await seek(page, 420);
  const moment = page.locator(".recap-moment").first();
  await expect(moment).toContainText("No better feasible correction is supported by this scenario");
  await expect(moment.locator(".recap-modeled-option")).toHaveCount(0);
  await expect(moment).not.toContainText("UNSUPPORTED CORRECTION CLAIM");
});

test("a delayed final snapshot cannot restore a recap after seeking backward", async ({ page, request }) => {
  const { events, insights } = await fixture(request);
  let release!: () => void; let captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(resolve => { captured = resolve; });
  await page.route("**/snapshot?at=420", async route => {
    const response = await route.fetch(); captured(); await gate; await route.fulfill({ response });
  });
  await stream(page, 0, fullReplay(events, insights)); await stream(page, 112);
  try {
    await page.goto("/"); await held;
    await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "awaiting_snapshot");
    await seek(page, 112); release();
    await expect(page.locator(".timed-moment")).toHaveAttribute("data-source-event-id", "9");
    await expect(page.locator(".match-recap")).toHaveCount(0);
    await expect(page.locator(".tactical-card")).toHaveCount(1);
    await expect(page.locator(".score-center small")).toContainText("01:52");
  } finally { release(); }
});

test("incoherent final snapshots cannot publish recap totals", async ({ page, request }) => {
  const expected = await (await request.get(`${api}/snapshot?at=420`)).json() as MatchSnapshot;
  const mutations: Array<(snapshot: MatchSnapshot) => void> = [
    value => { value.latest_event!.match_id = "another-match"; },
    value => { value.latest_event!.id = -1; },
    value => { value.latest_event!.kind = "full_time"; },
    value => { value.latest_event!.timestamp_seconds -= 1; },
    value => { value.events_processed -= 1; },
    value => { value.elapsed_seconds -= 1; },
  ];
  let mutate = mutations[0];
  await page.route("**/snapshot?at=420", route => {
    const candidate = structuredClone(expected); mutate(candidate);
    return route.fulfill({ json: candidate });
  });
  await stream(page, 420, "event: replay-complete\ndata: complete\n\n");
  await page.goto("/");
  for (mutate of mutations) {
    const received = page.waitForResponse(response => response.url().endsWith("snapshot?at=420"));
    await seek(page, 420); await received;
    await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "awaiting_snapshot");
    await expect(page.locator(".recap-score")).toHaveCount(0);
  }
});

test("repeated replay generations keep one insight panel and one coherent recap", async ({ page }) => {
  for (const at of [0, 112, 335]) await stream(page, at);
  await stream(page, 420, "event: replay-complete\ndata: complete\n\n");
  await page.goto("/");
  for (const at of [112, 420, 335, 420, 0, 112]) {
    await seek(page, at);
    await expect(page.locator(".tactical-panel")).toHaveCount(1);
    await expect(page.locator(".tactical-card")).toHaveCount(at >= 335 ? 2 : at >= 112 ? 1 : 0);
    const ids = await page.locator(".tactical-card button").evaluateAll(buttons => buttons.map(button => button.id));
    expect(new Set(ids).size).toBe(ids.length);
    if (at === 420) await expect(page.locator(".match-recap")).toHaveAttribute("data-state", "ready");
    else await expect(page.locator(".match-recap")).toHaveCount(0);
  }
});
