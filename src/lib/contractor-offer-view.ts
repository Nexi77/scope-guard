import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";

import { STARTER_OFFER_CHANGE_TEMPLATES, type OfferChangeTemplate } from "@/lib/offer-change-templates";
import { UUID_PATTERN } from "@/lib/offer-change-request";
import { createClient } from "@/lib/supabase";

export interface OfferRecord {
  id: string;
  base_scope: string;
  base_amount_minor: string | number;
  base_deadline: string;
  currency_code: string;
  status: string;
  items_revision: number;
  active_scope_revision: number;
  base_revision: number;
  share_token?: string | null;
  share_link_revoked_at?: string | null;
}

export interface OfferItemRecord {
  id: string;
  name: string;
  quantity: string | number;
  unit: string;
  specification: string;
  selling_rate_minor: string | number;
  labor_hours_per_unit: string | number;
  line_amount_minor: string | number;
}

export interface OfferRevisionRecord {
  id: string;
  revision: number;
  base_scope: string;
  base_amount_minor: string | number;
  base_deadline: string;
  items: OfferItemRecord[];
  status: "pending" | "accepted" | "rejected" | "superseded";
  created_at: string;
  decided_at: string | null;
  decision_outcome?: "accepted" | "rejected" | null;
  rejection_comment: string | null;
  superseded_by?: string | null;
  superseded_at?: string | null;
}

export interface CurrentOfferRecord {
  active_amount_minor: string | number;
  active_deadline: string;
  active_scope: {
    items: Omit<OfferItemRecord, "labor_hours_per_unit">[];
    accepted_changes: { id: string; description: string; status: string }[];
  };
  changes: {
    id: string;
    description: string;
    status: string;
    price_delta_minor: string | number | null;
    deadline_delta_days: number | null;
    price_explanation: string;
    decision: { outcome: string; rejection_comment: string | null; decided_at: string } | null;
  }[];
}

export interface OfferChangeRecord {
  id: string;
  description: string;
  status: string;
  price_delta_minor: string | number | null;
  deadline_delta_days: number | null;
  created_at: string;
  updated_at: string;
  proposal_revision: number;
  estimate_snapshot: Record<string, unknown>;
  item_effects: unknown[];
  decision: OfferChangeDecisionRecord | null;
  superseded_by?: string | null;
  superseded_at?: string | null;
}

export interface OfferChangeDecisionRecord {
  offer_change_id: string;
  outcome: "accepted" | "rejected";
  rejection_comment: string | null;
  decided_at: string;
}

export interface OfferViewSections {
  items?: boolean;
  revisions?: boolean;
  currentRevision?: boolean;
  current?: boolean;
  effectiveItems?: boolean;
  templates?: boolean;
  changes?: boolean;
  pin?: boolean;
  share?: boolean;
}

export interface ContractorOfferView {
  offer: OfferRecord;
  items: OfferItemRecord[];
  revisions: OfferRevisionRecord[];
  currentRevision: OfferRevisionRecord | null;
  current: CurrentOfferRecord | null;
  effectiveItems: OfferItemRecord[];
  changes: OfferChangeRecord[];
  templates: OfferChangeTemplate[];
  hasChanges: boolean;
  pendingChangeId: string | null;
  canEdit: boolean;
  canProposeChange: boolean;
  pinConfigured: boolean;
}

type LoadResult = { kind: "ok"; view: ContractorOfferView } | { kind: "unavailable" };

