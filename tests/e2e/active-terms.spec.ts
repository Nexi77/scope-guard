// Risk #3, context/foundation/test-plan.md: pending/rejected changes must not enter active terms.
// Exemplar: tests/e2e/seed.spec.ts. Auth/API/database are real; nothing is mocked.
import { test, expect, type Page } from "@playwright/test";
import { OfferFixture } from "./offer-fixture";
import { waitForInteractivePage } from "./ready";

async function assertAgreedTerms(page: Page) {
  const scope = page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "Current agreed work", exact: true }) });
  await expect(scope).not.toContainText("200,00 zł");
  await expect(scope.getByRole("definition").filter({ hasText: /^100,00 zł$/ })).toHaveCount(1);
  await expect(scope.getByRole("definition").filter({ hasText: /^15 Jan 2099$/ })).toHaveCount(1);
  await expect(scope).not.toContainText("22 Jan 2099");
  await expect(scope.getByRole("row", { name: /Painted wall/ })).toContainText("White finish");
  await expect(
    scope.getByRole("row", { name: /Painted wall/ }).getByRole("cell", { name: "1 piece", exact: true }),
  ).toBeVisible();
}

test("risk #3: pending and rejected changes preserve agreed terms and contractor actions after reload", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required");
  const fixture = new OfferFixture(page.request, baseURL);
  test.info().annotations.push({ type: "test-data", description: fixture.token });
  try {
    // Set up an independent offer through the real contractor API.
    await fixture.create();
    await fixture.decide("base", "accepted");
    await fixture.publish();

    // Pending proposal changes neither the rendered price/deadline nor priced items.
    await page.goto(`/offers/${fixture.offerId}`);
    await page.reload();
    await expect(page.getByRole("link", { name: "Review pending change", exact: true })).toBeVisible();
    await assertAgreedTerms(page);
    await waitForInteractivePage(page);
    await page.getByRole("button", { name: "Offer actions", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Start change proposal", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Edit pending offer", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A real PIN-authorized customer rejection remains in history, outside active terms.
    await fixture.decide("change", "rejected");
    await page.reload();
    await expect(page.getByRole("link", { name: "Review pending change", exact: true })).toHaveCount(0);
    await assertAgreedTerms(page);
    await waitForInteractivePage(page);
    await page.getByRole("button", { name: "Offer actions", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Start change proposal", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Edit pending offer", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "History", exact: true }).click();
    await expect(page.getByText("Keep the original agreement", { exact: false })).toBeVisible();
  } finally {
    // Assert cascading cleanup and residue checks even after a failed browser assertion.
    fixture.cleanup();
  }
});
