// Risk #4: real decision input/storage must reach the owner's DOM as inert, exact text.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { OfferFixture } from "./offer-fixture";

const reason = `Zażółć gęślą jaźń — "cytat" & 'apostrof'\n<script data-reason-payload="script">window.__reasonExecutions += 1</script><img data-reason-payload="image" src="/missing-reason-image" onerror="window.__reasonExecutions += 1"><span data-reason-payload="span" onclick="window.__reasonExecutions += 1">Nie zgadzam się</span>`;
const submittedReason = ` \n${reason}\n `;

async function installExecutionSentinel(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { __reasonExecutions: 0 });
  });
}

async function assertInertReason(page: Page, paragraph: Locator) {
  await expect(paragraph).toBeVisible();
  // textContent preserves newlines and punctuation; text matchers normalize whitespace.
  expect(await paragraph.textContent()).toBe(`Reason: ${reason}`);
  await expect(page.locator("[data-reason-payload]")).toHaveCount(0);
  await expect(paragraph.locator("script, img, span, [onerror], [onclick]")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__reasonExecutions") === 0)).toBe(true);
}

test("risk #4: hostile base rejection is stored exactly and inert on detail/history after reload", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const fixture = new OfferFixture(page.request, baseURL);
  test.info().annotations.push({ type: "test-data", description: fixture.token });
  try {
    await fixture.create();
    await fixture.decide("base", "rejected", submittedReason);
    const revisions = await fixture.rows<{ rejection_comment: string; decision_outcome: string }>(
      "offer_revisions",
      `select=rejection_comment,decision_outcome&id=eq.${fixture.revisionId}`,
    );
    expect(revisions).toEqual([{ rejection_comment: reason, decision_outcome: "rejected" }]);
    await installExecutionSentinel(page);
    await page.goto(`/offers/${fixture.offerId}`);
    await page.reload();
    await assertInertReason(page, page.locator('section[aria-labelledby="rejected-offer-title"] p').first());
    await page.goto(`/offers/${fixture.offerId}/history`);
    await page.reload();
    await assertInertReason(page, page.locator(`#revision-decision-${fixture.revisionId} p.whitespace-pre-wrap`));
  } finally {
    fixture.cleanup();
  }
});

test("risk #4: hostile change rejection is stored exactly and inert in history after reload", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const fixture = new OfferFixture(page.request, baseURL);
  test.info().annotations.push({ type: "test-data", description: fixture.token });
  try {
    await fixture.create();
    await fixture.decide("base", "accepted");
    await fixture.publish();
    await fixture.decide("change", "rejected", submittedReason);
    const decisions = await fixture.rows<{ rejection_comment: string; outcome: string }>(
      "change_decisions",
      `select=rejection_comment,outcome&offer_change_id=eq.${fixture.changeId}`,
    );
    expect(decisions).toEqual([{ rejection_comment: reason, outcome: "rejected" }]);
    await installExecutionSentinel(page);
    await page.goto(`/offers/${fixture.offerId}/history`);
    await page.reload();
    await assertInertReason(page, page.locator(`#change-decision-${fixture.changeId} p.whitespace-pre-wrap`));
  } finally {
    fixture.cleanup();
  }
});
