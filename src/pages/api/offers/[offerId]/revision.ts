import type { APIRoute } from "astro";

import {
  exceedsUtf8ByteLimit,
  MAX_OFFER_ITEMS_JSON_BYTES,
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "@/lib/bounded-form-data";
import { parseOfferItemPayloads } from "@/lib/offer-items";
import { createClient } from "@/lib/supabase";
import { UUID_PATTERN } from "@/lib/offer-change-request";

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST: APIRoute = async (context) => {
  const offerId = context.params.offerId ?? "";
  if (!UUID_PATTERN.test(offerId)) return json(404, { error: "Offer is unavailable." });
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json(503, { error: "Offer revisions are unavailable right now." });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: "Sign in to revise this offer." });
  let form: FormData;
  try {
    form = await readBoundedFormData(context.request);
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? json(413, { error: "Offer revision is too large." })
      : json(400, { error: "Submit valid offer details and try again." });
  }
  const revision = form.get("expected_revision");
  const scope = form.get("base_scope");
  const deadline = form.get("base_deadline");
  const itemsText = form.get("items_json");
  const scopeValid = typeof scope === "string" && Boolean(scope.trim()) && scope.length <= 4000;
  const deadlineValid = typeof deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(deadline);
  if (
    typeof revision !== "string" ||
    !/^[1-9]\d*$/.test(revision) ||
    !scopeValid ||
    !deadlineValid ||
    typeof itemsText !== "string"
  )
    return json(400, {
      error: "Enter a scope, a valid deadline, and offer items.",
      fieldErrors: {
        ...(!scopeValid ? { base_scope: "Offer scope is required." } : {}),
        ...(!deadlineValid ? { base_deadline: "Enter a valid target date." } : {}),
        ...(typeof itemsText !== "string" ? { items_json: "Offer items are required." } : {}),
      },
    });
  if (exceedsUtf8ByteLimit(itemsText, MAX_OFFER_ITEMS_JSON_BYTES))
    return json(413, { error: "Offer items are too large." });
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(itemsText);
  } catch {
    return json(400, { error: "Offer items are invalid JSON." });
  }
  const items = parseOfferItemPayloads(rawItems);
  if ("error" in items)
    return json(400, { error: items.error.message, fieldErrors: { items_json: items.error.message } });
  const revisionResult = await supabase.rpc("replace_pending_offer_revision", {
    p_offer_id: offerId,
    p_expected_revision: revision,
    p_base_scope: scope.trim(),
    p_base_deadline: deadline,
    p_items: items.items,
  });
  if (revisionResult.error) {
    if (
      ["Offer revision changed; reload before editing", "Only an unaccepted offer can be revised"].includes(
        revisionResult.error.message,
      )
    )
      return json(409, {
        error: "This offer changed or was accepted while you were editing. Reload it before trying again.",
      });
    if (revisionResult.error.message === "Offer is unavailable") return json(404, { error: "Offer is unavailable." });
    return json(400, { error: "The offer revision could not be saved. Review the details and try again." });
  }
  return json(200, { success: true, revision: revisionResult.data });
};
