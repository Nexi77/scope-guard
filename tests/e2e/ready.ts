import type { Page } from "@playwright/test";

export async function waitForInteractivePage(page: Page) {
  // Astro removes ssr after island hydration; wait once before entering form data.
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}
