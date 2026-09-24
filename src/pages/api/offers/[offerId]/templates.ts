import type { APIRoute } from "astro";

import { readBoundedFormData, RequestBodyTooLargeError } from "@/lib/bounded-form-data";
import { OFFER_ITEM_UNITS } from "@/lib/offer-items";
import { createClient } from "@/lib/supabase";
import { UUID_PATTERN } from "@/lib/offer-change-request";

const MAX_BYTES = 64 * 1024;
const MAX_MINOR = 9_999_999_999_999_999n;
const TRADES = ["painting", "tiling", "electrical", "plumbing"] as const;

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST: APIRoute = async (context) => {
  const offerId = context.params.offerId ?? "";
  if (!UUID_PATTERN.test(offerId)) return json(404, { error: "Offer is unavailable." });
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json(503, { error: "Templates are unavailable right now." });
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return json(401, { error: "Sign in to save a template." });
  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id")
    .eq("id", offerId)
    .eq("contractor_id", user.id)
    .maybeSingle();
  if (offerError) return json(503, { error: "The offer could not be loaded. Try again." });
  if (!offer) return json(404, { error: "Offer is unavailable." });

  let form: FormData;
  try {
    form = await readBoundedFormData(context.request, MAX_BYTES);
  } catch (error) {
    return error instanceof RequestBodyTooLargeError
      ? json(413, { error: "Template details are too large." })
      : json(400, { error: "Submit valid template details." });
  }
  const text = form.get("template_json");
  if (typeof text !== "string") return json(400, { error: "Template details are required." });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: "Template details are invalid JSON.", fieldErrors: { template_json: "Invalid JSON." } });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return json(400, { error: "Template details are invalid." });
  const body = raw as Record<string, unknown>;
  const trade = body.trade;
  const name = body.name;
  const unit = body.unit;
  const prompts = body.prompts;
  const rate = body.selling_rate_minor;
  const hours = body.labor_hours_per_unit;
  const companionOperations = body.companion_operations;
  if (
    typeof name !== "string" ||
    name.trim().length < 1 ||
    name.length > 200 ||
    typeof trade !== "string" ||
    !TRADES.includes(trade as (typeof TRADES)[number]) ||
    typeof unit !== "string" ||
    !OFFER_ITEM_UNITS.some((option) => option.value === unit) ||
    !Array.isArray(prompts) ||
    prompts.length > 20 ||
    prompts.some((prompt) => typeof prompt !== "string" || prompt.length > 500) ||
    (rate !== null && (typeof rate !== "string" || !/^\d+$/.test(rate) || BigInt(rate) > MAX_MINOR)) ||
    (hours !== null &&
      (typeof hours !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(hours) || Number(hours) >= 1_000_000_000)) ||
    !Array.isArray(companionOperations) ||
    companionOperations.length > 20
  ) {
    return json(400, {
      error: "Review the template name, trade, unit, rates, effort, and prompts.",
      fieldErrors: { template_json: "Template fields are invalid." },
    });
  }
  const normalizedOperations = companionOperations.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const operation = candidate as Record<string, unknown>;
    if (
      ["identity", "name", "unit", "specification", "prompt"].some((key) => typeof operation[key] !== "string") ||
      ["identity", "name", "specification", "prompt"].some(
        (key) => typeof operation[key] === "string" && operation[key].trim().length === 0,
      ) ||
      !OFFER_ITEM_UNITS.some((option) => option.value === operation.unit) ||
      (operation.sellingRateMinor !== null &&
        (typeof operation.sellingRateMinor !== "string" ||
          !/^\d+$/.test(operation.sellingRateMinor) ||
          BigInt(operation.sellingRateMinor) > MAX_MINOR)) ||
      (operation.laborHoursPerUnit !== null &&
        (typeof operation.laborHoursPerUnit !== "string" ||
          !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(operation.laborHoursPerUnit) ||
          Number(operation.laborHoursPerUnit) >= 1_000_000_000))
    )
      return null;
    return {
      identity: operation.identity,
      name: operation.name,
      unit: operation.unit,
      specification: operation.specification,
      prompt: operation.prompt,
      sellingRateMinor: operation.sellingRateMinor,
      laborHoursPerUnit: operation.laborHoursPerUnit,
    };
  });
  if (normalizedOperations.some((operation) => operation === null))
    return json(400, { error: "A companion operation is invalid." });

  const templateKey = `${trade}-${crypto.randomUUID()}`;
  const { data, error } = await supabase
    .from("offer_change_templates")
    .insert({
      contractor_id: user.id,
      template_key: templateKey,
      version: 1,
      trade,
      name: name.trim(),
      unit,
      prompts,
      selling_rate_minor: rate,
      labor_hours_per_unit: hours,
      companion_operations: normalizedOperations,
    })
    .select("id, version, trade, name, unit, prompts, selling_rate_minor, labor_hours_per_unit, companion_operations")
    .single();
  if (error) return json(400, { error: "The template could not be saved. Review its details and try again." });
  return json(201, { success: true, template: data });
};
