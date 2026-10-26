import { expect, test } from "@playwright/test";
import type { InsightDetail, TacticalInsight } from "../app/match-contracts";

const base = `${process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080"}/api/v1/matches/demo`;

test("the ball remains unoccluded during possession and passing in both cameras", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const studio = page.locator("#studio");
  await expect(studio.locator(".trace-player")).toBeVisible();
  // Hit testing exposes 3D occlusion that toBeVisible cannot detect. This
  // temporary override changes no pixels; the production ball stays decorative.
  await page.addStyleTag({ content: ".spatial-ball, .spatial-ball span { pointer-events: auto !important; }" });
  const ball = studio.locator(".spatial-ball");
  async function expectBallInFront() {
    await studio.locator(".pitch-stage").scrollIntoViewIfNeeded();
    await expect.poll(() => ball.evaluate(element => {
      const box = element.getBoundingClientRect();
      return [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]].map(([dx, dy]) => {
        const top = document.elementFromPoint(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
        return top !== null && (top === element || element.contains(top));
      });
    })).toEqual([true, true, true, true, true]);
  }
  for (const moment of [/The wide-channel turnover/, /A decision under pressure/]) {
    await studio.getByRole("button", { name: moment }).click();
    for (const branch of ["Original decision", "Corrected decision"]) {
      await studio.getByRole("button", { name: branch, exact: true }).click();
      for (const camera of ["angled", "overhead"]) {
        if (await studio.locator(".pitch-stage").getAttribute("data-camera") !== camera) {
          await studio.getByRole("button", { name: camera === "angled" ? "3D view" : "Overhead view", exact: true }).click();
        }
        await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("Home");
        await expectBallInFront();
        if (camera === "angled") await expect.poll(() => studio.locator('[data-participant="assessed"] .player-shirt').evaluate(shirt => {
          const label = document.createRange();
          label.selectNodeContents(shirt);
          const box = label.getBoundingClientRect();
          const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return top !== null && (top === shirt || shirt.contains(top));
        })).toBe(true);
        await studio.locator(".pitch-stage").screenshot({ path: testInfo.outputPath(`ball-${moment.source}-${branch}-${camera}-initial.png`) });
        await studio.getByRole("button", { name: /03 Adapt/ }).click();
        await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("ArrowRight");
        await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("ArrowRight");
        await expect(ball).toHaveAttribute("data-owner", branch === "Corrected decision" ? "in_flight" : "assessed");
        await expectBallInFront();
        if (branch === "Corrected decision") await studio.locator(".pitch-stage").screenshot({ path: testInfo.outputPath(`ball-${moment.source}-${camera}-pass.png`) });
        await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("End");
        await expect(ball).toHaveAttribute("data-owner", branch === "Corrected decision" ? "teammate" : "opponent");
        await expectBallInFront();
      }
    }
  }
});

