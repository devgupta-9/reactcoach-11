import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { MatchEvent, TacticalInsight } from "../app/match-contracts";

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
    release();
    await expect(page.locator(".timed-moment")).toHaveAttribute("data-source-event-id", String(trigger));
    await expect(page.locator(".timed-moment")).toHaveAttribute("data-insight-id", moment.insight_id);
    await expect(page.locator(".timed-moment")).toHaveAttribute("aria-live", "polite");
    await expect(page.locator(".tactical-card")).toHaveCount(1);
    await expect(page.locator(".timeline-item")).toHaveCount(prefix.length);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
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
