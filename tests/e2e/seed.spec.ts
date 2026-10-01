// Risk #5: the offer journey breaks across navigation, session, and browser boundaries.
// This seed protects its first leg; create/share/decision branches need further E2E coverage.
import { test, expect } from "@playwright/test";
import { waitForInteractivePage } from "./ready";

test("risk #5: contractor reaches an interactive offer form and retains the session after reload", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Welcome to ScopeGuard", exact: true })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Create offer", exact: true }).click();
  await expect(page).toHaveURL(/\/offers\/new$/);
  await expect(page.getByRole("heading", { name: "Create an offer", exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/offers\/new$/);
  await expect(page.getByRole("heading", { name: "Create an offer", exact: true })).toBeVisible();
  await waitForInteractivePage(page);
  await page.getByRole("button", { name: "Add new customer", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Customer name required", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create offer", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review these fields before creating the offer", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Customer name required", exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page).toHaveURL(/\/offers\/new$/);
  // Invalid submission writes no records; there is no data to clean up or shared session to revoke.
});
