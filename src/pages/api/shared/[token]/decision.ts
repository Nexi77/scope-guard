import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

import { createDecisionClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 8_192;

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

async function readBoundedBody(
  request: Request,
): Promise<{ kind: "ok"; text: string } | { kind: "too-large" } | { kind: "invalid" }> {
  const reader = request.body?.getReader();
  if (!reader) return { kind: "ok", text: "" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    let complete = false;
    while (!complete) {
      const result = await reader.read();
      complete = result.done;
      if (complete) continue;
      const value = result.value;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "invalid" };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", text: new TextDecoder().decode(bytes) };
}

export const POST: APIRoute = async (context) => {
  if (context.request.headers.get("Origin") !== context.url.origin)
    return json({ error: "Request origin is not allowed." }, 403);
  const token = context.params.token ?? "";
  if (!UUID_PATTERN.test(token)) return json({ error: "Decision is unavailable." }, 404);
  const length = Number(context.request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "Decision request is too large." }, 413);
  const boundedBody = await readBoundedBody(context.request);
  if (boundedBody.kind === "too-large") return json({ error: "Decision request is too large." }, 413);
  if (boundedBody.kind === "invalid") return json({ error: "Invalid decision request." }, 400);
  let value: unknown;
  try {
    value = JSON.parse(boundedBody.text);
  } catch {
    return json({ error: "Invalid decision request." }, 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return json({ error: "Invalid decision request." }, 400);
  const body = value as Record<string, unknown>;
  const targetKind = body.target_kind;
  const targetId = body.target_id;
  const baseRevision = body.expected_base_revision;
  const scopeRevision = body.expected_active_scope_revision;
  const outcome = body.outcome;
  const pin = body.pin;
  const comment = body.rejection_comment;
  if (
    (targetKind !== "base" && targetKind !== "change") ||
    typeof targetId !== "string" ||
    !UUID_PATTERN.test(targetId) ||
    typeof baseRevision !== "number" ||
    !Number.isSafeInteger(baseRevision) ||
    typeof scopeRevision !== "number" ||
    !Number.isSafeInteger(scopeRevision) ||
    (outcome !== "accepted" && outcome !== "rejected") ||
    typeof pin !== "string" ||
    !/^\d{6}$/.test(pin) ||
    (outcome === "rejected" &&
      (typeof comment !== "string" || comment.trim().length === 0 || comment.trim().length > 1000)) ||
    (outcome === "accepted" && comment !== undefined && comment !== null)
  ) {
    return json({ error: "Invalid decision request." }, 400);
  }
  let limiter: { limit(input: { key: string }): Promise<{ success: boolean }> } | undefined;
  try {
    limiter = (env as unknown as { DECISION_LIMITER?: typeof limiter }).DECISION_LIMITER;
  } catch {
    return json({ error: "Decision service is unavailable." }, 503);
  }
  let supabase;
  try {
    supabase = createDecisionClient();
  } catch {
    return json({ error: "Decision service is unavailable." }, 503);
  }
  if (!limiter || !supabase) return json({ error: "Decision service is unavailable." }, 503);
  try {
    const limited = await limiter.limit({ key: token });
    if (!limited.success) return json({ error: "Too many attempts. Try again later." }, 429);
  } catch {
    return json({ error: "Decision service is unavailable." }, 503);
  }
  const rpc = targetKind === "base" ? "decide_customer_offer_revision" : "decide_customer_offer_change";
  let result;
  try {
    result = await supabase.rpc(rpc, {
      p_share_token: token,
      [targetKind === "base" ? "p_offer_revision_id" : "p_offer_change_id"]: targetId,
      p_expected_base_revision: baseRevision,
      p_expected_active_scope_revision: scopeRevision,
      p_pin: pin,
      p_outcome: outcome,
      p_rejection_comment: outcome === "rejected" ? (comment as string).trim() : null,
    });
  } catch {
    return json({ error: "Decision service is unavailable." }, 503);
  }
  if (result.error) {
    if (result.error.code === "PT409")
      return json({ error: "The reviewed offer changed. Refresh and review it again." }, 409);
    return json({ error: "Decision could not be completed. Check the PIN and shared link." }, 400);
  }
  const decision = result.data as { target_id?: string; outcome?: string; decided_at?: string } | null;
  if (
    !decision?.target_id ||
    decision.target_id !== targetId ||
    (decision.outcome !== "accepted" && decision.outcome !== "rejected") ||
    !decision.decided_at
  )
    return json({ error: "Decision service is unavailable." }, 503);
  return json({ target_id: decision.target_id, outcome: decision.outcome, decided_at: decision.decided_at }, 200);
};
