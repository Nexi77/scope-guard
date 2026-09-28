import type { AstroCookies } from "astro";
import type { User } from "@supabase/supabase-js";

import type { OfferChangeRecord, OfferRecord, OfferRevisionRecord } from "@/lib/contractor-offer-view";
import { UUID_PATTERN } from "@/lib/offer-change-request";
import { createClient } from "@/lib/supabase";

export interface OfferHistoryCursor {
  direction: "after" | "before";
  at: string;
  priority: number;
  stable_id: string;
}

export type OfferHistoryEvent =
  | { kind: "revision"; at: string; id: string; state_at_creation: "pending"; revision: OfferRevisionRecord }
  | { kind: "revision-decision"; at: string; id: string; revision: OfferRevisionRecord }
  | {
      kind: "revision-replacement";
      at: string;
      id: string;
      revision: OfferRevisionRecord;
      successor: { id: string; revision: number };
    }
  | { kind: "change"; at: string; id: string; state_at_creation: "pending" | "agreed"; change: OfferChangeRecord }
  | {
      kind: "change-decision";
      at: string;
      id: string;
      change: OfferChangeRecord;
      decision: NonNullable<OfferChangeRecord["decision"]>;
    }
  | {
      kind: "change-replacement";
      at: string;
      id: string;
      change: OfferChangeRecord;
      successor: { id: string; proposal_revision: number };
    };

export interface OfferHistoryPage {
  offer: Pick<OfferRecord, "id" | "status" | "base_revision">;
  canEdit: boolean;
  canProposeChange: boolean;
  events: OfferHistoryEvent[];
  hasPrevious: boolean;
  previousCursor: OfferHistoryCursor | null;
  hasNext: boolean;
  nextCursor: OfferHistoryCursor | null;
}

type LoadResult = { kind: "ok"; page: OfferHistoryPage } | { kind: "unavailable" };

function isCursor(value: unknown): value is OfferHistoryCursor {
  if (!value || typeof value !== "object") return false;
  const cursor = value as Record<string, unknown>;
  return (
    (cursor.direction === "after" || cursor.direction === "before") &&
    typeof cursor.at === "string" &&
    Number.isInteger(cursor.priority) &&
    typeof cursor.stable_id === "string"
  );
}

function parseCursor(value: string | null): OfferHistoryCursor | null | false {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isCursor(parsed) ? parsed : false;
  } catch {
    return false;
  }
}

function parsePage(
  value: unknown,
  offer: OfferHistoryPage["offer"],
  canEdit: boolean,
  canProposeChange: boolean,
): OfferHistoryPage | null {
  if (!value || typeof value !== "object") return null;
  const result = value as Record<string, unknown>;
  if (!Array.isArray(result.events)) return null;
  return {
    offer,
    canEdit,
    canProposeChange,
    events: result.events as OfferHistoryEvent[],
    hasPrevious: result.has_previous === true,
    previousCursor: isCursor(result.previous_cursor) ? result.previous_cursor : null,
    hasNext: result.has_next === true,
    nextCursor: isCursor(result.next_cursor) ? result.next_cursor : null,
  };
}

export async function loadContractorOfferHistory(
  requestHeaders: Headers,
  cookies: AstroCookies,
  user: User | null,
  offerId: string,
  options: {
    cursor: string | null;
    targetId: string | null;
    targetKind: "revision" | "change" | null;
    pageSize: number;
  },
): Promise<LoadResult> {
  if (!user || !UUID_PATTERN.test(offerId)) return { kind: "unavailable" };
  if (options.targetId && (!UUID_PATTERN.test(options.targetId) || !options.targetKind)) return { kind: "unavailable" };
  const cursor = parseCursor(options.cursor);
  if (cursor === false) return { kind: "unavailable" };
  const supabase = createClient(requestHeaders, cookies);
  if (!supabase) return { kind: "unavailable" };

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id, status, base_revision")
    .eq("id", offerId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (offerError || !offer) return { kind: "unavailable" };
  const ownedOffer = {
    id: String(offer.id),
    status: String(offer.status),
    base_revision: Number(offer.base_revision),
  };

  const { data: changes, error: changesError } = await supabase
    .from("offer_changes")
    .select("id")
    .eq("offer_id", ownedOffer.id)
    .eq("contractor_id", user.id)
    .limit(1);
  if (changesError) return { kind: "unavailable" };

  const historyResult = await supabase
    .rpc("get_contractor_offer_history_page", {
      p_offer_id: ownedOffer.id,
      p_cursor: cursor,
      p_page_size: options.pageSize,
      p_target_record_id: cursor ? null : options.targetId,
      p_target_record_kind: cursor ? null : options.targetKind,
    })
    .then((value: unknown) => value as { data: unknown; error: unknown });
  const { data, error } = historyResult;
  if (error) return { kind: "unavailable" };
  const page = parsePage(
    data,
    ownedOffer,
    ownedOffer.status === "pending" && changes.length === 0,
    ownedOffer.status === "accepted" || ownedOffer.status === "agreed",
  );
  return page ? { kind: "ok", page } : { kind: "unavailable" };
}
