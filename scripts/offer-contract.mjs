import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.API_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.ANON_KEY ?? process.env.SUPABASE_KEY;
const serviceRoleKey = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  console.error(
    "API_URL (or SUPABASE_URL), ANON_KEY (or SUPABASE_KEY), and SECRET_KEY (or SERVICE_ROLE_KEY) are required.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const runId = randomUUID();
const createdUserIds = [];

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function expectNoError(error, context) {
  if (error) fail(`${context}: ${error.message}`);
}

async function expectError(request, context) {
  const { error } = await request;
  expect(error, `${context}: expected the request to fail`);
}

async function createContractor(label) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `offer-contract-${label}-${runId}@example.test`,
    password: "Contract-Test-Passw0rd!",
    email_confirm: true,
  });
  expectNoError(error, `create ${label} contractor`);
  createdUserIds.push(data.user.id);

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({
    email: `offer-contract-${label}-${runId}@example.test`,
    password: "Contract-Test-Passw0rd!",
  });
  expectNoError(signInError, `sign in ${label} contractor`);

  return { id: data.user.id, client };
}

async function seedOffer({ client, contractorId, name, pinHash, revoked = false }) {
  const { data: customer, error: customerError } = await client
    .from("customers")
    .insert({ contractor_id: contractorId, name })
    .select("id")
    .single();
  expectNoError(customerError, `seed ${name} customer`);

  const token = randomUUID();
  const { data: offer, error: offerError } = await client
    .from("offers")
    .insert({
      contractor_id: contractorId,
      customer_id: customer.id,
      base_scope: `${name} base scope`,
      base_amount_minor: 10_000,
      currency_code: "PLN",
      base_deadline: "2026-12-31",
      share_token: token,
      pin_hash: pinHash,
      share_link_revoked_at: revoked ? new Date().toISOString() : null,
    })
    .select("id, share_token")
    .single();
  expectNoError(offerError, `seed ${name} offer`);

  return offer;
}

async function seedChange(client, contractorId, offerId, description, priceDeltaMinor) {
  const { data, error } = await client
    .from("offer_changes")
    .insert({
      contractor_id: contractorId,
      offer_id: offerId,
      description,
      price_delta_minor: priceDeltaMinor,
    })
    .select("id")
    .single();
  expectNoError(error, `seed ${description}`);
  return data.id;
}

async function run() {
  const contractorA = await createContractor("a");
  const contractorB = await createContractor("b");
  // bcrypt hash for the test-only PIN 246810; the raw PIN never enters persisted data or output.
  const pinHash = "$2a$10$LZ2utzh50uk4OoTmha5K1.EGkipYasH74EedZyzK9sxZnLJTBO.xq";
  const offerA = await seedOffer({ client: contractorA.client, contractorId: contractorA.id, name: "A", pinHash });
  const offerB = await seedOffer({ client: contractorB.client, contractorId: contractorB.id, name: "B", pinHash });
  const revokedOffer = await seedOffer({
    client: contractorA.client,
    contractorId: contractorA.id,
    name: "revoked",
    pinHash,
    revoked: true,
  });

  const acceptedChange = await seedChange(
    contractorA.client,
    contractorA.id,
    offerA.id,
    "Accepted scope change",
    1_500,
  );
  const rejectedChange = await seedChange(
    contractorB.client,
    contractorB.id,
    offerB.id,
    "Rejected scope change",
    2_000,
  );

  const { data: ownOffers, error: ownOffersError } = await contractorA.client.from("offers").select("id");
  expectNoError(ownOffersError, "contractor A reads own offers");
  expect(
    ownOffers.length === 2 && ownOffers.every((offer) => offer.id !== offerB.id),
    "contractor A must not read contractor B's offer",
  );

  const { data: otherOffer, error: otherOfferError } = await contractorA.client
    .from("offers")
    .select("id")
    .eq("id", offerB.id);
  expectNoError(otherOfferError, "contractor A queries contractor B's offer");
  expect(otherOffer.length === 0, "RLS must hide contractor B's offer from contractor A");

  const anonymous = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const table of ["customers", "offers", "offer_changes", "change_decisions"]) {
    await expectError(anonymous.from(table).select("id"), `anonymous ${table} table access`);
  }

  const { data: sharedOffer, error: sharedOfferError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: offerA.share_token,
  });
  expectNoError(sharedOfferError, "read offer through a valid token");
  expect(sharedOffer?.id === offerA.id, "shared offer RPC must return the token's offer");
  expect(!JSON.stringify(sharedOffer).includes("pin_hash"), "shared offer RPC must not expose pin_hash");

  const { data: revokedOfferResult, error: revokedOfferError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: revokedOffer.share_token,
  });
  expectNoError(revokedOfferError, "read a revoked offer token");
  expect(revokedOfferResult === null, "revoked offer token must not return an offer");
  await expectError(
    anonymous.rpc("decide_shared_offer_change", {
      p_share_token: revokedOffer.share_token,
      p_pin: "246810",
      p_offer_change_id: randomUUID(),
      p_outcome: "accepted",
    }),
    "decision through a revoked offer token",
  );

  await expectError(
    anonymous.rpc("decide_shared_offer_change", {
      p_share_token: offerA.share_token,
      p_pin: "000000",
      p_offer_change_id: acceptedChange,
      p_outcome: "accepted",
    }),
    "decision with an invalid PIN",
  );

  const decisionRequest = {
    p_share_token: offerA.share_token,
    p_pin: "246810",
    p_offer_change_id: acceptedChange,
    p_outcome: "accepted",
  };
  const { data: acceptedDecision, error: acceptedDecisionError } = await anonymous.rpc(
    "decide_shared_offer_change",
    decisionRequest,
  );
  expectNoError(acceptedDecisionError, "accept pending change");
  expect(acceptedDecision.outcome === "accepted", "accepted decision must report accepted");

  const { data: repeatedDecision, error: repeatedDecisionError } = await anonymous.rpc(
    "decide_shared_offer_change",
    decisionRequest,
  );
  expectNoError(repeatedDecisionError, "repeat accepted decision");
  expect(
    repeatedDecision.decided_at === acceptedDecision.decided_at && repeatedDecision.outcome === "accepted",
    "repeating a decision must preserve its original result",
  );

  const { data: acceptedDecisionRows, error: acceptedDecisionRowsError } = await contractorA.client
    .from("change_decisions")
    .select("id")
    .eq("offer_change_id", acceptedChange);
  expectNoError(acceptedDecisionRowsError, "read accepted decision history");
  expect(acceptedDecisionRows.length === 1, "repeated decision must create exactly one history record");

  const { data: rejectedDecision, error: rejectedDecisionError } = await anonymous.rpc("decide_shared_offer_change", {
    p_share_token: offerB.share_token,
    p_pin: "246810",
    p_offer_change_id: rejectedChange,
    p_outcome: "rejected",
    p_rejection_comment: "Customer declined the additional work",
  });
  expectNoError(rejectedDecisionError, "reject pending change");
  expect(rejectedDecision.outcome === "rejected", "rejected decision must report rejected");

  const { data: rejectedSharedOffer, error: rejectedSharedOfferError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: offerB.share_token,
  });
  expectNoError(rejectedSharedOfferError, "read rejected offer");
  expect(
    rejectedSharedOffer.active_amount_minor === 10_000 &&
      rejectedSharedOffer.active_scope.accepted_changes.length === 0,
    "a rejected change must not alter active offer state",
  );
}

try {
  await run();
  console.log("Offer contract checks passed");
} finally {
  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`Failed to remove test user ${userId}: ${error.message}`);
  }
}
