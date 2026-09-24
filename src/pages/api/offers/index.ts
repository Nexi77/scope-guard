import type { APIContext, APIRoute } from "astro";

import {
  exceedsUtf8ByteLimit,
  MAX_OFFER_ITEMS_JSON_BYTES,
  readBoundedFormData,
  RequestBodyTooLargeError,
} from "@/lib/bounded-form-data";
import { parseOfferItemPayloads } from "@/lib/offer-items";
import { createClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CreatedOfferResult {
  offer_id: string;
  customer_id: string;
}

function errorRedirect(context: APIContext, message: string) {
  return context.redirect(`/offers/new?error=${encodeURIComponent(message)}`);
}

function readText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readRawText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function isTodayOrLater(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) return false;
  return value >= new Date().toISOString().slice(0, 10);
}

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return errorRedirect(context, "Supabase is not configured.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return context.redirect("/auth/signin");

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request);
  } catch (error) {
    const message =
      error instanceof RequestBodyTooLargeError
        ? "Offer request is too large. Reduce the item details and try again."
        : "Submit valid offer details and try again.";
    return errorRedirect(context, message);
  }
  const customerId = readText(form, "customer_id");
  const customerName = readText(form, "customer_name");
  const baseScope = readText(form, "base_scope");
  const baseDeadline = readText(form, "base_deadline");
  const confirmDuplicate = form.get("confirm_duplicate") === "true";
  let itemPayload: unknown;
  const itemsText = readRawText(form, "items_json");
  if (exceedsUtf8ByteLimit(itemsText, MAX_OFFER_ITEMS_JSON_BYTES)) {
    return errorRedirect(context, "Offer items are too large. Reduce the item details and try again.");
  }
  try {
    itemPayload = JSON.parse(itemsText);
  } catch {
    return errorRedirect(context, "Add at least one valid work item before saving.");
  }
  const parsedItems = parseOfferItemPayloads(itemPayload);

  if ((customerId && customerName) || (!customerId && !customerName)) {
    return errorRedirect(context, "Choose an existing customer or enter a new customer name.");
  }
  if (customerId && !UUID_PATTERN.test(customerId)) return errorRedirect(context, "Choose a valid existing customer.");
  if (!baseScope) return errorRedirect(context, "Original scope is required.");
  if ("error" in parsedItems) return errorRedirect(context, parsedItems.error.message);
  if (!isTodayOrLater(baseDeadline)) return errorRedirect(context, "Deadline must be today or later.");

  const { data, error } = await supabase
    .rpc("create_offer_with_customer", {
      p_customer_id: customerId || null,
      p_customer_name: customerName || null,
      p_confirm_duplicate: customerId ? false : confirmDuplicate,
      p_base_scope: baseScope,
      p_currency_code: "PLN",
      p_base_deadline: baseDeadline,
      p_items: parsedItems.items,
    })
    .overrideTypes<CreatedOfferResult[], { merge: false }>();

  if (error) {
    const expectedMessages = new Set([
      "A matching customer requires confirmation",
      "Customer is unavailable",
      "Customer name is required",
      "Base scope is required",
      "Base deadline cannot be in the past",
      "Items must contain between 1 and 100 bounded entries",
      "Item fields have invalid values",
      "Item numbers are outside the supported precision or bounds",
      "Offer total exceeds the supported amount",
    ]);
    return errorRedirect(
      context,
      expectedMessages.has(error.message) ? error.message : "We couldn't create this offer. Please try again.",
    );
  }

  const createdOffer = Array.isArray(data) ? data[0] : null;
  if (
    !createdOffer ||
    typeof createdOffer.offer_id !== "string" ||
    !UUID_PATTERN.test(createdOffer.offer_id) ||
    typeof createdOffer.customer_id !== "string" ||
    !UUID_PATTERN.test(createdOffer.customer_id)
  ) {
    return errorRedirect(
      context,
      "The offer was created, but its customer could not be loaded. Open the offers page to find it.",
    );
  }

  return context.redirect(`/offers/${encodeURIComponent(createdOffer.offer_id)}`);
};
