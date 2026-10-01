// Risks #5/#4, context/foundation/test-plan.md: rejection stays historical and copies are independent.
// Exemplar: tests/e2e/seed.spec.ts; controls verified live in CLI session scopeguard-copy.
import { test, expect } from "@playwright/test";
import { OfferFixture } from "./offer-fixture";
import { waitForInteractivePage } from "./ready";
import { enterPrivateInput } from "./private-input";

// The one-time PIN must never enter retained browser artifacts.
test.use({ trace: "off", screenshot: "off", video: "off" });

interface OfferState {
  id: string;
  customer_id: string;
  status: string;
  base_amount_minor: number;
  base_scope: string;
  base_deadline: string;
}
interface ItemState {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  specification: string;
  selling_rate_minor: number | string;
  labor_hours_per_unit: number | string;
}
interface RevisionState {
  id: string;
  status: string;
  decision_outcome: string | null;
  rejection_comment: string | null;
  decided_at: string | null;
}

test.describe("critical offer journey: rejected copy", () => {
  test("risk #5: rejected offer produces a fresh pending copy without changing the original", async ({
    page,
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("Playwright baseURL is required");
    const fixture = new OfferFixture(page.request, baseURL);
    const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    test.info().annotations.push({ type: "test-data", description: fixture.token });
    const reason = "Please prepare a separate revised proposal";
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
      // The anonymous customer rejects through the real decision form and reloads.
      await waitForInteractivePage(customerPage);
      await customerPage.getByRole("button", { name: "Reject offer", exact: true }).click();
      await customerPage
        .getByRole("textbox", { name: "Why are you rejecting this proposal? required", exact: true })
        .fill(reason);
      await enterPrivateInput(
        customerPage.getByRole("textbox", { name: "Six-digit offer PIN required", exact: true }),
        pin,
      );
      await customerPage.getByRole("button", { name: "Confirm rejection", exact: true }).click();
      await expect(customerPage.getByText("This offer was rejected.", { exact: true })).toBeVisible();
      await customerPage.reload();
      await expect(customerPage.getByRole("heading", { name: "Offer rejected", exact: true })).toBeVisible();
      await expect(customerPage.getByRole("button", { name: "Accept offer", exact: true })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("region", { name: "Customer rejected this offer", exact: true })).toContainText(
        `Reason: ${reason}`,
      );

      // Owner-scoped reads corroborate identity/state, without performing journey actions.
      await fixture.authenticate();
      const originalId = new URL(offerURL).pathname.split("/").pop();
      const originalQuery = `offer_id=eq.${originalId}`;
      const originalOffers = await fixture.rows<OfferState>(
        "offers",
        `select=id,customer_id,status,base_amount_minor,base_scope,base_deadline&id=eq.${originalId}`,
      );
      expect(originalOffers).toHaveLength(1);
      expect(originalOffers[0]).toMatchObject({ status: "rejected", base_amount_minor: 10000 });
      const revisionFields = "select=id,status,decision_outcome,rejection_comment,decided_at";
      const originalRevisions = await fixture.rows<RevisionState>(
        "offer_revisions",
        `${revisionFields}&${originalQuery}`,
      );
      expect(originalRevisions).toHaveLength(1);
      expect(originalRevisions[0]).toMatchObject({
        status: "rejected",
        decision_outcome: "rejected",
        rejection_comment: reason,
      });
      expect(originalRevisions[0].decided_at).not.toBeNull();
      const originalItems = await fixture.rows<ItemState>(
        "offer_items",
        `select=id,name,quantity,unit,specification,selling_rate_minor,labor_hours_per_unit&${originalQuery}`,
      );
      expect(originalItems).toHaveLength(1);

      // Assert every hydrated prefill before changing only the price of the new proposal.
      await page.getByRole("link", { name: "Create new offer from this one", exact: true }).click();
      await expect(page).toHaveURL(`${baseURL}/offers/new?source=${originalId}`);
      await waitForInteractivePage(page);
      await expect(page.getByRole("combobox", { name: "Existing customer required", exact: true })).toHaveText(
        fixture.token,
      );
      await expect(page.getByRole("textbox", { name: "Original scope required", exact: true })).toHaveValue(
        "Agreed wall painting",
      );
      await expect(page.getByRole("textbox", { name: "Deadline required", exact: true })).toHaveValue("2099-01-15");
      const copiedItem = page.getByRole("group", { name: "Work item 1", exact: true });
      for (const [name, value] of [
        ["Item name required", "Painted wall"],
        ["Quantity required", "1"],
        ["Specification required", "White finish"],
        ["Selling rate (PLN per unit) required", "100.00"],
        ["Labor hours per unit (contractor-only) required", "1"],
      ])
        await expect(copiedItem.getByRole("textbox", { name, exact: true })).toHaveValue(value);
      await expect(copiedItem.getByRole("combobox", { name: "Unit required", exact: true })).toHaveValue("piece");
      await copiedItem
        .getByRole("textbox", { name: "Selling rate (PLN per unit) required", exact: true })
        .fill("150.00");
      await page.getByRole("button", { name: "Create offer", exact: true }).click();
      await expect(page).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
      const copiedURL = page.url();
      expect(copiedURL).not.toBe(offerURL);
      await page.reload();
      await waitForInteractivePage(page);
      const copiedScope = page.getByRole("region", { name: "Offer awaiting acceptance", exact: true });
      await expect(copiedScope.getByRole("definition").filter({ hasText: /^150,00 zł$/ })).toHaveCount(1);
      await expect(copiedScope.getByRole("definition").filter({ hasText: /^15 Jan 2099$/ })).toHaveCount(1);
      await expect(copiedScope.getByRole("row", { name: /Painted wall/ })).toContainText("1 piece");
      await expect(page.getByText("Customer PIN: Not configured", { exact: true })).toBeVisible();
      const copiedSharedURL = await page.getByRole("textbox", { name: "Shared offer URL", exact: true }).inputValue();
      expect(copiedSharedURL).not.toBe(sharedURL);
      const copiedId = new URL(copiedURL).pathname.split("/").pop();
      const copiedQuery = `offer_id=eq.${copiedId}`;
      const copiedOffers = await fixture.rows<OfferState>(
        "offers",
        `select=id,customer_id,status,base_amount_minor,base_scope,base_deadline&id=eq.${copiedId}`,
      );
      expect(copiedOffers).toHaveLength(1);
      expect(copiedOffers[0]).toMatchObject({
        customer_id: originalOffers[0].customer_id,
        status: "pending",
        base_amount_minor: 15000,
      });
      expect(copiedOffers[0].id).not.toBe(originalOffers[0].id);
      const copiedItems = await fixture.rows<ItemState>(
        "offer_items",
        `select=id,name,quantity,unit,specification,selling_rate_minor,labor_hours_per_unit&${copiedQuery}`,
      );
      expect(copiedItems).toHaveLength(1);
      expect(copiedItems[0].id).not.toBe(originalItems[0].id);
      const copiedRevisions = await fixture.rows<RevisionState>("offer_revisions", `${revisionFields}&${copiedQuery}`);
      expect(copiedRevisions).toHaveLength(1);
      expect(copiedRevisions[0].id).not.toBe(originalRevisions[0].id);
      expect(copiedRevisions[0]).toMatchObject({
        status: "pending",
        decision_outcome: null,
        rejection_comment: null,
        decided_at: null,
      });

      // The independent link presents the new pending proposal to an anonymous visitor.
      await customerPage.goto(copiedSharedURL);
      await waitForInteractivePage(customerPage);
      const copiedDetails = customerPage.getByRole("region", { name: "Offer details", exact: true });
      await expect(copiedDetails.getByRole("heading", { name: "Proposed total", exact: true })).toBeVisible();
      await expect(copiedDetails.getByText("150,00 zł", { exact: true })).toHaveCount(2);
      await expect(customerPage.getByRole("button", { name: "Accept offer", exact: true })).toBeVisible();
      await expect(customerPage.getByRole("button", { name: "Reject offer", exact: true })).toBeVisible();
      await expect(customerPage.getByText(reason, { exact: true })).toHaveCount(0);

      // Original terms, decision, and history stay unchanged after the copy is saved.
      await page.goto(offerURL);
      await page.reload();
      const originalScope = page.getByRole("region", { name: "Rejected offer", exact: true });
      await expect(originalScope.getByRole("definition").filter({ hasText: /^100,00 zł$/ })).toHaveCount(1);
      await expect(originalScope.getByRole("definition").filter({ hasText: /^15 Jan 2099$/ })).toHaveCount(1);
      await expect(page.getByRole("region", { name: "Customer rejected this offer", exact: true })).toContainText(
        `Reason: ${reason}`,
      );
      await page.getByRole("link", { name: "History", exact: true }).click();
      await page.reload();
      await expect(page.getByText("Customer rejected version 1", { exact: true })).toBeVisible();
      await expect(page.getByText(`Reason: ${reason}`, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "View version details", exact: true }).click();
      const originalHistory = page.getByRole("group").filter({ hasText: "Version 1 recorded" });
      await expect(originalHistory.getByRole("definition").filter({ hasText: /^100,00 zł$/ })).toHaveCount(1);
      expect(
        await fixture.rows<OfferState>(
          "offers",
          `select=id,customer_id,status,base_amount_minor,base_scope,base_deadline&id=eq.${originalId}`,
        ),
      ).toEqual(originalOffers);
      expect(await fixture.rows<RevisionState>("offer_revisions", `${revisionFields}&${originalQuery}`)).toEqual(
        originalRevisions,
      );
      expect(
        await fixture.rows<ItemState>(
          "offer_items",
          `select=id,name,quantity,unit,specification,selling_rate_minor,labor_hours_per_unit&${originalQuery}`,
        ),
      ).toEqual(originalItems);
      await customerPage.goto(sharedURL);
      await customerPage.reload();
      await expect(customerPage.getByRole("heading", { name: "Offer rejected", exact: true })).toBeVisible();
      await expect(customerPage.getByRole("button", { name: "Accept offer", exact: true })).toHaveCount(0);
    } finally {
      try {
        await customer.close();
      } finally {
        fixture.cleanup();
      }
    }
  });
});