export async function loadContractorOfferView(
  requestHeaders: Headers,
  cookies: AstroCookies,
  user: User | null,
  offerId: string,
  sections: OfferViewSections = {},
): Promise<LoadResult> {
  if (!user || !UUID_PATTERN.test(offerId)) return { kind: "unavailable" };
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) return { kind: "unavailable" };

  const offerQuery = sections.share
    ? supabase
        .from("offers")
        .select(
          "id, base_scope, base_amount_minor, base_deadline, currency_code, status, items_revision, active_scope_revision, base_revision, share_token, share_link_revoked_at",
        )
    : supabase
        .from("offers")
        .select(
          "id, base_scope, base_amount_minor, base_deadline, currency_code, status, items_revision, active_scope_revision, base_revision",
        );
  const { data: offer, error: offerError } = await offerQuery
    .eq("id", offerId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (offerError || !offer) return { kind: "unavailable" };
  const ownedOfferId = String(offer.id);

  // A bounded owner-scoped read is enough to decide whether original revisions remain editable.
  const historyResult = await supabase
    .from("offer_changes")
    .select("id")
    .eq("offer_id", offer.id)
    .eq("contractor_id", user.id)
    .limit(1);
  if (historyResult.error) return { kind: "unavailable" };
  const hasChanges = historyResult.data.length > 0;

  const [
    itemsResult,
    revisionsResult,
    currentRevisionResult,
    currentResult,
    effectiveItemsResult,
    templatesResult,
    changesResult,
    pinResult,
  ] = await Promise.all([
    sections.items
      ? supabase
          .from("offer_items")
          .select(
            "id, name, quantity, unit, specification, selling_rate_minor, labor_hours_per_unit, line_amount_minor",
          )
          .eq("offer_id", offer.id)
          .eq("contractor_id", user.id)
          .order("position", { ascending: true })
      : null,
    sections.revisions
      ? supabase
          .from("offer_revisions")
          .select(
            "id, revision, base_scope, base_amount_minor, base_deadline, items, status, created_at, decided_at, rejection_comment",
          )
          .eq("offer_id", offer.id)
          .eq("contractor_id", user.id)
          .order("revision", { ascending: false })
      : null,
    sections.currentRevision
      ? supabase
          .from("offer_revisions")
          .select(
            "id, revision, base_scope, base_amount_minor, base_deadline, items, status, created_at, decided_at, rejection_comment",
          )
          .eq("offer_id", offer.id)
          .eq("contractor_id", user.id)
          .eq("revision", offer.base_revision)
          .maybeSingle()
      : null,
    sections.current
      ? supabase
          .rpc("get_contractor_offer_current", { p_offer_id: ownedOfferId })
          .then((value: unknown) => value as { data: unknown; error: unknown })
      : null,
    sections.effectiveItems
      ? supabase
          .rpc("get_effective_offer_items", { p_offer_id: ownedOfferId })
          .then((value: unknown) => value as { data: unknown; error: unknown })
      : null,
    sections.templates
      ? supabase
          .from("offer_change_templates")
          .select(
            "id, version, trade, name, unit, prompts, selling_rate_minor, labor_hours_per_unit, companion_operations",
          )
          .eq("contractor_id", user.id)
          .order("name", { ascending: true })
      : null,
    sections.changes
      ? supabase
          .from("offer_changes")
          .select(
            "id, description, status, price_delta_minor, deadline_delta_days, created_at, updated_at, proposal_revision, estimate_snapshot, item_effects",
          )
          .eq("offer_id", offer.id)
          .eq("contractor_id", user.id)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : null,
    sections.pin
      ? supabase.from("offers").select("pin_hash").eq("id", offer.id).eq("contractor_id", user.id).single()
      : null,
  ]);
  if (
    itemsResult?.error ||
    revisionsResult?.error ||
    currentRevisionResult?.error ||
    currentResult?.error ||
    effectiveItemsResult?.error ||
    templatesResult?.error ||
    changesResult?.error ||
    pinResult?.error
  )
    return { kind: "unavailable" };

  const rawTemplates: unknown = templatesResult?.data;
  const savedTemplates: OfferChangeTemplate[] = Array.isArray(rawTemplates)
    ? (
        rawTemplates as {
          id: string;
          version: number;
          trade: OfferChangeTemplate["trade"];
          name: string;
          unit: OfferChangeTemplate["unit"];
          prompts: string[];
          selling_rate_minor: number | string | null;
          labor_hours_per_unit: number | string | null;
          companion_operations: OfferChangeTemplate["companionOperations"];
        }[]
      ).map((template) => ({
        id: template.id,
        version: template.version,
        contractorId: user.id,
        trade: template.trade,
        name: template.name,
        unit: template.unit,
        prompts: template.prompts,
        sellingRateMinor: template.selling_rate_minor === null ? null : String(template.selling_rate_minor),
        laborHoursPerUnit: template.labor_hours_per_unit === null ? null : String(template.labor_hours_per_unit),
        companionOperations: template.companion_operations,
      }))
    : [];
  const current = (currentResult?.data ?? null) as CurrentOfferRecord | null;
  const changeRows = (changesResult?.data ?? []) as Omit<OfferChangeRecord, "decision">[];
  let decisions: OfferChangeDecisionRecord[] = [];
  if (changeRows.length > 0) {
    const decisionResult = await supabase
      .from("change_decisions")
      .select("offer_change_id, outcome, rejection_comment, decided_at")
      .eq("contractor_id", user.id)
      .in(
        "offer_change_id",
        changeRows.map((change) => change.id),
      );
    if (decisionResult.error) return { kind: "unavailable" };
    decisions = decisionResult.data;
  }
  const decisionByChange = new Map(decisions.map((decision) => [decision.offer_change_id, decision]));
  const changes = changeRows.map((change) => ({ ...change, decision: decisionByChange.get(change.id) ?? null }));
  return {
    kind: "ok",
    view: {
      offer,
      items: itemsResult?.data ?? [],
      revisions: revisionsResult?.data ?? [],
      currentRevision: currentRevisionResult?.data ?? null,
      current,
      effectiveItems: (effectiveItemsResult?.data ?? []) as OfferItemRecord[],
      changes,
      templates: [...STARTER_OFFER_CHANGE_TEMPLATES, ...savedTemplates],
      hasChanges,
      pendingChangeId:
        changes.find((change) => change.status === "pending")?.id ??
        current?.changes.find((change) => change.status === "pending")?.id ??
        null,
      canEdit: offer.status === "pending" && !hasChanges,
      canProposeChange: offer.status === "accepted" || offer.status === "agreed",
      pinConfigured: pinResult ? pinResult.data.pin_hash !== null : false,
    },
  };
}
