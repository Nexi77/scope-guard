export const OFFER_ITEM_UNITS = [
  { value: "piece", label: "Piece (pc)" },
  { value: "set", label: "Set" },
  { value: "m", label: "Metre (m)" },
  { value: "m²", label: "Square metre (m²)" },
  { value: "m³", label: "Cubic metre (m³)" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "l", label: "Litre (l)" },
  { value: "hour", label: "Hour (h)" },
] as const;

export type OfferItemUnit = (typeof OFFER_ITEM_UNITS)[number]["value"];
export type OfferItemField = "name" | "quantity" | "unit" | "specification" | "sellingRate" | "laborHours";

export interface OfferItemDraft {
  id?: string;
  name: string;
  quantity: string;
  unit: OfferItemUnit | "";
  specification: string;
  sellingRate: string;
  laborHours: string;
}

export interface OfferItemPayload {
  id?: string;
  name: string;
  quantity: number;
  unit: OfferItemUnit;
  specification: string;
  selling_rate_minor: number;
  labor_hours_per_unit: number;
}

export interface OfferItemValidationError {
  itemIndex: number;
  field: OfferItemField;
  message: string;
}

export const EMPTY_OFFER_ITEM: OfferItemDraft = {
  name: "",
  quantity: "",
  unit: "",
  specification: "",
  sellingRate: "",
  laborHours: "",
};

const MAX_AMOUNT_MINOR = 9_999_999_999_999_999n;
const MAX_EXACT_JSON_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseThousandths(value: string, positive: boolean): number | null {
  const trimmed = value.trim();
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.replace(",", ".").split(".");
  const scaled = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if ((positive && scaled <= 0n) || scaled < 0n || scaled >= 1_000_000_000_000n) return null;
  return Number(scaled) / 1000;
}

