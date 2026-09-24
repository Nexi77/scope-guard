import type { APIRoute } from "astro";

import { json, prepareChange } from "@/lib/offer-change-api";
import { publishOfferChangeImpact } from "@/lib/offer-change-publish";

export const POST: APIRoute = async (context) => {
  const prepared = await prepareChange(context);
  if ("response" in prepared) return prepared.response;
  const offerStatus: unknown = prepared.offer.status;
  if (typeof offerStatus !== "string" || !["accepted", "agreed"].includes(offerStatus))
    return json(409, { error: "Accept the current offer before proposing a change." });
  if (prepared.estimate.status !== "ready")
    return json(400, {
      error: "Complete the estimate and confirm all required inputs before recording it.",
      estimate: prepared.estimate,
    });
  if (!prepared.request.targetDeadline || prepared.deadlineDelta === null)
    return json(400, { error: "Confirm a target date before recording this change." });
  const priceDelta = BigInt(prepared.estimate.priceDeltaMinor);
  const publishResult = await prepared.supabase.rpc("publish_offer_change", {
    p_offer_id: prepared.offerId,
    p_expected_scope_revision: prepared.currentRevision,
    p_description: prepared.request.description,
    ...publishOfferChangeImpact(priceDelta, prepared.deadlineDelta),
    p_estimate_snapshot: prepared.estimate.snapshot,
    p_item_effects: prepared.request.effects.map(({ itemId, before, after }) => ({ item_id: itemId, before, after })),
    p_confirmed_impact: true,
  });
  if (publishResult.error) {
    const conflicts = new Set([
      "Offer scope changed; reload before publishing",
      "Item before-state does not match the active scope",
      "Added item identity is already active",
    ]);
    if (conflicts.has(publishResult.error.message))
      return json(409, {
        error: "The offer changed while you were preparing this proposal. Reload and review it again.",
      });
    if (publishResult.error.message === "Offer is unavailable") return json(404, { error: "Offer is unavailable." });
    return json(400, { error: "The confirmed estimate could not be recorded. Review its values and try again." });
  }
  return json(201, { success: true, changeId: publishResult.data, estimate: prepared.estimate });
};
