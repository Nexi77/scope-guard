import type { APIRoute } from "astro";

import { createClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function generatePin() {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  do crypto.getRandomValues(values);
  while (values[0] >= limit);
  return String(values[0] % 1_000_000).padStart(6, "0");
}

export const POST: APIRoute = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== context.url.origin) return json({ error: "Request origin is not allowed." }, 403);

  const offerId = context.params.offerId ?? "";
  if (!UUID_PATTERN.test(offerId)) return json({ error: "Offer is unavailable." }, 400);

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) return json({ error: "PIN could not be managed. Try again." }, 503);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Sign in to manage this offer PIN." }, 401);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pin = generatePin();
    const result = await supabase.rpc("set_offer_pin", { p_offer_id: offerId, p_pin: pin });
    if (!result.error && result.data === true) return json({ pin }, 200);
    if (result.error?.message === "PIN must differ from the current PIN") continue;
    return json({ error: "PIN could not be managed. Check that this offer is available and try again." }, 404);
  }

  return json({ error: "A new PIN could not be generated. Try again." }, 503);
};