test("both decision branches display the exact Rust states and identical starting coordinates", async ({ page, request }) => {
  const insights = await (await request.get(`${base}/insights`)).json() as TacticalInsight[];
  const detail = await (await request.get(`${base}/insights/${insights[0].insight_id}`)).json() as InsightDetail;
  const corrected = detail.simulation.alternatives.find(item => item.trace?.id === detail.simulation.recommended_trace_id)!.trace!;
  await page.goto("/");
  const studio = page.locator("#studio");
  const player = studio.locator('[data-participant="assessed"]');
  const viewer = studio.locator(".trace-player");
  await expect(viewer).toHaveAttribute("data-trace-id", `${detail.trace_namespace}/${detail.simulation.baseline.id}`);
  const initial = detail.simulation.baseline.steps[0].state.assessed.position_mm;
  await expect(player).toHaveAttribute("data-x-mm", String(initial.x));
  await expect(player).toHaveAttribute("data-y-mm", String(initial.y));
  await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("End");
  const originalEnd = detail.simulation.baseline.steps.at(-1)!.state;
  await expect(player).toHaveAttribute("data-x-mm", String(originalEnd.assessed.position_mm.x));
  await expect(viewer).toHaveAttribute("data-elapsed-ms", String(originalEnd.elapsed_ms));
  await expect(studio.locator(".spatial-ball")).toHaveAttribute("data-owner", "opponent");
  await studio.getByRole("button", { name: "Corrected decision", exact: true }).click();
  await expect(player).toHaveAttribute("data-x-mm", String(initial.x));
  await expect(player).toHaveAttribute("data-y-mm", String(initial.y));
  await expect(viewer).toHaveAttribute("data-trace-id", `${detail.trace_namespace}/${corrected.id}`);
  await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("End");
  const correctedEnd = corrected.steps.at(-1)!.state;
  await expect(player).toHaveAttribute("data-x-mm", String(correctedEnd.assessed.position_mm.x));
  await expect(player).toHaveAttribute("data-y-mm", String(correctedEnd.assessed.position_mm.y));
  await expect(studio.locator(".spatial-ball")).toHaveAttribute("data-owner", correctedEnd.ball.possession.kind === "owned" ? correctedEnd.ball.possession.owner : correctedEnd.ball.possession.kind);
  await expect(studio.locator(".outcome-comparison")).toContainText("Possession retained");
  await studio.getByText("How this scene connects to the match", { exact: false }).click();
  await expect(studio.locator(".studio-evidence")).toContainText("turnover-wide-001");
  await expect(studio.locator(".studio-evidence")).toContainText("6, 8, 9");
});

test("playback pauses, resets, inspects players and changes camera without changing the trace", async ({ page, request }) => {
  const insights = await (await request.get(`${base}/insights`)).json() as TacticalInsight[];
  const detail = await (await request.get(`${base}/insights/${insights[0].insight_id}`)).json() as InsightDetail;
  await page.goto("/");
  const studio = page.locator("#studio");
  const viewer = studio.locator(".trace-player");
  await expect(viewer).toBeVisible();
  const trace = await viewer.getAttribute("data-trace-id");
  await studio.getByRole("button", { name: "Play tactical playback" }).click();
  await expect.poll(async () => Number(await viewer.getAttribute("data-elapsed-ms"))).toBeGreaterThan(100);
  await studio.getByRole("button", { name: "Pause tactical playback" }).click();
  const paused = await viewer.getAttribute("data-elapsed-ms");
  await page.waitForTimeout(250);
  await expect(viewer).toHaveAttribute("data-elapsed-ms", paused!);
  await studio.getByRole("button", { name: "Inspect defender", exact: true }).click();
  await expect(studio.locator(".player-inspector h4")).toHaveText(detail.simulation.input.opponent.label);
  await studio.getByRole("button", { name: "Overhead view", exact: true }).click();
  await expect(studio.locator(".pitch-stage")).toHaveAttribute("data-camera", "overhead");
  await studio.getByRole("button", { name: "Whole pitch", exact: true }).click();
  await expect(studio.locator(".pitch-stage")).toHaveClass(/whole-pitch/);
  await expect(viewer).toHaveAttribute("data-trace-id", trace!);
  await studio.getByRole("button", { name: "Reset tactical playback" }).click();
  await expect(viewer).toHaveAttribute("data-elapsed-ms", "0");
  await studio.getByRole("button", { name: /02 Counter/ }).click();
  await expect(studio.locator(".current-evidence")).toContainText("Defender:");
});

test("a late scenario response cannot replace a newly selected moment", async ({ page }) => {
  let release!: () => void;
  let captured!: () => void;
  let settled!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const intercepted = new Promise<void>(resolve => { captured = resolve; });
  const delivered = new Promise<void>(resolve => { settled = resolve; });
  await page.route(/\/insights\/[^?]*pressure-forward-001\?at=420$/, async route => {
    const response = await route.fetch(); captured(); await gate;
    try { await route.fulfill({ response }); } finally { settled(); }
  });
  await page.goto("/");
  const studio = page.locator("#studio");
  await expect(studio.locator(".trace-player")).toBeVisible();
  await studio.getByRole("button", { name: /A decision under pressure/ }).click();
  await intercepted;
  await expect(studio.locator(".trace-player")).toHaveCount(0);
  await studio.getByRole("button", { name: /The wide-channel turnover/ }).click();
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-trace-id", /turnover-wide-001/);
  release(); await delivered;
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-trace-id", /turnover-wide-001/);
});

