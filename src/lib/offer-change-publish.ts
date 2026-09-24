export function publishOfferChangeImpact(priceDeltaMinor: bigint, deadlineDeltaDays: number) {
  return {
    p_price_delta_minor: priceDeltaMinor.toString(),
    p_deadline_delta_days: deadlineDeltaDays,
  };
}