function parseRateMinor(value: string): bigint | null {
  const trimmed = value.trim();
  const pattern = /^(?:(?:0|[1-9]\d*)(?:[,.]\d{1,2})?|(?:[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?)$/;
  if (!pattern.test(trimmed)) return null;
  const normalized = trimmed.includes(".")
    ? trimmed.replaceAll(",", "")
    : /,\d{1,2}$/.test(trimmed)
      ? trimmed.replace(",", ".")
      : trimmed.replaceAll(",", "");
  const [whole, fraction = ""] = normalized.split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor <= MAX_AMOUNT_MINOR ? minor : null;
}

function parseItem(
  draft: OfferItemDraft,
  index: number,
  allowIds: boolean,
): { item: OfferItemPayload } | { error: OfferItemValidationError } {
  const fail = (field: OfferItemField, message: string) => ({ error: { itemIndex: index, field, message } });
  const name = draft.name.trim();
  if (name.length < 1 || name.length > 200) return fail("name", "Enter an item name of up to 200 characters.");

  const quantity = parseThousandths(draft.quantity, true);
  if (quantity === null) return fail("quantity", "Enter a positive quantity with up to three decimal places.");

  if (!OFFER_ITEM_UNITS.some(({ value }) => value === draft.unit)) {
    return fail("unit", "Choose a supported unit.");
  }

  const specification = draft.specification.trim();
  if (specification.length < 1 || specification.length > 2000) {
    return fail("specification", "Enter a specification of up to 2,000 characters.");
  }

  const sellingRateMinor = parseRateMinor(draft.sellingRate);
  if (sellingRateMinor === null || sellingRateMinor > MAX_EXACT_JSON_INTEGER) {
    return fail("sellingRate", "Enter a non-negative PLN rate that can be represented exactly.");
  }

  const laborHours = parseThousandths(draft.laborHours, false);
  if (laborHours === null) return fail("laborHours", "Enter labor hours with up to three decimal places.");

  if (allowIds && draft.id && !UUID_PATTERN.test(draft.id)) {
    return fail("name", "This item could not be identified. Reload the offer before editing.");
  }

  return {
    item: {
      ...(allowIds && draft.id ? { id: draft.id } : {}),
      name,
      quantity,
      unit: draft.unit,
      specification,
      selling_rate_minor: Number(sellingRateMinor),
      labor_hours_per_unit: laborHours,
    },
  };
}

export function parseOfferItemDrafts(
  drafts: OfferItemDraft[],
  allowIds = false,
): { items: OfferItemPayload[] } | { error: OfferItemValidationError } {
  if (drafts.length < 1 || drafts.length > 100) {
    return { error: { itemIndex: 0, field: "name", message: "An offer must contain between 1 and 100 items." } };
  }

  const items: OfferItemPayload[] = [];
  let total = 0n;
  for (let index = 0; index < drafts.length; index += 1) {
    const parsed = parseItem(drafts[index], index, allowIds);
    if ("error" in parsed) return parsed;
    const quantityThousandths = BigInt(Math.round(parsed.item.quantity * 1000));
    const lineAmountMinor = (quantityThousandths * BigInt(parsed.item.selling_rate_minor) + 500n) / 1000n;
    total += lineAmountMinor;
    if (lineAmountMinor > MAX_AMOUNT_MINOR || total > MAX_AMOUNT_MINOR) {
      return {
        error: {
          itemIndex: index,
          field: "sellingRate",
          message: "The calculated offer total exceeds the supported amount.",
        },
      };
    }
    items.push(parsed.item);
  }

  return { items };
}

export function parseOfferItemPayloads(
  payload: unknown,
  allowIds = false,
): { items: OfferItemPayload[] } | { error: OfferItemValidationError } {
  const invalid = (itemIndex: number, field: OfferItemField = "name"): { error: OfferItemValidationError } => ({
    error: { itemIndex, field, message: "Offer items are invalid. Review the item details and try again." },
  });
  if (!Array.isArray(payload) || payload.length < 1 || payload.length > 100) return invalid(0);

  const allowedKeys = new Set([
    ...(allowIds ? ["id"] : []),
    "name",
    "quantity",
    "unit",
    "specification",
    "selling_rate_minor",
    "labor_hours_per_unit",
  ]);
  const drafts: OfferItemDraft[] = [];
  for (let index = 0; index < payload.length; index += 1) {
    const payloadEntries: unknown[] = payload;
    const value = payloadEntries[index];
    if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(index);
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) return invalid(index);
    const name = record.name;
    const quantity = record.quantity;
    const unit = record.unit;
    const specification = record.specification;
    const sellingRateMinor = record.selling_rate_minor;
    const laborHours = record.labor_hours_per_unit;
    if (
      typeof name !== "string" ||
      (typeof quantity !== "number" && typeof quantity !== "string") ||
      typeof unit !== "string" ||
      typeof specification !== "string" ||
      (typeof sellingRateMinor !== "number" && typeof sellingRateMinor !== "string") ||
      (typeof laborHours !== "number" && typeof laborHours !== "string") ||
      (record.id !== undefined && typeof record.id !== "string")
    ) {
      return invalid(index);
    }
    let rateText: string;
    try {
      const minor = BigInt(sellingRateMinor);
      if (minor < 0n) return invalid(index, "sellingRate");
      rateText = `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`;
    } catch {
      return invalid(index, "sellingRate");
    }
    drafts.push({
      ...(typeof record.id === "string" ? { id: record.id } : {}),
      name,
      quantity: String(quantity),
      unit: unit as OfferItemDraft["unit"],
      specification,
      sellingRate: rateText,
      laborHours: String(laborHours),
    });
  }
  return parseOfferItemDrafts(drafts, allowIds);
}

export function calculateOfferItemLine(draft: OfferItemDraft): bigint | null {
  const parsed = parseItem(draft, 0, false);
  if ("error" in parsed) return null;
  const quantityThousandths = BigInt(Math.round(parsed.item.quantity * 1000));
  return (quantityThousandths * BigInt(parsed.item.selling_rate_minor) + 500n) / 1000n;
}

export function calculateOfferItemsTotal(drafts: OfferItemDraft[]): bigint | null {
  const parsed = parseOfferItemDrafts(drafts);
  if ("error" in parsed) return null;
  return parsed.items.reduce((total, item) => {
    const quantityThousandths = BigInt(Math.round(item.quantity * 1000));
    return total + (quantityThousandths * BigInt(item.selling_rate_minor) + 500n) / 1000n;
  }, 0n);
}

export function formatMinorAmount(minor: bigint): string {
  const major = minor / 100n;
  const fraction = (minor % 100n).toString().padStart(2, "0");
  return `${new Intl.NumberFormat("pl-PL").format(major)},${fraction} zł`;
}

export function draftFromOfferItem(item: {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  specification: string;
  selling_rate_minor: number | string;
  labor_hours_per_unit: number | string;
}): OfferItemDraft {
  const minor = BigInt(item.selling_rate_minor);
  return {
    id: item.id,
    name: item.name,
    quantity: String(item.quantity),
    unit: OFFER_ITEM_UNITS.some(({ value }) => value === item.unit) ? (item.unit as OfferItemUnit) : "",
    specification: item.specification,
    sellingRate: `${minor / 100n}.${(minor % 100n).toString().padStart(2, "0")}`,
    laborHours: String(item.labor_hours_per_unit),
  };
}
