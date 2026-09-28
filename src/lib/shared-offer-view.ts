import { UUID_PATTERN } from "@/lib/offer-change-request";
import { createAnonymousClient } from "@/lib/supabase";

export type SharedOfferStatus = "pending" | "accepted" | "agreed" | "rejected";
export type SharedChangeStatus = "pending" | "accepted" | "rejected" | "agreed" | "superseded";

export interface SharedOfferView {
  status: SharedOfferStatus;
  baseRevision: { id: string; revision: number; status: SharedOfferStatus; decidedAt: string | null };
  activeScopeRevision: number;
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
    id: string;
    description: string;
    status: SharedChangeStatus;
    priceDeltaMinor: string;
    deadlineDeltaDays: number | null;
    decision: { outcome: "accepted" | "rejected"; rejectionComment: string | null; decidedAt: string } | null;
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

export function getSharedDecisionTarget(view: SharedOfferView): { kind: "base" | "change"; id: string } | null {
  if (view.baseRevision.status === "pending") return { kind: "base", id: view.baseRevision.id };
  const pendingChange = view.changes.find((change) => change.status === "pending");
  return pendingChange ? { kind: "change", id: pendingChange.id } : null;
}

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
  const baseRevision = record(projection.base_revision);
  const baseRevisionId = baseRevision && text(baseRevision.id);
  const baseRevisionNumber = baseRevision?.revision;
  const baseRevisionStatus = baseRevision && text(baseRevision.status);
  const decidedAt = baseRevision && (baseRevision.decided_at === null ? null : text(baseRevision.decided_at));
  const activeScopeRevision = projection.active_scope_revision;
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
    !Array.isArray(projection.changes) ||
    !baseRevisionId ||
    !UUID_PATTERN.test(baseRevisionId) ||
    typeof baseRevisionNumber !== "number" ||
    !Number.isSafeInteger(baseRevisionNumber) ||
    baseRevisionNumber < 1 ||
    !baseRevisionStatus ||
    !offerStatuses.has(baseRevisionStatus as SharedOfferStatus) ||
    typeof activeScopeRevision !== "number" ||
    !Number.isSafeInteger(activeScopeRevision) ||
    activeScopeRevision < 1
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
    const id = change && text(change.id);
    const description = change && text(change.description);
    const changeStatus = change && text(change.status);
    const priceDeltaMinor = change && minor(change.price_delta_minor);
    const deadlineDeltaDays = change?.deadline_delta_days;
    const rawDecision = change?.decision;
    let decision: SharedOfferView["changes"][number]["decision"] = null;
    if (rawDecision !== null && rawDecision !== undefined) {
      const decisionRecord = record(rawDecision);
      const outcome = decisionRecord && text(decisionRecord.outcome);
      const decisionAt = decisionRecord && text(decisionRecord.decided_at);
      const rejectionComment = decisionRecord?.rejection_comment;
      if (
        !decisionRecord ||
        (outcome !== "accepted" && outcome !== "rejected") ||
        !decisionAt ||
        (rejectionComment !== null && typeof rejectionComment !== "string")
      )
        return { kind: "unavailable" };
      decision = {
        outcome,
        decidedAt: decisionAt,
        rejectionComment: typeof rejectionComment === "string" ? rejectionComment : null,
      };
    }
    if (
      !change ||
      !id ||
      !UUID_PATTERN.test(id) ||
      !description ||
      !changeStatus ||
      !changeStatuses.has(changeStatus as SharedChangeStatus) ||
      !priceDeltaMinor ||
      (deadlineDeltaDays !== null && (typeof deadlineDeltaDays !== "number" || !Number.isInteger(deadlineDeltaDays)))
    )
      return { kind: "unavailable" };
    changes.push({
      id,
      description,
      status: changeStatus as SharedChangeStatus,
      priceDeltaMinor,
      deadlineDeltaDays: deadlineDeltaDays,
      decision,
    });
  }

  return {
    kind: "available",
    view: {
      status: status as SharedOfferStatus,
      baseRevision: {
        id: baseRevisionId,
        revision: baseRevisionNumber,
        status: baseRevisionStatus as SharedOfferStatus,
        decidedAt,
      },
      activeScopeRevision,
      currencyCode,
      scope,
      items,
      totalMinor,
      deadline,
      changes,
    },
  };
}
