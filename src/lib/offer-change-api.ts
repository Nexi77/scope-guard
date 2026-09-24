import type { APIContext } from "astro";

import { parseOfferChangeRequest, UUID_PATTERN } from "@/lib/offer-change-request";
import { estimateOfferChange } from "@/lib/offer-change-estimator";
import { createClient } from "@/lib/supabase";
import { readBoundedFormData, RequestBodyTooLargeError } from "@/lib/bounded-form-data";

export function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function prepareChange(context: APIContext) {
  const offerId = context.params.offerId ?? "";
  if (!UUID_PATTERN.test(offerId)) return { response: json(404, { error: "Offer is unavailable." }) };
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return { response: json(503, { error: "Offer changes are unavailable right now." }) };
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { response: json(401, { error: "Sign in to record an offer change." }) };

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request);
  } catch (error) {
    return {
      response:
        error instanceof RequestBodyTooLargeError
          ? json(413, { error: "Change request is too large." })
          : json(400, { error: "Submit valid change details and try again." }),
    };
  }
  const text = form.get("change_json");
  if (typeof text !== "string") return { response: json(400, { error: "Change details are required." }) };
  const parsed = parseOfferChangeRequest(text);
  if ("error" in parsed)
    return {
      response: json(new TextEncoder().encode(text).byteLength > 256 * 1024 ? 413 : 400, {
        error: parsed.error,
        fieldErrors: { change_json: parsed.error },
      }),
    };

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id, status, base_deadline, active_scope_revision, base_revision")
    .eq("id", offerId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (offerError) return { response: json(503, { error: "The offer could not be loaded. Try again." }) };
  if (!offer) return { response: json(404, { error: "Offer is unavailable." }) };
  if (!Number.isSafeInteger(Number(offer.active_scope_revision)))
    return { response: json(503, { error: "Offer revisions are unavailable." }) };
  const currentRevision = Number(offer.active_scope_revision);
  if (parsed.value.scopeRevision !== currentRevision)
    return { response: json(409, { error: "The agreed scope changed. Reload the offer before estimating." }) };

  const effectiveItemsResult = await supabase.rpc("get_effective_offer_items", { p_offer_id: offerId });
  const items: unknown = effectiveItemsResult.data;
  if (effectiveItemsResult.error || !Array.isArray(items))
    return { response: json(503, { error: "The current work items could not be loaded." }) };
  const current = new Map((items as Record<string, unknown>[]).map((item) => [String(item.id), item]));
  for (const effect of parsed.value.effects) {
    const active = current.get(effect.itemId);
    if (effect.before) {
      if (
        !active ||
        ["name", "quantity", "unit", "specification", "selling_rate_minor", "labor_hours_per_unit"].some(
          (key) => String(active[key]) !== String(effect.before[key as keyof typeof effect.before]),
        )
      )
        return {
          response: json(409, { error: "The selected work item changed. Reload the offer before estimating." }),
        };
    } else if (active)
      return { response: json(409, { error: "The new work item identity is already in use. Try again." }) };
  }
  const estimate = estimateOfferChange(parsed.value);
  const changesResult = await supabase
    .from("offer_changes")
    .select("deadline_delta_days")
    .eq("offer_id", offerId)
    .in("status", ["accepted", "agreed"]);
  if (changesResult.error) return { response: json(503, { error: "The current deadline could not be loaded." }) };
  const changes: unknown = changesResult.data;
  const dayDelta = Array.isArray(changes)
    ? (changes as { deadline_delta_days: number | null }[]).reduce(
        (sum, change) => sum + Number(change.deadline_delta_days),
        0,
      )
    : 0;
  const baseDate = new Date(`${offer.base_deadline}T00:00:00Z`);
  baseDate.setUTCDate(baseDate.getUTCDate() + dayDelta);
  const activeDeadline = baseDate.toISOString().slice(0, 10);
  const deadlineDelta = parsed.value.targetDeadline
    ? Math.round(
        (Date.parse(`${parsed.value.targetDeadline}T00:00:00Z`) - Date.parse(`${activeDeadline}T00:00:00Z`)) /
          86_400_000,
      )
    : null;
  return { supabase, offer, offerId, currentRevision, request: parsed.value, estimate, activeDeadline, deadlineDelta };
}
