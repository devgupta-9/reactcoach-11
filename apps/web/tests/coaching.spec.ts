import { expect, test } from "@playwright/test";

test("both moments expose source-linked coaching with equivalent audience facts", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("420");
  await page.getByRole("button", { name: "Seek replay" }).click();
  await expect(page.locator(".tactical-card")).toHaveCount(2);
  const explanationIds: string[] = [];
  for (const [time, source] of [["01:52", "match-event/demo-match-001/9"], ["05:35", "match-event/demo-match-001/17"]]) {
    await page.getByRole("button", { name: `Inspect evidence at ${time}` }).click();
    const panel = page.getByRole("region", { name: "Evidence-grounded coaching" });
    await expect(panel).toBeVisible();
    explanationIds.push((await panel.getAttribute("data-explanation-id"))!);
    const fan = await panel.locator(".coaching-lines p").allTextContents();
    const fanIds = await panel.locator("[data-fact-id]").evaluateAll(lines => lines.map(line => line.getAttribute("data-fact-id")).sort());
    await expect(panel).toContainText("fictional");
    await expect(panel).toContainText(/not.*probabilit|no.*probabilit|not calibrated predictions/i);
    await panel.getByRole("button", { name: "Analyst", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Analyst", exact: true })).toHaveAttribute("aria-pressed", "true");
    const analyst = await panel.locator(".coaching-lines p").allTextContents();
    expect(analyst).not.toEqual(fan);
    expect(await panel.locator("[data-fact-id]").evaluateAll(lines => lines.map(line => line.getAttribute("data-fact-id")).sort())).toEqual(fanIds);
    await panel.getByText("Explanation sources and provenance", { exact: true }).click();
    await expect(panel).toContainText(source);
    // Both real artifacts and an intentionally absent artifact must describe their origin honestly.
    if ((await panel.locator(".coaching-heading small").innerText()).startsWith("FOUNDRY")) {
      await expect(panel).toContainText("precomputed, not a live provider-availability check");
      await expect(panel).toContainText("no new model call");
    } else {
      await expect(panel).toContainText("DETERMINISTIC FALLBACK");
      await expect(panel).toContainText("not presented as AI-generated");
    }
  }
  expect(explanationIds[0]).not.toEqual(explanationIds[1]);
  for (const width of [390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.locator(".coaching-explanation").screenshot({ path: testInfo.outputPath(`coaching-${width}.png`) });
  }
});

test("unsupported or mismatched coaching preserves the deterministic trace viewer", async ({ page }) => {
  let corruptIdentity = false;
  await page.route("**/insights/*turnover-wide-001", async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.coaching = corruptIdentity
      ? { ...body.coaching, insight_id: "other-moment" }
      : { schema_version: "future_coaching_v99" };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.getByRole("spinbutton", { name: "Start at second" }).fill("420");
  await page.getByRole("button", { name: "Seek replay" }).click();
  for (const identityCase of [false, true]) {
    corruptIdentity = identityCase;
    await page.getByRole("button", { name: "Inspect evidence at 01:52" }).click();
    await expect(page.locator(".tactical-evidence")).toContainText("Coaching explanation unavailable");
    await expect(page.locator(".tactical-evidence")).toContainText("turnover-wide-001");
    await expect(page.locator(".tactical-evidence .trace-player")).toBeVisible();
    await page.getByRole("button", { name: "Close evidence" }).click();
  }
});
