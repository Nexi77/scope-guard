import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateOfferChange,
  formatPersonHours,
  formatSignedMinorAmount,
  serializeMinorUnits,
  type OfferChangeEstimateInput,
  type OfferChangeItemEffect,
} from "../src/lib/offer-change-estimator.ts";
import {
  STARTER_OFFER_CHANGE_TEMPLATES,
  snapshotOfferChangeTemplate,
  templateIsReady,
} from "../src/lib/offer-change-templates.ts";
import type { OfferItemPayload } from "../src/lib/offer-items.ts";

type TestItem = OfferItemPayload & { id: string };
type EstimateOverrides = Omit<Partial<OfferChangeEstimateInput>, "effects"> & {
  effect?: Partial<OfferChangeItemEffect>;
};

function item(overrides: Partial<TestItem> = {}): TestItem {
  return {
    id: "item-1",
    name: "Paint wall",
    quantity: 1,
    unit: "m²",
    specification: "Two coats",
    selling_rate_minor: 10000,
    labor_hours_per_unit: 0.25,
    ...overrides,
  };
}

function estimate(before: TestItem | null, after: TestItem | null, more: EstimateOverrides = {}) {
  const candidate = after ?? before;
  assert.ok(candidate);
  const { effect: effectOverride, ...overrides } = more;
  return estimateOfferChange({
    scopeRevision: 3,
    effects: [{ itemId: candidate.id, before, after, ...effectOverride }],
    ...overrides,
  });
}

void test("subtracts rounded before and after lines, including a half-grosz case", () => {
  const before = item({ quantity: 0.5, selling_rate_minor: 1, labor_hours_per_unit: 0 });
  const after = item({ quantity: 1, selling_rate_minor: 1, labor_hours_per_unit: 0 });
  const result = estimate(before, after);
  assert.equal(result.itemEffectsDeltaMinor, "0");
  assert.equal(result.priceDeltaMinor, "0");
});

void test("supports signed reductions and successive changes from the latest baseline", () => {
  const first = estimate(item({ quantity: 2 }), item({ quantity: 1 }));
  const second = estimate(item({ quantity: 3 }), item({ quantity: 4 }));
  assert.equal(first.priceDeltaMinor, "-10000");
  assert.equal(second.priceDeltaMinor, "10000");
});

void test("keeps exact effort precision until display and accepts explicit zero hours", () => {
  const result = estimate(
    item({ quantity: 0.333, labor_hours_per_unit: 1.333 }),
    item({ quantity: 0.333, labor_hours_per_unit: 0 }),
  );
  assert.equal(result.effortDeltaMicroHours, "-443889");
  assert.equal(formatPersonHours(BigInt(result.effortDeltaMicroHours)), "−0,44 h");
  assert.equal(estimate(item({ labor_hours_per_unit: 0 }), item({ labor_hours_per_unit: 0 })).status, "ready");
});

void test("serializes signed grosz exactly and formats reductions", () => {
  assert.equal(serializeMinorUnits(-9007199254740991n), "-9007199254740991");
  assert.equal(formatSignedMinorAmount(-123456n), "−1234,56 zł");
});

void test("rejects calculations beyond the supported amount bound", () => {
  assert.throws(() =>
    estimate(
      null,
      item({ quantity: 999999999.999, selling_rate_minor: Number.MAX_SAFE_INTEGER, labor_hours_per_unit: 0 }),
    ),
  );
  assert.throws(() => serializeMinorUnits(10000000000000000n));
});

void test("records a confirmed partial-work credit and reconciles retained completed value", () => {
  const before = item({ quantity: 10, selling_rate_minor: 100, labor_hours_per_unit: 0 });
  const after = item({ quantity: 7, selling_rate_minor: 100, labor_hours_per_unit: 0 });
  const result = estimate(before, after, {
    effect: { completedQuantity: "4", confirmedOmissionCreditMinor: "200" },
  });
  assert.equal(result.omissionCreditSuggestionMinor, "300");
  assert.equal(result.confirmedOmissionCreditMinor, "200");
  assert.equal(result.creditReconciliationMinor, "100");
  assert.equal(result.priceDeltaMinor, "-200");
  assert.equal(result.proposalAdjustmentMinor, "100");
  assert.equal(result.snapshot.commercial_adjustment_minor, "100");

  const completedWorkBeyondRemainingScope = estimate(
    before,
    item({ quantity: 3, selling_rate_minor: 100, labor_hours_per_unit: 0 }),
    {
      effect: { completedQuantity: "4", confirmedOmissionCreditMinor: "600" },
    },
  );
  assert.equal(completedWorkBeyondRemainingScope.omissionCreditSuggestionMinor, "600");
  assert.equal(completedWorkBeyondRemainingScope.priceDeltaMinor, "-600");
});

