// Risks #5/#3, context/foundation/test-plan.md: real journey and approval survive reload.
// Exemplar: tests/e2e/seed.spec.ts; locators verified in live CLI session scopeguard-journey.
import { test, expect, type Page } from "@playwright/test";
import { OfferFixture } from "./offer-fixture";
import { waitForInteractivePage } from "./ready";

// This journey generates a private PIN. Do not retain value-bearing browser artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

async function contractorTerms(page: Page, amount: string, quantity: string, deadline: string) {
  const scope = page.getByRole("region").filter({
    has: page.getByRole("heading", { name: "Current agreed work", exact: true }),
  });
  await expect(scope.getByRole("definition").filter({ hasText: new RegExp(`^${amount}$`) })).toHaveCount(1);
  await expect(scope.getByRole("definition").filter({ hasText: new RegExp(`^${deadline}$`) })).toHaveCount(1);
  await expect(
    scope.getByRole("row", { name: /Painted wall/ }).getByRole("cell", { name: quantity, exact: true }),
  ).toBeVisible();
}

async function customerTerms(page: Page, amount: string, quantity: string, deadline: string) {
  const details = page.getByRole("region", { name: "Offer details", exact: true });
  await expect(details.getByRole("heading", { name: "Current total", exact: true })).toBeVisible();
  await expect(details.getByText(amount, { exact: true })).toHaveCount(2);
  await expect(details.getByText(deadline, { exact: true })).toBeVisible();
  await expect(details.getByText(`${quantity} × 100,00 zł per piece`, { exact: true })).toBeVisible();
}

async function accept(page: Page, pin: string, kind: "offer" | "change") {
  await waitForInteractivePage(page);
  await page.getByRole("button", { name: `Accept ${kind}`, exact: true }).click();
  // Playwright's fill call log can contain its argument: replace sensitive failures.
  try {
    await page.getByRole("textbox", { name: "Six-digit offer PIN required", exact: true }).fill(pin);
  } catch {
    throw new Error("Customer PIN input failed; sensitive details omitted");
  }
  await page.getByRole("button", { name: "Confirm acceptance", exact: true }).click();
  await expect(
    page.getByText(`This ${kind === "offer" ? "offer" : "change proposal"} was accepted.`, { exact: true }),
  ).toBeVisible();
}

