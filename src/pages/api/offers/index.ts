import type { APIContext, APIRoute } from "astro";

import { parsePlnAmount } from "@/lib/pln";
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

  const form = await context.request.formData();
  const customerId = readText(form, "customer_id");
  const customerName = readText(form, "customer_name");
  const baseScope = readText(form, "base_scope");
  const baseAmount = parsePlnAmount(readText(form, "base_amount"));
  const baseDeadline = readText(form, "base_deadline");
  const confirmDuplicate = form.get("confirm_duplicate") === "true";

  if ((customerId && customerName) || (!customerId && !customerName)) {
    return errorRedirect(context, "Choose an existing customer or enter a new customer name.");
  }
  if (customerId && !UUID_PATTERN.test(customerId)) return errorRedirect(context, "Choose a valid existing customer.");
  if (!baseScope) return errorRedirect(context, "Original scope is required.");
  if (baseAmount === null) return errorRedirect(context, "Enter a valid non-negative PLN amount.");
  if (!isTodayOrLater(baseDeadline)) return errorRedirect(context, "Deadline must be today or later.");

  const { data, error } = await supabase
    .rpc("create_offer_with_customer", {
      p_customer_id: customerId || null,
      p_customer_name: customerName || null,
      p_confirm_duplicate: customerId ? false : confirmDuplicate,
      p_base_scope: baseScope,
      p_base_amount_minor: baseAmount.toString(),
      p_currency_code: "PLN",
      p_base_deadline: baseDeadline,
    })
    .overrideTypes<CreatedOfferResult[], { merge: false }>();

  if (error) {
    const expectedMessages = new Set([
      "A matching customer requires confirmation",
      "Customer is unavailable",
      "Customer name is required",
      "Base scope is required",
      "Base amount must be non-negative",
      "Base deadline cannot be in the past",
    ]);
    return errorRedirect(
      context,
      expectedMessages.has(error.message) ? error.message : "We couldn't create this offer. Please try again.",
    );
  }

  const createdOffer = Array.isArray(data) ? data[0] : null;
  if (!createdOffer || typeof createdOffer.customer_id !== "string" || !UUID_PATTERN.test(createdOffer.customer_id)) {
    return errorRedirect(
      context,
      "The offer was created, but its customer could not be loaded. Open the offers page to find it.",
    );
  }

  return context.redirect(`/offers/new?created=1&customer=${encodeURIComponent(createdOffer.customer_id)}`);
};
