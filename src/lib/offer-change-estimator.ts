import { OFFER_ITEM_UNITS, calculateOfferItemLine, type OfferItemPayload } from "./offer-items.ts";

export interface OfferChangeOperation {
  identity: string;
  name: string;
  quantity: string;
  unit: string;
  sellingRateMinor: string;
  laborHoursPerUnit: string;
  specification: string;
}

export interface OfferChangeItemEffect {
  itemId: string;
  before: OfferItemPayload | null;
  after: OfferItemPayload | null;
  replacementConfirmed?: boolean;
  completedQuantity?: string;
  confirmedOmissionCreditMinor?: string | null;
}

export interface OfferChangeEstimateInput {
  scopeRevision: number;
  effects: OfferChangeItemEffect[];
  consequences?: OfferChangeOperation[];
  templateSnapshots?: readonly unknown[];
  siteFacts?: string | null;
  commercialAdjustmentMinor?: string | null;
  commercialAdjustmentReason?: string | null;
}

export interface OfferChangeEstimate {
  status: "ready" | "needs_assessment";
  reasons: string[];
  missingInputs: string[];
  itemEffectsDeltaMinor: string;
  omissionCreditSuggestionMinor: string | null;
  confirmedOmissionCreditMinor: string | null;
  creditReconciliationMinor: string;
  consequenceDeltaMinor: string;
  commercialAdjustmentMinor: string;
  commercialAdjustmentReason: string | null;
  proposalAdjustmentMinor: string;
  priceDeltaMinor: string;
  effortDeltaMicroHours: string;
  snapshot: Record<string, unknown>;
}

export const MAX_AMOUNT_MINOR = 9_999_999_999_999_999n;
const UNIT_VALUES = new Set<string>(OFFER_ITEM_UNITS.map(({ value }) => value));

function decimalScaled(value: number | string, scale: bigint, places: number): bigint | null {
  const text = String(value).trim();
  const pattern = new RegExp(`^(?:0|[1-9]\\d*)(?:[.,]\\d{1,${places}})?$`);
  if (!pattern.test(text)) return null;
  const [whole, fraction = ""] = text.replace(",", ".").split(".");
  return BigInt(whole) * scale + BigInt(fraction.padEnd(places, "0"));
}

function itemLine(item: OfferItemPayload | null): bigint {
  if (!item) return 0n;
  const amount = calculateOfferItemLine({
    name: item.name,
    quantity: String(item.quantity),
    unit: item.unit,
    specification: item.specification,
    sellingRate: `${Math.floor(item.selling_rate_minor / 100)}.${String(item.selling_rate_minor % 100).padStart(2, "0")}`,
    laborHours: String(item.labor_hours_per_unit),
  });
  if (amount === null) throw new Error("Offer item values are invalid");
  return amount;
}

function itemEffortMicroHours(item: OfferItemPayload | null): bigint | null {
  if (!item) return 0n;
  const quantity = decimalScaled(item.quantity, 1000n, 3);
  const hours = decimalScaled(item.labor_hours_per_unit, 1000n, 3);
  if (quantity === null || hours === null) return null;
  return quantity * hours;
}

function safeMinor(value: string | null | undefined, label: string): bigint | null {
  if (value == null || !/^-?(?:0|[1-9]\d*)$/.test(value)) return null;
  const amount = BigInt(value);
  if (amount < -MAX_AMOUNT_MINOR || amount > MAX_AMOUNT_MINOR) {
    throw new Error(`${label} is outside supported amount bounds`);
  }
  return amount;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) return -roundHalfUp(-numerator, denominator);
  return (numerator + denominator / 2n) / denominator;
}