test.describe("critical offer journey: accepted change", () => {
  test("risk #5: UI-created offer and accepted change persist for contractor and anonymous customer", async ({
    page,
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const fixture = new OfferFixture(page.request, baseURL);
    const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    test.info().annotations.push({ type: "test-data", description: fixture.token });
    try {
      // Create through dashboard navigation and the hydrated form, with a literal oracle.
      await page.goto("/dashboard");
      await page.getByRole("main").getByRole("link", { name: "Create offer", exact: true }).click();
      await waitForInteractivePage(page);
      await page.getByRole("button", { name: "Add new customer", exact: true }).click();
      await page.getByRole("textbox", { name: "Customer name required", exact: true }).fill(fixture.token);
      await page.getByRole("textbox", { name: "Original scope required", exact: true }).fill("Agreed wall painting");
      await page.getByRole("textbox", { name: "Deadline required", exact: true }).fill("2099-01-15");
      const item = page.getByRole("group", { name: "Work item 1", exact: true });
      await item.getByRole("textbox", { name: "Item name required", exact: true }).fill("Painted wall");
      await item.getByRole("textbox", { name: "Quantity required", exact: true }).fill("1");
      await item.getByRole("combobox", { name: "Unit required", exact: true }).selectOption({ label: "Piece (pc)" });
      await item.getByRole("textbox", { name: "Specification required", exact: true }).fill("White finish");
      await item.getByRole("textbox", { name: "Selling rate (PLN per unit) required", exact: true }).fill("100.00");
      await item
        .getByRole("textbox", { name: "Labor hours per unit (contractor-only) required", exact: true })
        .fill("1");
      await page.getByRole("button", { name: "Create offer", exact: true }).click();
      await expect(page).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
      const offerURL = page.url();
      await waitForInteractivePage(page);

      // Share and authorize the initial offer through UI; hide the one-time result immediately.
      const sharedURL = await page.getByRole("textbox", { name: "Shared offer URL", exact: true }).inputValue();
      let pin = "";
      try {
        await page.getByRole("button", { name: "Generate PIN", exact: true }).click();
        const result = page.getByRole("status").filter({ hasText: "New PIN:" });
        await result.getByRole("button", { name: "Close", exact: true }).waitFor();
        pin = /New PIN:\s*(\d{6})/.exec(await result.innerText())?.[1] ?? "";
      } finally {
        // A reload clears PIN output even if extraction fails, before assertions/diagnostics.
        await page.reload();
      }
      expect(/^\d{6}$/.test(pin), "Generated PIN must be valid; value omitted").toBe(true);
      const customerPage = await customer.newPage();
      await customerPage.goto(sharedURL);
      await accept(customerPage, pin, "offer");
      await customerPage.reload();
      await customerTerms(customerPage, "100,00 zł", "1 piece", "2099-01-15");
      await page.reload();
      await contractorTerms(page, "100,00 zł", "1 piece", "15 Jan 2099");

      // Preview and publish quantity two; the pending proposal cannot alter agreed terms.
      await waitForInteractivePage(page);
      await page.getByRole("button", { name: "Offer actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Start change proposal", exact: true }).click();
      await waitForInteractivePage(page);
      await page.getByRole("textbox", { name: "Quantity", exact: true }).fill("2");
      await page.getByRole("textbox", { name: "What is changing?", exact: true }).fill("Double the painted wall");
      await page.getByRole("textbox", { name: "Confirmed target date", exact: true }).fill("2099-01-22");
      await page.getByRole("button", { name: "Preview estimate", exact: true }).click();
      const preview = page.getByRole("region", { name: "Estimate preview", exact: true });
      await expect(preview.getByText("Total price adjustment: +100,00 zł", { exact: true })).toBeVisible();
      await expect(preview.getByText("Target date: 2099-01-22", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Confirm and record change", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Offer history", exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Current state", exact: true }).click();
      await page.reload();
      await contractorTerms(page, "100,00 zł", "1 piece", "15 Jan 2099");
      await customerPage.reload();
      await customerTerms(customerPage, "100,00 zł", "1 piece", "2099-01-15");
      await expect(
        customerPage.getByText("This proposal is not included in the current total or deadline above.", {
          exact: true,
        }),
      ).toBeVisible();

      // Only actual anonymous approval advances both actors' persisted agreement.
      await accept(customerPage, pin, "change");
      await customerPage.reload();
      await customerTerms(customerPage, "200,00 zł", "2 piece", "2099-01-22");
      await page.reload();
      await expect(page).toHaveURL(offerURL);
      await contractorTerms(page, "200,00 zł", "2 piece", "22 Jan 2099");

      // Original terms and before/after effects remain inspectable in recorded history.
      await page.getByRole("link", { name: "History", exact: true }).click();
      await expect(page.getByText("Customer accepted version 1", { exact: true })).toBeVisible();
      await expect(page.getByText("Customer accepted change proposal 1", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "View version details", exact: true }).click();
      const original = page.getByRole("group").filter({ hasText: "Version 1 recorded" });
      await expect(original.getByRole("definition").filter({ hasText: /^100,00 zł$/ })).toHaveCount(1);
      await expect(original.getByRole("definition").filter({ hasText: /^15 Jan 2099$/ })).toHaveCount(1);
      await expect(original).toContainText("Painted wall · 1 piece · White finish");
      await page.getByRole("link", { name: "History", exact: true }).click();
      await page.getByRole("link", { name: "View proposal details", exact: true }).click();
      const proposal = page.getByRole("group").filter({ hasText: "Change proposal 1 proposed" });
      await expect(proposal).toContainText("Current record status: accepted");
      await expect(proposal).toContainText("Before: Painted wall · 1 piece · rate 100,00 zł");
      await expect(proposal).toContainText("After: Painted wall · 2 piece · rate 100,00 zł");
    } finally {
      try {
        await customer.close();
      } finally {
        fixture.cleanup();
      }
    }
  });
});
