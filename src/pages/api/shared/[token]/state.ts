import type { APIRoute } from "astro";

import { UUID_PATTERN } from "@/lib/offer-change-request";
import { getSharedDecisionTarget, loadSharedOfferView, type SharedOfferLoadResult } from "@/lib/shared-offer-view";

function json(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export const GET: APIRoute = async (context) => {
  const token = context.params.token ?? "";
  if (!UUID_PATTERN.test(token)) return json({ error: "Offer unavailable." }, 404);
  let result: SharedOfferLoadResult;
  try {
    result = await loadSharedOfferView(token);
  } catch {
    return json({ error: "Offer state is unavailable." }, 503);
  }
  if (result.kind !== "available") return json({ error: "Offer unavailable." }, 404);
  const { view } = result;
  const target = getSharedDecisionTarget(view);
  return json(
    {
      base_revision_id: view.baseRevision.id,
      base_revision: view.baseRevision.revision,
      active_scope_revision: view.activeScopeRevision,
      target_kind: target?.kind ?? null,
      target_id: target?.id ?? null,
    },
    200,
  );
};
