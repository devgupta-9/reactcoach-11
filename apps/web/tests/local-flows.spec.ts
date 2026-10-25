import { expect, test, type Page } from "@playwright/test";

const api = `${process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8080"}/api/v1`;
const lab = (page: Page) => page.locator(".rx-lab");

async function setTrait(page: Page, label: string, value: number) {
  const slider = page.getByRole("slider", { name: label, exact: true });
  await slider.focus();
  await slider.press(value === 100 ? "End" : "Home");
  if (value !== 100) {
    for (let i = 0; i < value; i++) await slider.press("ArrowRight");
  }
  await expect(slider).toHaveValue(String(value));
}

test("all decision scenarios and the offside position demonstration render", async ({ page, request }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.goto("/");
  for (const [scenario, tab] of [["open_play", "Open play"], ["penalty", "Penalties"], ["free_kick", "Free kicks"]]) {
    await page.getByRole("button", { name: new RegExp(`^${tab}`) }).click();
    const response = await request.get(`${api}/decision-lab/demo?scenario=${scenario}`);
    expect(response.ok()).toBeTruthy();
    const report = await response.json();
    const best = report.actions.find((action: { id: string }) => action.id === report.recommended_action_id);
    await expect(lab(page).locator(".rx-choice-best h3")).toHaveText(best.label);
    await expect(lab(page).locator(".rx-counter.selected h4")).toHaveText(
      best.opponent_responses.find((counter: { id: string }) => counter.id === best.chosen_opponent_response_id).label,
    );
    await expect(lab(page).locator(".rx-alternatives > div")).toHaveCount(3);
    await expect(lab(page).locator(".rx-footnote")).toContainText("Not real-player scouting");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }
  await page.getByRole("button", { name: /^Offside timing/ }).click();
  await expect(lab(page).locator(".rx-choice h3").first()).toHaveText("offside position");
  await expect(lab(page).locator(".rx-choice-best h3")).toHaveText("onside position");
  await expect(lab(page).locator(".rx-footnote")).toContainText("Not an offside offence decision");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath("offside.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("editing assessed strengths reranks the recommendation", async ({ page }) => {
  await page.goto("/");
  await expect(lab(page).locator(".rx-choice-best h3")).toHaveText("Accelerate into the outside channel");
  await setTrait(page, "Assessed player Acceleration", 5);
  await setTrait(page, "Assessed player Technique", 100);
  await setTrait(page, "Assessed player Composure", 100);
  await setTrait(page, "Assessed player Passing", 5);
  await expect(lab(page).getByRole("status")).toContainText("Ratings changed");
  await page.getByRole("button", { name: /^Recalculate/ }).click();
  await expect(lab(page).locator(".rx-choice-best h3")).toHaveText("Direct dribble");
  await expect(lab(page).locator(".rx-gain strong")).toHaveText("0 fit-index points");
  await expect(lab(page).getByRole("status")).toHaveCount(0);
});

test("editing opponent strengths changes the selected counter", async ({ page }) => {
  await page.goto("/");
  await expect(lab(page).locator(".rx-choice-best h3")).toBeVisible();
  for (const [trait, value] of [["Acceleration", 0], ["Reactions", 0], ["Positioning", 100], ["Anticipation", 100]] as const) {
    await setTrait(page, `Opponent ${trait}`, value);
  }
  await page.getByRole("button", { name: /^Recalculate/ }).click();
  await expect(lab(page).locator(".rx-counter.selected h4")).toHaveText("Close the attacking angle");
  for (const [trait, value] of [["Acceleration", 100], ["Reactions", 100], ["Positioning", 0], ["Anticipation", 0]] as const) {
    await setTrait(page, `Opponent ${trait}`, value);
  }
  const evaluation = page.waitForResponse(`${api}/decision-lab/evaluate`);
  await page.getByRole("button", { name: /^Recalculate/ }).click();
  const report = await (await evaluation).json();
  expect(report.actions.find((action: { id: string }) => action.id === "accelerate_wide").chosen_opponent_response_id).toBe("track_wide_run");
  const best = report.actions.find((action: { id: string }) => action.id === report.recommended_action_id);
  await expect(lab(page).locator(".rx-counter.selected h4")).toHaveText(
    best.opponent_responses.find((counter: { id: string }) => counter.id === best.chosen_opponent_response_id).label,
  );
});

test("a late evaluation cannot overwrite a newly selected scenario", async ({ page }) => {
  let release!: () => void;
  let captured!: () => void;
  let settled!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const intercepted = new Promise<void>((resolve) => { captured = resolve; });
  const delivered = new Promise<void>((resolve) => { settled = resolve; });
  await page.route("**/decision-lab/evaluate", async (route) => {
    const response = await route.fetch();
    captured();
    await gate;
    try {
      await route.fulfill({ response });
    } finally {
      settled();
    }
  });
  await page.goto("/");
  await expect(lab(page).locator(".rx-choice-best h3")).toBeVisible();
  await page.getByRole("button", { name: /^Recalculate/ }).click();
  await intercepted;
  await expect(page.getByRole("slider", { name: "Assessed player Acceleration", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /^Penalties/ }).click();
  await expect(lab(page).locator(".rx-alternatives")).toContainText("Early power shot");
  release();
  await delivered;
  await expect(lab(page).locator(".rx-actions button")).toBeEnabled();
  await expect(lab(page).locator(".rx-alternatives")).toContainText("Early power shot");
  await expect(lab(page).locator(".rx-alternatives")).not.toContainText("Direct dribble");
});

test("replay completes with 23 events and ignores a late older snapshot", async ({ page }, testInfo) => {
  let release!: () => void;
  let finished!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const fulfilled = new Promise<void>((resolve) => { finished = resolve; });
  await page.route("**/snapshot?at=365", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
    finished();
  });
  await page.goto("/");
  await expect(page.locator(".score-center small")).toContainText("REPLAY COMPLETE", { timeout: 35_000 });
  await expect(page.locator(".score")).toHaveText("1 : 0");
  await expect(page.locator(".timeline-item")).toHaveCount(23);
  await expect(page.locator(".pitch-dot")).toHaveCount(23);
  release();
  await fulfilled;
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".score-center small")).toContainText("07:00");
  await expect(page.locator(".score")).toHaveText("1 : 0");
  await expect(page.locator(".statrow").last().locator("strong")).toHaveText("23");
  await page.screenshot({ path: testInfo.outputPath("replay.png"), fullPage: true });
});

