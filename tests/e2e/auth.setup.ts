import process from "node:process";
import { test as setup, expect } from "@playwright/test";
import { waitForInteractivePage } from "./ready";
import { enterPrivateInput } from "./private-input";

// Credentials must not enter retained diagnostic artifacts or value-bearing steps.
setup.use({ trace: "off", screenshot: "off", video: "off" });

setup("sign in once through the real UI and save the contractor session", async ({ page }) => {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error("Set E2E_USERNAME and E2E_PASSWORD in ignored .env; see context/foundation/test-stack.md.");
  }

  await page.goto("/auth/signin");
  await waitForInteractivePage(page);
  await enterPrivateInput(page.getByRole("textbox", { name: "Email", exact: true }), username);
  await enterPrivateInput(page.getByRole("textbox", { name: "Password", exact: true }), password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome to ScopeGuard", exact: true })).toBeVisible();
  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