void test("keeps commercial overrides separate and requires their reason", () => {
  const before = item({ quantity: 1, labor_hours_per_unit: 0 });
  const after = item({ quantity: 2, labor_hours_per_unit: 0 });
  const incomplete = estimate(before, after, { commercialAdjustmentMinor: "500" });
  assert.equal(incomplete.status, "needs_assessment");
  const confirmed = estimate(before, after, {
    commercialAdjustmentMinor: "500",
    commercialAdjustmentReason: "Retained setup charge",
  });
  assert.equal(confirmed.itemEffectsDeltaMinor, "10000");
  assert.equal(confirmed.commercialAdjustmentMinor, "500");
  assert.equal(confirmed.priceDeltaMinor, "10500");
  assert.equal(confirmed.snapshot.commercial_adjustment_minor, "500");
  assert.equal(confirmed.snapshot.contractor_commercial_adjustment_minor, "500");
});

void test("unknown credits, units, and consequence inputs stay in needs assessment", () => {
  const baseline = item({ quantity: 2, labor_hours_per_unit: 0 });
  const replacement = item({ id: "item-2", quantity: 2, unit: "hour", labor_hours_per_unit: 0 });
  const result = estimateOfferChange({
    scopeRevision: 3,
    effects: [
      {
        itemId: baseline.id,
        before: baseline,
        after: item({ quantity: 1, labor_hours_per_unit: 0 }),
        completedQuantity: "0",
      },
      {
        itemId: replacement.id,
        before: replacement,
        after: item({ id: "item-2", quantity: 2, unit: "m", labor_hours_per_unit: 0 }),
      },
    ],
    consequences: [
      {
        identity: "restore:room-a",
        name: "Restore room",
        quantity: "2",
        unit: "m²",
        sellingRateMinor: "",
        laborHoursPerUnit: "",
        specification: "",
      },
    ],
  });
  assert.equal(result.status, "needs_assessment");
  assert.ok(result.missingInputs.some((input) => input.includes("replacement confirmation")));
  assert.ok(result.missingInputs.some((input) => input.includes("omission credit")));
  assert.ok(result.missingInputs.some((input) => input.includes("confirmed selling rate")));
});

void test("suppresses duplicate consequence operations by shared identity", () => {
  const operation = {
    identity: "restore:room-a",
    name: "Restore room",
    quantity: "1",
    unit: "m²",
    sellingRateMinor: "2500",
    laborHoursPerUnit: "0.5",
    specification: "",
  };
  const result = estimate(null, item({ id: "new-item", labor_hours_per_unit: 0 }), {
    consequences: [operation, operation],
  });
  assert.equal(result.consequenceDeltaMinor, "2500");
  assert.equal(result.effortDeltaMicroHours, "500000");
  assert.equal((result.snapshot.consequences as unknown[]).length, 1);
  assert.equal(result.proposalAdjustmentMinor, "2500");
  assert.equal(result.snapshot.commercial_adjustment_minor, "2500");
});

void test("starter trade templates have prompts but no invented rates and snapshots survive edits", () => {
  assert.deepEqual(
    STARTER_OFFER_CHANGE_TEMPLATES.map(({ trade }) => trade),
    ["painting", "tiling", "electrical", "plumbing"],
  );
  const mutable = structuredClone(STARTER_OFFER_CHANGE_TEMPLATES[0]);
  assert.equal(templateIsReady(mutable), false);
  assert.ok(mutable.prompts.length > 0);
  const savedSnapshot = snapshotOfferChangeTemplate(mutable);
  const estimateSnapshot = estimateOfferChange({ scopeRevision: 1, effects: [], templateSnapshots: [savedSnapshot] });
  mutable.name = "Renamed later";
  mutable.prompts.push("New condition");
  assert.equal((estimateSnapshot.snapshot.template_snapshots as { name: string }[])[0].name, "Painted area");
  assert.equal((estimateSnapshot.snapshot.template_snapshots as { prompts: string[] }[])[0].prompts.length, 3);
});
