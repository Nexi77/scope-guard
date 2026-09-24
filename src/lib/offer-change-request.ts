import { parseOfferItemPayloads, type OfferItemPayload } from "@/lib/offer-items";
import type {
  OfferChangeEstimateInput,
  OfferChangeItemEffect,
  OfferChangeOperation,
} from "@/lib/offer-change-estimator";
import { MAX_AMOUNT_MINOR } from "@/lib/offer-change-estimator";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_CHANGE_JSON_BYTES = 256 * 1024;

type ParseResult =
  | {
      value: OfferChangeEstimateInput & {
        description: string;
        targetDeadline: string;
        expectedPendingChangeId: string | null;
        supersessionConfirmed: boolean;
      };
    }
  | { error: string; field?: string };

function parseItem(value: unknown): OfferItemPayload | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed = parseOfferItemPayloads([value], true);
  return "error" in parsed ? undefined : parsed.items[0];
}

export function parseOfferChangeRequest(text: string): ParseResult {
  if (new TextEncoder().encode(text).byteLength > MAX_CHANGE_JSON_BYTES)
    return { error: "Change details are too large." };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "Change details are invalid JSON." };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Change details are invalid." };
  const body = raw as Record<string, unknown>;
  const allowed = new Set([
    "expected_scope_revision",
    "expected_pending_change_id",
    "supersession_confirmed",
    "description",
    "target_deadline",
    "effects",
    "consequences",
    "commercial_adjustment_minor",
    "commercial_adjustment_reason",
    "template_snapshots",
    "site_facts",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    return { error: "Change details contain unsupported fields." };
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const targetDeadline = typeof body.target_deadline === "string" ? body.target_deadline : "";
  if (!description || description.length > 4000)
    return { error: "Describe the proposed change in up to 4,000 characters." };
  if (
    body.expected_scope_revision === undefined ||
    !Number.isSafeInteger(body.expected_scope_revision) ||
    Number(body.expected_scope_revision) < 1
  )
    return { error: "The offer revision is invalid." };
  if (
    body.expected_pending_change_id !== undefined &&
    body.expected_pending_change_id !== null &&
    (typeof body.expected_pending_change_id !== "string" || !UUID_PATTERN.test(body.expected_pending_change_id))
  )
    return { error: "The pending proposal identity is invalid." };
  if (body.supersession_confirmed !== undefined && typeof body.supersession_confirmed !== "boolean")
    return { error: "The proposal replacement confirmation is invalid." };
  if (targetDeadline) {
    const parsedDate = new Date(`${targetDeadline}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(targetDeadline) ||
      Number.isNaN(parsedDate.valueOf()) ||
      parsedDate.toISOString().slice(0, 10) !== targetDeadline
    )
      return { error: "Choose a valid target date." };
    if (body.site_facts !== undefined && (typeof body.site_facts !== "string" || body.site_facts.length > 4000))
      return { error: "Site facts must be text in up to 4,000 characters." };
    if (
      body.template_snapshots !== undefined &&
      (!Array.isArray(body.template_snapshots) || body.template_snapshots.length > 20)
    )
      return { error: "Template snapshots are invalid." };
  }
  if (!Array.isArray(body.effects) || body.effects.length > 100)
    return { error: "Add between one and 100 affected work items." };
  const effects: OfferChangeItemEffect[] = [];
  for (const rawEffect of body.effects) {
    if (!rawEffect || typeof rawEffect !== "object" || Array.isArray(rawEffect))
      return { error: "An affected item is invalid." };
    const effect = rawEffect as Record<string, unknown>;
    if (
      Object.keys(effect).some(
        (key) =>
          ![
            "itemId",
            "before",
            "after",
            "replacementConfirmed",
            "completedQuantity",
            "confirmedOmissionCreditMinor",
          ].includes(key),
      )
    )
      return { error: "An affected item contains unsupported fields." };
    if (typeof effect.itemId !== "string" || !UUID_PATTERN.test(effect.itemId))
      return { error: "Reload this offer; an affected item could not be identified." };
    const before = parseItem(effect.before);
    const after = parseItem(effect.after);
    if (before === undefined || after === undefined || (!before && !after))
      return { error: "Review the affected item details." };
    if (before && before.id !== effect.itemId) return { error: "Reload this offer; the selected item has changed." };
    if (after && after.id !== effect.itemId) return { error: "An updated item must keep its existing identity." };
    effects.push({
      itemId: effect.itemId,
      before,
      after,
      replacementConfirmed: effect.replacementConfirmed === true,
      ...(typeof effect.completedQuantity === "string" ? { completedQuantity: effect.completedQuantity } : {}),
      ...(typeof effect.confirmedOmissionCreditMinor === "string"
        ? { confirmedOmissionCreditMinor: effect.confirmedOmissionCreditMinor }
        : {}),
    });
  }
  if (body.consequences !== undefined && (!Array.isArray(body.consequences) || body.consequences.length > 100))
    return { error: "Consequence operations are invalid." };
  const rawConsequences: unknown[] = Array.isArray(body.consequences) ? body.consequences : [];
  if (
    rawConsequences.some(
      (operation) =>
        !operation ||
        typeof operation !== "object" ||
        Object.keys(operation).some(
          (key) =>
            ![
              "identity",
              "name",
              "quantity",
              "unit",
              "sellingRateMinor",
              "laborHoursPerUnit",
              "specification",
            ].includes(key),
        ) ||
        ["identity", "name", "quantity", "unit", "sellingRateMinor", "laborHoursPerUnit", "specification"].some(
          (key) => typeof (operation as Record<string, unknown>)[key] !== "string",
        ),
    )
  )
    return { error: "Consequence operations contain unsupported fields." };
  const consequences = rawConsequences as OfferChangeOperation[];
  const adjustment = body.commercial_adjustment_minor;
  if (
    adjustment !== undefined &&
    typeof adjustment !== "string" &&
    (typeof adjustment !== "number" || !Number.isSafeInteger(adjustment))
  )
    return {
      error: "Commercial adjustment must be a signed minor-unit amount.",
      field: "commercial_adjustment_minor",
    };
  const commercialAdjustmentMinor = adjustment === undefined ? "0" : String(adjustment);
  if (
    !/^-?(?:0|[1-9]\d*)$/.test(commercialAdjustmentMinor) ||
    BigInt(commercialAdjustmentMinor) < -MAX_AMOUNT_MINOR ||
    BigInt(commercialAdjustmentMinor) > MAX_AMOUNT_MINOR
  )
    return {
      error: "Commercial adjustment is outside the supported amount range.",
      field: "commercial_adjustment_minor",
    };
  const commercialAdjustmentReason =
    typeof body.commercial_adjustment_reason === "string" ? body.commercial_adjustment_reason : null;
  return {
    value: {
      scopeRevision: Number(body.expected_scope_revision ?? 1),
      expectedPendingChangeId: body.expected_pending_change_id ?? null,
      supersessionConfirmed: body.supersession_confirmed === true,
      effects,
      consequences,
      commercialAdjustmentMinor,
      commercialAdjustmentReason,
      templateSnapshots: Array.isArray(body.template_snapshots) ? body.template_snapshots : [],
      siteFacts: typeof body.site_facts === "string" ? body.site_facts : null,
      description,
      targetDeadline,
    },
  };
}