test("reduced motion disables animation but preserves keyboard scrubbing and branch comparison", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const studio = page.locator("#studio");
  await expect(studio.getByRole("button", { name: "Play tactical playback" })).toBeDisabled();
  await expect(studio.locator(".motion-note")).toContainText("Reduced motion");
  await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("End");
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-elapsed-ms", "4000");
  await studio.getByRole("button", { name: "Corrected decision", exact: true }).click();
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-elapsed-ms", "0");
});

test("both authored scenes render and remain usable at desktop and narrow widths", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const studio = page.locator("#studio");
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-trace-id", /turnover-wide-001/);
  await studio.getByRole("button", { name: /A decision under pressure/ }).click();
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-trace-id", /pressure-forward-001/);
  await studio.getByRole("button", { name: "Corrected decision", exact: true }).click();
  await studio.getByRole("slider", { name: "Simulation time", exact: true }).press("End");
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await expect(studio.getByRole("button", { name: "Original decision", exact: true })).toBeVisible();
    await expect(studio.getByRole("slider", { name: "Simulation time", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`studio-${width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test("scenario failures recover and missing recommendations never invent a correction", async ({ page, request }) => {
  const insights = await (await request.get(`${base}/insights`)).json() as TacticalInsight[];
  const detail = await (await request.get(`${base}/insights/${insights[0].insight_id}`)).json() as InsightDetail;
  detail.simulation.recommended_correction = null;
  detail.simulation.recommended_trace_id = null;
  detail.insight.recommended_action = null;
  detail.insight.corrected_trace_id = null;
  detail.insight.comparison_evidence.corrected = null;
  let calls = 0;
  await page.route(/\/insights\/[^?]*turnover-wide-001\?at=420$/, route => {
    calls++;
    return calls === 1 ? route.fulfill({ status: 503, body: "unavailable" }) : route.fulfill({ json: detail });
  });
  await page.goto("/");
  const studio = page.locator("#studio");
  await expect(studio.getByRole("alert")).toContainText("503");
  await studio.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(studio.getByRole("button", { name: "Corrected decision", exact: true })).toBeDisabled();
  await expect(studio.locator(".outcome-comparison")).toContainText("No better option found");
  await expect(studio.locator(".trace-player")).toHaveAttribute("data-trace-id", /baseline/);
});

test("match event selection and navigation remain connected to the replay", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("420");
  await page.getByRole("button", { name: "Seek replay", exact: true }).click();
  await expect(page.locator(".timeline-item")).toHaveCount(23);
  await page.locator('.timeline-item[data-event-id="9"]').click();
  await expect(page.locator(".metrics-panel .insight")).toContainText("SELECTED EVENT");
  await expect(page.locator(".metrics-panel .insight")).toContainText("TURNOVER");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Decision Lab", exact: true }).click();
  await expect(page).toHaveURL(/#decision-lab$/);
  await expect(page.locator(".rx-lab")).toBeInViewport();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Tactical Studio", exact: true }).click();
  await expect(page).toHaveURL(/#studio$/);
});

test("navigation stays aligned when delayed studio evidence expands the page", async ({ page }) => {
  let release!: () => void;
  let ready!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const responseReady = new Promise<void>(resolve => { ready = resolve; });
  await page.route("**/api/v1/matches/demo/insights/*", async route => {
    const response = await route.fetch();
    ready();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    await page.getByRole("spinbutton", { name: "Start at second" }).fill("420");
    await page.getByRole("button", { name: "Seek replay", exact: true }).click();
    await expect(page.locator(".timeline-item")).toHaveCount(23);
    await responseReady;
    await page.locator('.timeline-item[data-event-id="9"]').click();
    await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Decision Lab", exact: true }).click();
    release();
    await expect(page.locator(".tactical-studio .trace-player")).toBeVisible();
    await expect(page).toHaveURL(/#decision-lab$/);
    await expect(page.locator(".rx-lab")).toBeInViewport();
  } finally {
    release();
  }
});
