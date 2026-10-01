import type { Locator } from "@playwright/test";

// Playwright fill titles include the value in HTML reports, even with tracing off.
// Native input events keep the real form flow while evaluate's title omits arguments.
// Callers must disable trace/screenshot/video, which can otherwise retain values.
export async function enterPrivateInput(input: Locator, value: string) {
  try {
    await input.evaluate((element, privateValue) => {
      if (!(element instanceof HTMLInputElement)) throw new Error("Expected a private input");
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (!descriptor?.set) throw new Error("Native input setter unavailable");
      descriptor.set.call(element, privateValue);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  } catch {
    throw new Error("Private input failed; sensitive details omitted");
  }
}
