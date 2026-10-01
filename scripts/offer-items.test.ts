import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOfferItemLine,
  calculateOfferItemsTotal,
  parseOfferItemDrafts,
  type OfferItemDraft,
} from "../src/lib/offer-items.ts";

function item(overrides: Partial<OfferItemDraft> = {}): OfferItemDraft {
  return {
    name: "Paint wall",
    quantity: "1",
    unit: "m²",
    specification: "Two coats",
    sellingRate: "1.00",
    laborHours: "0",
    ...overrides,
  };
}

void test("rounds line amounts half up at thousandth-quantity boundaries", () => {
  assert.equal(calculateOfferItemLine(item({ quantity: "0.004" })), 0n);
  assert.equal(calculateOfferItemLine(item({ quantity: "0.005" })), 1n);
  assert.equal(calculateOfferItemLine(item({ quantity: "0.006" })), 1n);
});

void test("rounds a fractional quantity at a non-whole PLN selling rate", () => {
  assert.equal(calculateOfferItemLine(item({ quantity: "0.333", sellingRate: "1.01" })), 34n);
});

void test("sums individually rounded lines instead of rounding their combined raw amount", () => {
  assert.equal(calculateOfferItemsTotal([item({ quantity: "0.005" }), item({ quantity: "0.005" })]), 2n);
});

void test("rejects quantities with more than three decimal places", () => {
  const draft = item({ quantity: "0.0005" });
  const parsed = parseOfferItemDrafts([draft]);
  assert.ok("error" in parsed);
  assert.equal(parsed.error.field, "quantity");
  assert.equal(calculateOfferItemLine(draft), null);
  assert.equal(calculateOfferItemsTotal([draft]), null);
});
