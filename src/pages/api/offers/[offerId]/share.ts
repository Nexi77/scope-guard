import type { APIRoute } from "astro";

import { UUID_PATTERN } from "@/lib/offer-change-request";
import { createClient } from "@/lib/supabase";

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const POST: APIRoute = async (context) => {
  if (context.request.headers.get("Origin") !== context.url.origin) {
    return json({ error: "Request origin is not allowed." }, 403);
  }
  const offerId = context.params.offerId ?? "";
  if (!UUID_PATTERN.test(offerId)) return json({ error: "Offer is unavailable." }, 404);

  let body: unknown;
  try {
    body = (await context.request.json()) as unknown;
  } catch {
    return json({ error: "Invalid share action." }, 400);
  }
  const bodyRecord =
    typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const action = bodyRecord?.action;
  if (action !== "revoke" && action !== "reshare") return json({ error: "Invalid share action." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "Share link could not be managed. Try again." }, 503);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sign in to manage this offer link." }, 401);

  const rpcResult: { data: unknown; error: { message: string } | null } = await supabase.rpc(
    "manage_shared_offer_access",
    {
      p_offer_id: offerId,
      p_action: action,
    },
  );
  const { data, error } = rpcResult;
  if (error) {
    if (error.message.includes("Offer is unavailable")) return json({ error: "Offer is unavailable." }, 404);
    if (error.message.includes("must be revoked"))
      return json({ error: "Revoke the current link before re-sharing." }, 409);
    if (error.message.includes("Invalid share action")) return json({ error: "Invalid share action." }, 400);
    return json({ error: "Share link could not be managed. Try again." }, 503);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return json({ error: "Share link could not be managed. Try again." }, 503);
  }
  return json(data as Record<string, unknown>, 200);
};
