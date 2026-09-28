import { UUID_PATTERN } from "@/lib/offer-change-request";
import { createAnonymousClient } from "@/lib/supabase";

export type SharedOfferStatus = "pending" | "accepted" | "agreed" | "rejected";
export type SharedChangeStatus = "pending" | "accepted" | "rejected" | "agreed" | "superseded";

export interface SharedOfferView {
  status: SharedOfferStatus;
  currencyCode: string;
  scope: string;
  items: {
    name: string;
    quantity: string;
    unit: string;
    specification: string;
    unitPriceMinor: string;
    lineAmountMinor: string;
  }[];
  totalMinor: string;
  deadline: string;
  changes: {
    description: string;
    status: SharedChangeStatus;
    priceDeltaMinor: string;
    deadlineDeltaDays: number | null;
  }[];
}

type JsonRecord = Record<string, unknown>;
const offerStatuses = new Set<SharedOfferStatus>(["pending", "accepted", "agreed", "rejected"]);
const changeStatuses = new Set<SharedChangeStatus>(["pending", "accepted", "rejected", "agreed", "superseded"]);
const integerText = /^-?(?:0|[1-9]\d*)$/;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function minor(value: unknown): string | null {
  const candidate = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : text(value);
  return candidate && integerText.test(candidate) ? candidate : null;
}

export type SharedOfferLoadResult = { kind: "available"; view: SharedOfferView } | { kind: "unavailable" };

export async function loadSharedOfferView(token: string): Promise<SharedOfferLoadResult> {
  if (!UUID_PATTERN.test(token)) return { kind: "unavailable" };
  const client = createAnonymousClient();
  if (!client) return { kind: "unavailable" };

  const response = (await client.rpc("get_shared_offer", { p_share_token: token })) as unknown as {
    data: unknown;
    error: unknown;
  };
  const { data, error } = response;
  const projection = record(data);
  if (error || !projection) return { kind: "unavailable" };

  const status = text(projection.status);
  const currencyCode = text(projection.currency_code);
  const totalMinor = minor(projection.active_amount_minor);
  const deadline = text(projection.active_deadline);
  const activeScope = record(projection.active_scope);
  const scope = activeScope && text(activeScope.base_scope);
  if (
    !status ||
    !offerStatuses.has(status as SharedOfferStatus) ||
    !currencyCode ||
    !totalMinor ||
    !deadline ||
    scope === null ||
    !activeScope ||
    !Array.isArray(activeScope.items) ||
    !Array.isArray(projection.changes)
  )
    return { kind: "unavailable" };

  const items: SharedOfferView["items"] = [];
  for (const rawItem of activeScope.items) {
    const item = record(rawItem);
    const name = item && text(item.name);
    const quantity =
      item && (typeof item.quantity === "string" || typeof item.quantity === "number" ? String(item.quantity) : null);
    const unit = item && text(item.unit);
    const specification = item && (item.specification === null ? "" : text(item.specification));
    const unitPriceMinor = item && minor(item.selling_rate_minor);
    const lineAmountMinor = item && minor(item.line_amount_minor);
    if (!item || !name || quantity === null || !unit || specification === null || !unitPriceMinor || !lineAmountMinor)
      return { kind: "unavailable" };
    items.push({ name, quantity, unit, specification, unitPriceMinor, lineAmountMinor });
  }

  const changes: SharedOfferView["changes"] = [];
  for (const rawChange of projection.changes) {
    const change = record(rawChange);
    const description = change && text(change.description);
    const changeStatus = change && text(change.status);
    const priceDeltaMinor = change && minor(change.price_delta_minor);
    const deadlineDeltaDays = change?.deadline_delta_days;
    if (
      !change ||
      !description ||
      !changeStatus ||
      !changeStatuses.has(changeStatus as SharedChangeStatus) ||
      !priceDeltaMinor ||
      (deadlineDeltaDays !== null && (typeof deadlineDeltaDays !== "number" || !Number.isInteger(deadlineDeltaDays)))
    )
      return { kind: "unavailable" };
    changes.push({
      description,
      status: changeStatus as SharedChangeStatus,
      priceDeltaMinor,
      deadlineDeltaDays: deadlineDeltaDays,
    });
  }

  return {
    kind: "available",
    view: {
      status: status as SharedOfferStatus,
      currencyCode,
      scope,
      items,
      totalMinor,
      deadline,
      changes,
    },
  };
}