function validateItem(item: OfferItemPayload | null, itemId: string): void {
  if (!item) return;
  if (item.id !== itemId || !UNIT_VALUES.has(item.unit)) throw new Error("Item identity or unit is invalid");
  const quantity = decimalScaled(item.quantity, 1000n, 3);
  const hours = decimalScaled(item.labor_hours_per_unit, 1000n, 3);
  if (
    quantity === null ||
    quantity <= 0n ||
    quantity >= 1_000_000_000_000n ||
    hours === null ||
    hours >= 1_000_000_000_000n
  ) {
    throw new Error("Item quantity or effort is invalid");
  }
  if (!Number.isSafeInteger(item.selling_rate_minor) || item.selling_rate_minor < 0)
    throw new Error("Item rate is invalid");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function estimateOfferChange(input: OfferChangeEstimateInput): OfferChangeEstimate {
  if (!Number.isSafeInteger(input.scopeRevision) || input.scopeRevision < 1)
    throw new Error("Scope revision is invalid");
  if (input.effects.length > 100 || (input.consequences?.length ?? 0) > 100)
    throw new Error("Estimate exceeds supported item bounds");
  const reasons: string[] = [];
  const missingInputs: string[] = [];
  const needsTemplateFacts = (input.templateSnapshots ?? []).some(
    (snapshot) =>
      snapshot !== null &&
      typeof snapshot === "object" &&
      Array.isArray((snapshot as { prompts?: unknown }).prompts) &&
      (snapshot as { prompts: unknown[] }).prompts.length > 0,
  );
  if (needsTemplateFacts && !input.siteFacts?.trim()) {
    missingInputs.push("Template prompts: confirmed site conditions");
    reasons.push("The selected work template needs contractor-confirmed site facts.");
  }
  const itemIds = new Set<string>();
  let itemEffectsDelta = 0n;
  let effortDelta = 0n;
  let omissionSuggestion = 0n;
  let omissionSuggestionComplete = true;
  let confirmedOmissionCredit: bigint | null = null;
  let creditReconciliation = 0n;

  for (const effect of input.effects) {
    if (!effect.itemId || itemIds.has(effect.itemId)) throw new Error("Each affected item must have a unique identity");
    itemIds.add(effect.itemId);
    validateItem(effect.before, effect.itemId);
    validateItem(effect.after, effect.itemId);
    if (!effect.before && !effect.after) throw new Error("An item effect must have a before or after value");
    if (effect.before && effect.after && effect.before.unit !== effect.after.unit) {
      reasons.push(
        `${effect.after.name}: unit changed from ${effect.before.unit} to ${effect.after.unit}; treat it as a replacement and confirm the comparison.`,
      );
      if (!effect.replacementConfirmed)
        missingInputs.push(`${effect.after.name}: replacement confirmation for the unit change`);
    }
    itemEffectsDelta += itemLine(effect.after) - itemLine(effect.before);
    const beforeEffort = itemEffortMicroHours(effect.before);
    const afterEffort = itemEffortMicroHours(effect.after);
    if (beforeEffort === null || afterEffort === null) {
      missingInputs.push(
        `${effect.after?.name ?? effect.before?.name ?? effect.itemId}: valid quantity and labor hours`,
      );
    } else {
      effortDelta += afterEffort - beforeEffort;
    }

    if (
      effect.before &&
      (!effect.after || (effect.after.quantity < effect.before.quantity && effect.after.unit === effect.before.unit))
    ) {
      const beforeQty = decimalScaled(effect.before.quantity, 1000n, 3);
      const afterQty = effect.after ? decimalScaled(effect.after.quantity, 1000n, 3) : 0n;
      if (beforeQty === null || afterQty === null) throw new Error(`${effect.before.name}: quantity is invalid`);
      const completed = effect.completedQuantity == null ? null : decimalScaled(effect.completedQuantity, 1000n, 3);
      if (completed === null) {
        missingInputs.push(`${effect.before.name}: completed quantity confirmation`);
      } else if (completed > beforeQty || completed < 0n) {
        throw new Error(`${effect.before.name}: completed quantity must be between zero and the original quantity`);
      }
      const omittedQty = beforeQty - afterQty;
      const unitRate = BigInt(effect.before.selling_rate_minor);
      if (effect.completedQuantity != null && completed === null) {
        throw new Error(`${effect.before.name}: completed quantity is invalid`);
      }
      const uncompletedQty = completed === null ? null : beforeQty - completed;
      const creditableQty = uncompletedQty === null ? null : omittedQty < uncompletedQty ? omittedQty : uncompletedQty;
      const omittedLineAmount = itemLine(effect.before) - roundHalfUp(afterQty * unitRate, 1000n);
      const calculatedCredit = creditableQty === null ? null : roundHalfUp(creditableQty * unitRate, 1000n);
      const maxCredit =
        calculatedCredit === null ? null : calculatedCredit < omittedLineAmount ? calculatedCredit : omittedLineAmount;
      if (maxCredit === null) omissionSuggestionComplete = false;
      else omissionSuggestion += maxCredit;
      const confirmed = safeMinor(effect.confirmedOmissionCreditMinor, `${effect.before.name} omission credit`);
      if (confirmed === null) {
        missingInputs.push(`${effect.before.name}: contractor-confirmed omission credit`);
      } else if (confirmed < 0n || (maxCredit !== null && confirmed > maxCredit)) {
        throw new Error(`${effect.before.name}: omission credit must be between zero and the calculated maximum`);
      } else if (maxCredit !== null) {
        confirmedOmissionCredit = (confirmedOmissionCredit ?? 0n) + confirmed;
        creditReconciliation += omittedLineAmount - confirmed;
      } else {
        omissionSuggestionComplete = false;
      }
    }
  }

  const consequenceIds = new Set<string>();
  let consequenceDelta = 0n;
  let consequenceEffort = 0n;
  for (const operation of input.consequences ?? []) {
    if (!operation.identity.trim()) throw new Error("Consequence operation identity is required");
    if (consequenceIds.has(operation.identity)) continue;
    consequenceIds.add(operation.identity);
    if (!UNIT_VALUES.has(operation.unit)) {
      missingInputs.push(`${operation.name || operation.identity}: supported unit`);
      continue;
    }
    const quantity = decimalScaled(operation.quantity, 1000n, 3);
    const hours = decimalScaled(operation.laborHoursPerUnit, 1000n, 3);
    const rate = safeMinor(operation.sellingRateMinor, `${operation.name} rate`);
    if (quantity === null || quantity <= 0n) missingInputs.push(`${operation.name}: measured quantity`);
    if (hours === null) missingInputs.push(`${operation.name}: confirmed person-hours per unit`);
    if (rate === null) missingInputs.push(`${operation.name}: confirmed selling rate`);
    if (quantity !== null && quantity > 0n && rate !== null) consequenceDelta += roundHalfUp(quantity * rate, 1000n);
    if (quantity !== null && quantity > 0n && hours !== null) consequenceEffort += quantity * hours;
  }

  let commercialAdjustment = safeMinor(input.commercialAdjustmentMinor, "Commercial adjustment");
  const adjustmentReason = input.commercialAdjustmentReason?.trim() ?? null;
  if (commercialAdjustment === null) {
    if (input.commercialAdjustmentMinor == null) commercialAdjustment = 0n;
    else missingInputs.push("Commercial adjustment: valid signed amount");
  } else if (commercialAdjustment !== 0n && !adjustmentReason) {
    missingInputs.push("Commercial adjustment: reason");
  }

  const priceDelta = itemEffectsDelta + creditReconciliation + consequenceDelta + (commercialAdjustment ?? 0n);
  const proposalAdjustment = creditReconciliation + consequenceDelta + (commercialAdjustment ?? 0n);
  if (priceDelta < -MAX_AMOUNT_MINOR || priceDelta > MAX_AMOUNT_MINOR)
    throw new Error("Calculated price adjustment exceeds supported amount bounds");
  if (missingInputs.length > 0) reasons.push("Some required measurements or contractor confirmations are missing.");
  const snapshot = deepFreeze({
    version: 1,
    scope_revision: input.scopeRevision,
    item_effects: input.effects.map((effect) => ({ ...effect })),
    consequences: [...(input.consequences ?? [])].filter(
      (op, index, all) => all.findIndex((candidate) => candidate.identity === op.identity) === index,
    ),
    template_snapshots: structuredClone(input.templateSnapshots ?? []),
    confirmed_site_facts: input.siteFacts && input.siteFacts.trim().length > 0 ? input.siteFacts.trim() : null,
    item_effects_delta_minor: itemEffectsDelta.toString(),
    omission_credit_suggestion_minor: omissionSuggestionComplete ? omissionSuggestion.toString() : null,
    confirmed_omission_credit_minor: confirmedOmissionCredit?.toString() ?? null,
    credit_reconciliation_minor: creditReconciliation.toString(),
    consequence_delta_minor: consequenceDelta.toString(),
    commercial_adjustment_minor: proposalAdjustment.toString(),
    contractor_commercial_adjustment_minor: (commercialAdjustment ?? 0n).toString(),
    commercial_adjustment_reason: adjustmentReason,
    price_delta_minor: priceDelta.toString(),
    effort_delta_micro_hours: (effortDelta + consequenceEffort).toString(),
  });
  return {
    status: missingInputs.length > 0 ? "needs_assessment" : "ready",
    reasons: [...new Set(reasons)],
    missingInputs: [...new Set(missingInputs)],
    itemEffectsDeltaMinor: itemEffectsDelta.toString(),
    omissionCreditSuggestionMinor: omissionSuggestionComplete ? omissionSuggestion.toString() : null,
    confirmedOmissionCreditMinor: confirmedOmissionCredit?.toString() ?? null,
    creditReconciliationMinor: creditReconciliation.toString(),
    consequenceDeltaMinor: consequenceDelta.toString(),
    commercialAdjustmentMinor: (commercialAdjustment ?? 0n).toString(),
    commercialAdjustmentReason: adjustmentReason,
    proposalAdjustmentMinor: proposalAdjustment.toString(),
    priceDeltaMinor: priceDelta.toString(),
    effortDeltaMicroHours: (effortDelta + consequenceEffort).toString(),
    snapshot,
  };
}

export function serializeMinorUnits(value: bigint): string {
  if (value < -MAX_AMOUNT_MINOR || value > MAX_AMOUNT_MINOR) throw new Error("Amount is outside supported bounds");
  return value.toString();
}

export function formatSignedMinorAmount(value: bigint): string {
  const absolute = value < 0n ? -value : value;
  const formatted = new Intl.NumberFormat("pl-PL").format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${value < 0n ? "−" : value > 0n ? "+" : ""}${formatted},${fraction} zł`;
}

export function formatPersonHours(microHours: bigint): string {
  const absoluteHundredths = roundHalfUp(microHours < 0n ? -microHours : microHours, 10_000n);
  const sign = microHours < 0n ? "−" : microHours > 0n ? "+" : "";
  return `${sign}${absoluteHundredths / 100n},${(absoluteHundredths % 100n).toString().padStart(2, "0")} h`;
}