test("scenario errors are visible and selecting another mode recovers", async ({ page }) => {
  await page.route("**/decision-lab/demo?scenario=open_play", (route) => route.fulfill({ status: 503, body: "temporarily unavailable" }), { times: 1 });
  await page.goto("/");
  await expect(lab(page).getByRole("alert")).toContainText("HTTP 503");
  await page.getByRole("button", { name: /^Penalties/ }).click();
  await expect(lab(page).locator(".rx-choice-best h3")).toBeVisible();
  await expect(lab(page).getByRole("alert")).toHaveCount(0);
});

test("API inputs, deterministic counter selection, and snapshot boundaries", async ({ request }) => {
  const response = await request.get(`${api}/decision-lab/demo?scenario=open_play`);
  const report = await response.json();
  const repeated = await request.get(`${api}/decision-lab/demo?scenario=open_play`);
  expect(await repeated.json()).toEqual(report);
  for (const action of report.actions) {
    const selected = action.opponent_responses.find((counter: { id: string }) => counter.id === action.chosen_opponent_response_id);
    expect(selected.effectiveness_index).toBe(Math.max(...action.opponent_responses.map((counter: { effectiveness_index: number }) => counter.effectiveness_index)));
    expect(action.decision_fit_index).toBe(Math.max(0, action.uncountered_fit_index - action.counter_suppression_points));
  }
  const payload = { scenario: "open_play", assessed_player: { ...report.assessed_player, synthetic: false }, opponent: { ...report.opponent, synthetic: false } };
  const synthetic = await request.post(`${api}/decision-lab/evaluate`, { data: payload });
  expect((await synthetic.json()).assessed_player.synthetic).toBe(true);
  payload.opponent.traits.acceleration = 101;
  expect((await request.post(`${api}/decision-lab/evaluate`, { data: payload })).status()).toBe(400);
  expect((await request.get(`${api}/decision-lab/demo?scenario=unsupported`)).status()).toBe(400);
  expect((await request.post(`${api}/decision-lab/evaluate`, { data: {} })).status()).toBe(422);
  expect((await request.post(`${api}/decision-lab/evaluate`, { data: "x".repeat(17 * 1024), headers: { "Content-Type": "application/json" } })).status()).toBe(413);
  const before = await request.get(`${api}/matches/demo/snapshot?at=419`);
  const after = await request.get(`${api}/matches/demo/snapshot?at=999`);
  expect((await before.json()).score.home).toBe(0);
  expect((await after.json()).elapsed_seconds).toBe(420);
  expect((await after.json()).score.home).toBe(1);
});
