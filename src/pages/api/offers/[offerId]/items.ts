import type { APIRoute } from "astro";

import {
  exceedsUtf8ByteLimit,
  MAX_OFFER_ITEMS_JSON_BYTES,
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "@/lib/bounded-form-data";
import { parseOfferItemPayloads } from "@/lib/offer-items";
import { createClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const POST: APIRoute = async (context) => {
  const offerId = context.params.offerId ?? "";
  if (!UUID_PATTERN.test(offerId)) return json(404, { error: "Offer is unavailable." });

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json(503, { error: "Offer editing is unavailable right now." });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json(401, { error: "Sign in to edit this offer." });

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json(413, { error: "Offer request is too large. Reduce the item details and try again." });
    }
    return json(400, { error: "Submit the offer items again." });
  }

  const revisionText = form.get("expected_revision");
  const itemsText = form.get("items_json");
  if (typeof revisionText !== "string" || !/^[1-9]\d*$/.test(revisionText) || typeof itemsText !== "string") {
    return json(400, { error: "Offer revision or item details are invalid." });
  }
  if (exceedsUtf8ByteLimit(itemsText, MAX_OFFER_ITEMS_JSON_BYTES)) {
    return json(413, { error: "Offer items are too large. Reduce the item details and try again." });
  }

  let itemPayload: unknown;
  try {
    itemPayload = JSON.parse(itemsText);
  } catch {
    return json(400, { error: "Offer items are invalid. Review the item details and try again." });
  }
  const parsedItems = parseOfferItemPayloads(itemPayload, true);
  if ("error" in parsedItems) return json(400, { error: parsedItems.error.message });

  const { error } = await supabase.rpc("edit_offer_items", {
    p_offer_id: offerId,
    p_expected_revision: revisionText,
    p_items: parsedItems.items,
  });
  if (error) {
    const messages: Record<string, { status: number; message: string }> = {
      "Offer is unavailable": { status: 404, message: "Offer is unavailable." },
      "Offer items can only be edited while pending": { status: 409, message: "This offer can no longer be edited." },
      "Offer items cannot be edited after change history begins": {
        status: 409,
        message: "This offer is locked because its change history has started.",
      },
      "Offer items have changed; reload before editing": {
        status: 409,
        message: "This offer changed while you were editing. Reload it before trying again.",
      },
      "Item ID is unavailable": {
        status: 400,
        message: "One or more items are unavailable. Reload the offer before editing.",
      },
    };
    const failure = messages[error.message] ?? {
      status: 400,
      message: "We couldn't save these items. Review them and try again.",
    };
    return json(failure.status, { error: failure.message });
  }

  return json(200, { success: true, revision: Number(revisionText) + 1 });
};
