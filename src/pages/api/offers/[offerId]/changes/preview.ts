import type { APIRoute } from "astro";

import { json, prepareChange } from "@/lib/offer-change-api";

export const POST: APIRoute = async (context) => {
  const prepared = await prepareChange(context);
  if ("response" in prepared) return prepared.response;
  const offerStatus: unknown = prepared.offer.status;
  if (typeof offerStatus !== "string" || !["accepted", "agreed"].includes(offerStatus))
    return json(409, { error: "Accept the current offer before proposing a change." });
  return json(200, {
    estimate: prepared.estimate,
    activeDeadline: prepared.activeDeadline,
    deadlineDeltaDays: prepared.deadlineDelta,
    currentScopeRevision: prepared.currentRevision,
  });
};
