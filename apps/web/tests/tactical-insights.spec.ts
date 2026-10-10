import { expect, test } from "@playwright/test";

test("two different live insights follow their triggering events", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".tactical-card");
  await expect(cards).toHaveCount(0);
  await expect(cards).toHaveCount(1, { timeout: 15_000 });
  await expect(cards.first()).toHaveAttribute("data-event-id", "9");
  await expect(page.locator('.timeline-item[data-event-id="9"]')).toBeVisible();
  await expect(cards.first()).toContainText("01:52");
  await expect(cards.first()).toContainText("wide right");
  await expect(cards).toHaveCount(2, { timeout: 15_000 });
  await expect(cards.last()).toHaveAttribute("data-event-id", "17");
  await expect(page.locator('.timeline-item[data-event-id="17"]')).toBeVisible();
  await expect(cards.last()).toContainText("05:35");
  await expect(cards.last()).toContainText("direct dribble");
  await expect(cards.last()).toContainText("Uncalibrated ratings");
  await page.getByRole("button", { name: "Inspect evidence at 05:35" }).click();
  await expect(page.locator('.tactical-evidence')).toContainText("pressure-forward-001");
  await expect(page.locator('.tactical-evidence')).toContainText("16, 17");
  await expect(page.locator('.tactical-evidence')).toContainText("not observed player movement");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test("switching evidence rejects a late response and restarting clears prior evidence", async ({ page }) => {
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { captured = resolve; });
  await page.route("**/insights/*turnover-wide-001", async route => {
    const response = await route.fetch(); captured(); await gate;
    await route.fulfill({ response });
  });
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("335");
  await page.getByRole("button", { name: "Seek replay" }).click();
  await expect(page.locator(".tactical-card")).toHaveCount(2);
  await page.getByRole("button", { name: "Inspect evidence at 01:52" }).click();
  await intercepted;
  await expect(page.locator(".tactical-evidence")).toContainText("Loading linked evidence");
  await page.getByRole("button", { name: "Inspect evidence at 05:35" }).click();
  await expect(page.locator(".tactical-evidence")).toContainText("pressure-forward-001");
  release();
  await expect(page.locator(".tactical-evidence")).not.toContainText("turnover-wide-001");
  await page.getByRole("button", { name: "Restart replay" }).click();
  await expect(page.locator(".tactical-evidence")).toHaveCount(0);
  await expect(page.locator(".tactical-card")).toHaveCount(0);
  await expect(page.locator(".score")).toHaveText("0 : 0");
});

test("seeking restores only available insights and evidence errors recover", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("112");
  await page.getByRole("button", { name: "Seek replay" }).click();
  await expect(page.locator(".tactical-card")).toHaveCount(1);
  await expect(page.locator(".tactical-card")).toHaveAttribute("data-event-id", "9");
  await page.route("**/insights/*turnover-wide-001", route => route.fulfill({ status: 503, body: "temporarily unavailable" }), { times: 1 });
  await page.getByRole("button", { name: "Inspect evidence at 01:52" }).click();
  await expect(page.locator(".tactical-evidence").getByRole("alert")).toContainText("503");
  await page.getByRole("button", { name: "Close evidence" }).click();
  await page.getByRole("button", { name: "Inspect evidence at 01:52" }).click();
  await expect(page.locator(".tactical-evidence")).toContainText("turnover-wide-001");
  await expect(page.locator(".tactical-evidence")).toContainText("6, 8, 9");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("420");
  await page.getByRole("button", { name: "Seek replay" }).click();
  await expect(page.locator(".tactical-card")).toHaveCount(2);
  await expect(page.locator(".score-center small")).toContainText("07:00 · REPLAY COMPLETE");
  await expect(page.locator(".timeline-item")).toHaveCount(23);
  await page.getByRole("button", { name: "Inspect evidence at 05:35" }).click();
  await expect(page.locator(".tactical-evidence")).toContainText("pressure-forward-001");
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.locator(".tactical-panel").screenshot({ path: testInfo.outputPath(`tactical-${width}.png`) });
  }
});

test("repeated transport records neither duplicate insights nor regress the replay clock", async ({ page, request }) => {
  const base = "http://localhost:8080/api/v1/matches/demo";
  const events = await (await request.get(`${base}/events`)).json();
  const insights = await (await request.get(`${base}/insights`)).json();
  const frame = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  let body = frame("tactical-insight", insights[0]); // Too early: must be ignored until its source exists.
  for (const event of events) {
    body += frame("match-event", event);
    for (const insight of insights) if (insight.source_event_ids.at(-1) === event.id) body += frame("tactical-insight", insight);
  }
  // Reconnection can replay the same logical records with the same IDs.
  body += events.map((event: unknown) => frame("match-event", event)).join("");
  body += insights.map((insight: unknown) => frame("tactical-insight", insight)).join("");
  body += "event: replay-complete\ndata: complete\n\n";
  const snapshots: string[] = [];
  page.on("request", request => { if (request.url().includes("/snapshot?at=")) snapshots.push(request.url()); });
  await page.route("**/stream?after=0", route => route.fulfill({ contentType: "text/event-stream", body }));
  await page.goto("/");
  await expect(page.locator(".score-center small")).toContainText("07:00 · REPLAY COMPLETE");
  await expect(page.locator(".tactical-card")).toHaveCount(2);
  await expect(page.locator(".timeline-item")).toHaveCount(23);
  await expect(page.locator(".score")).toHaveText("1 : 0");
  expect(snapshots.filter(url => url.endsWith("at=112"))).toHaveLength(2); // Recovery 8 and turnover 9 share a second.
  expect(snapshots.filter(url => url.endsWith("at=420"))).toHaveLength(1);
});

test("a late seek initialization cannot overwrite a newer replay generation", async ({ page }) => {
  let release!: () => void;
  let captured!: () => void;
  let settled!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { captured = resolve; });
  const delivered = new Promise<void>(resolve => { settled = resolve; });
  await page.route("**/insights?at=112", async route => {
    const response = await route.fetch(); captured(); await gate;
    try { await route.fulfill({ response }); } finally { settled(); }
  });
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("112");
  await page.getByRole("button", { name: "Seek replay" }).click();
  await intercepted;
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("420");
  await page.getByRole("button", { name: "Seek replay" }).click();
  await expect(page.locator(".tactical-card")).toHaveCount(2);
  await expect(page.locator(".score-center small")).toContainText("07:00 · REPLAY COMPLETE");
  release(); await delivered;
  await expect(page.locator(".timeline-item")).toHaveCount(23);
  await expect(page.locator(".tactical-card")).toHaveCount(2);
  await expect(page.locator(".score-center small")).toContainText("07:00 · REPLAY COMPLETE");
});
