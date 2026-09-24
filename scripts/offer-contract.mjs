import { createClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";
import { spawn, spawnSync } from "node:child_process";
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
  return error;
}

const pause = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

function itemPayload(item, quantity = Number(item.quantity)) {
  return {
    ...item,
    quantity,
    selling_rate_minor: Number(item.selling_rate_minor),
    labor_hours_per_unit: Number(item.labor_hours_per_unit),
  };
}

function publicItem(item) {
  const visible = { ...item };
  delete visible.labor_hours_per_unit;
  visible.selling_rate_minor = String(visible.selling_rate_minor);
  if (visible.line_amount_minor !== undefined) visible.line_amount_minor = String(visible.line_amount_minor);
  return visible;
}

function effectItem(item) {
  const persisted = { ...item };
  delete persisted.line_amount_minor;
  return persisted;
}

async function verifyCurrentReads(contractor, anonymous, offer, expectedItems, expectedAmount, expectedStatuses) {
  const { data: effectiveItems, error: effectiveError } = await contractor.rpc("get_effective_offer_items", {
    p_offer_id: offer.id,
  });
  expectNoError(effectiveError, "read exact effective items");
  const { data: owned, error: ownedError } = await contractor.rpc("get_contractor_offer_current", {
    p_offer_id: offer.id,
  });
  expectNoError(ownedError, "read current contractor offer");
  const { data: shared, error: sharedError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: offer.share_token,
  });
  expectNoError(sharedError, "read current shared offer");
  expect(
    JSON.stringify(owned) === JSON.stringify(shared),
    "contractor and shared reads must use identical current values",
  );
  expect(
    isDeepStrictEqual(effectiveItems.map(publicItem), expectedItems) &&
      isDeepStrictEqual(shared.active_scope.items, expectedItems),
    "both current reads must contain the exact active public item values",
  );
  expect(
    shared.active_amount_minor === String(expectedAmount),
    "current amount must include only active price deltas as exact minor-unit text",
  );
  expect(
    JSON.stringify(shared.changes.map((change) => change.status)) === JSON.stringify(expectedStatuses),
    "history must retain terminal and open proposals in publication order",
  );
  const exposed = JSON.stringify(shared);
  for (const privateField of [
    "labor_hours_per_unit",
    "estimate_snapshot",
    "item_effects",
    "template",
    "private",
    "pin_hash",
    "share_token",
  ]) {
    expect(!exposed.includes(`"${privateField}"`), `shared projection must omit ${privateField}`);
  }
  return { effectiveItems, shared };
}

async function verifyOfferCommandLocks(offerIds, commands) {
  // Keep the lock window below the local Supabase API request timeout while
  // leaving enough time for every concurrent command to reach the database.
  const lockMarker = 918273645;
  const holdSeconds = 2;
  const createSql = `create or replace function public.test_hold_offer_locks(p_offer_ids uuid[], p_hold_seconds integer)
    returns void language plpgsql as $contract$
    begin
      perform pg_advisory_xact_lock(${lockMarker});
      perform 1 from public.offers where id = any(p_offer_ids) order by id for update;
      perform pg_sleep(p_hold_seconds);
    end;
    $contract$`;
  const createResult = spawnSync("supabase", ["db", "query", "--local", createSql], { encoding: "utf8" });
  expect(createResult.status === 0, `create local lock harness: ${createResult.stderr.trim()}`);
  const ids = offerIds.map((id) => `'${id}'::uuid`).join(",");
  const sql = `select public.test_hold_offer_locks(array[${ids}], ${holdSeconds})`;
  const holder = spawn("supabase", ["db", "query", "--local", sql], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const holderClosed = new Promise((resolve) => holder.once("close", resolve));
  let holderError = "";
  holder.stderr.setEncoding("utf8");
  holder.stderr.on("data", (chunk) => {
    holderError += chunk;
  });
  try {
    let lockAcquired = false;
    for (let attempt = 0; attempt < 8 && !lockAcquired; attempt += 1) {
      const probe = spawnSync(
        "supabase",
        ["db", "query", "--local", "--output", "json", `select not pg_try_advisory_xact_lock(${lockMarker}) as locked`],
        { encoding: "utf8" },
      );
      expect(probe.status === 0, `probe local offer lock: ${probe.stderr.trim()}`);
      lockAcquired = /"locked"\s*:\s*true/i.test(probe.stdout);
      if (!lockAcquired) await pause(100);
    }
    expect(lockAcquired, `local transaction must hold the offer locks: ${holderError.trim()}`);
    const startedAt = Date.now();
    const results = await Promise.all(commands.map((command) => command()));
    const waitedMs = Date.now() - startedAt;
    expect(waitedMs >= 750, "offer commands must wait for the held transaction to release its locks");
    const exitCode = await holderClosed;
    expect(exitCode === 0, `local offer-lock transaction failed: ${holderError.trim()}`);
    return results;
  } finally {
    if (holder.exitCode === null) holder.kill();
    await holderClosed;
    const dropSql = "drop function if exists public.test_hold_offer_locks(uuid[], integer)";
    spawnSync("supabase", ["db", "query", "--local", dropSql], { encoding: "utf8" });
  }
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

async function seedOffer({
  client,
  contractorId,
  name,
  pinHash,
  revoked = false,
  status = "pending",
  customerId = null,
  createdAt = null,
}) {
  let selectedCustomerId = customerId;
  if (!selectedCustomerId) {
    const { data: customer, error: customerError } = await client
      .from("customers")
      .insert({ contractor_id: contractorId, name })
      .select("id")
      .single();
    expectNoError(customerError, `seed ${name} customer`);
    selectedCustomerId = customer.id;
  }

  const { data: created, error: offerError } = await client.rpc("create_offer_with_customer", {
    p_customer_id: selectedCustomerId,
    p_customer_name: null,
    p_confirm_duplicate: false,
    p_base_scope: `${name} base scope`,
    p_currency_code: "PLN",
    p_base_deadline: "2026-12-31",
    p_items: [
      {
        name: `${name} item`,
        quantity: 1,
        unit: "piece",
        specification: `${name} test specification`,
        selling_rate_minor: 10_000,
        labor_hours_per_unit: 1,
      },
    ],
  });
  expectNoError(offerError, `seed ${name} offer`);
  const offerId = created[0].offer_id;
  const { error: updateError } = await admin
    .from("offers")
    .update({
      pin_hash: pinHash,
      status,
      share_link_revoked_at: revoked ? new Date().toISOString() : null,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .eq("id", offerId);
  expectNoError(updateError, `configure ${name} offer fixture`);
  const { data: offer, error: readError } = await client
    .from("offers")
    .select("id, share_token")
    .eq("id", offerId)
    .single();
  expectNoError(readError, `read ${name} offer fixture`);

  return { ...offer, customerId: selectedCustomerId };
}

async function seedChange(client, contractorId, offerId, description, priceDeltaMinor) {
  const { data, error } = await admin
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
  const anonymous = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const contractorA = await createContractor("a");
  const contractorB = await createContractor("b");
  const futureDeadline = new Date();
  futureDeadline.setUTCDate(futureDeadline.getUTCDate() + 7);
  const deadline = futureDeadline.toISOString().slice(0, 10);
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
    status: "rejected",
  });
  const pinOffer = await seedOffer({
    client: contractorA.client,
    contractorId: contractorA.id,
    name: "PIN management",
    pinHash: null,
  });

  const newCustomerName = `New customer ${runId}`;
  const newOfferRequest = {
    p_customer_id: null,
    p_customer_name: newCustomerName,
    p_confirm_duplicate: false,
    p_base_scope: "New customer scope",
    p_currency_code: "PLN",
    p_base_deadline: deadline,
    p_items: [
      {
        name: "Preparation",
        quantity: 1.25,
        unit: "m²",
        specification: "Prepare and install precisely",
        selling_rate_minor: 9_876,
        labor_hours_per_unit: 0.75,
      },
      {
        name: "Half-grosz line A",
        quantity: 0.005,
        unit: "piece",
        specification: "Small allowance",
        selling_rate_minor: 100,
        labor_hours_per_unit: 0.125,
      },
      {
        name: "Half-grosz line B",
        quantity: 0.005,
        unit: "piece",
        specification: "Second small allowance",
        selling_rate_minor: 100,
        labor_hours_per_unit: 0.125,
      },
    ],
  };
  const { data: newOfferRows, error: newOfferError } = await contractorA.client.rpc(
    "create_offer_with_customer",
    newOfferRequest,
  );
  expectNoError(newOfferError, "create an offer with a new customer");
  expect(newOfferRows?.length === 1, "new-customer RPC must return one created offer");
  const newOffer = newOfferRows[0];

  const { data: persistedNewOffer, error: persistedNewOfferError } = await contractorA.client
    .from("offers")
    .select("customer_id, base_scope, base_amount_minor, currency_code, base_deadline, items_revision")
    .eq("id", newOffer.offer_id)
    .single();
  expectNoError(persistedNewOfferError, "read newly created offer");
  expect(
    persistedNewOffer.customer_id === newOffer.customer_id &&
      persistedNewOffer.base_scope === "New customer scope" &&
      persistedNewOffer.base_amount_minor === 12_347 &&
      persistedNewOffer.currency_code === "PLN" &&
      persistedNewOffer.base_deadline === deadline &&
      persistedNewOffer.items_revision === 1,
    "new-customer RPC must persist the item-derived offer with its returned customer",
  );

  const revisionOffer = await seedOffer({
    client: contractorA.client,
    contractorId: contractorA.id,
    name: "revision history",
    pinHash,
  });
  const { data: originalRevisionRows, error: originalRevisionError } = await contractorA.client
    .from("offer_revisions")
    .select("id, revision, status, items")
    .eq("offer_id", revisionOffer.id)
    .order("revision");
  expectNoError(originalRevisionError, "read initial offer revision");
  expect(
    originalRevisionRows.length === 1 &&
      originalRevisionRows[0].revision === 1 &&
      originalRevisionRows[0].items.length === 1,
    "new offers must retain their initial itemized base revision",
  );
  const { data: firstSharedRevision, error: firstSharedRevisionError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: revisionOffer.share_token,
  });
  expectNoError(firstSharedRevisionError, "read initial shared base revision identity");
  expect(
    firstSharedRevision.base_revision.id === originalRevisionRows[0].id &&
      firstSharedRevision.base_revision.revision === 1 &&
      firstSharedRevision.base_revision.status === "pending",
    "shared read must identify the exact pending base revision",
  );
  await expectError(
    anonymous.rpc("current_base_revision_projection", { p_offer_id: revisionOffer.id }),
    "anonymous direct revision projection access",
  );
  const { data: revisionItems, error: revisionItemsError } = await contractorA.client
    .from("offer_items")
    .select("id, name, quantity, unit, specification, selling_rate_minor, labor_hours_per_unit")
    .eq("offer_id", revisionOffer.id)
    .order("position");
  expectNoError(revisionItemsError, "read revision offer items");
  const replacementItems = revisionItems.map((item) => itemPayload(item, 2));
  const { data: secondRevision, error: secondRevisionError } = await contractorA.client.rpc(
    "replace_pending_offer_revision",
    {
      p_offer_id: revisionOffer.id,
      p_expected_revision: 1,
      p_base_scope: "Revised pending scope",
      p_base_deadline: deadline,
      p_items: replacementItems,
    },
  );
  expectNoError(secondRevisionError, "replace a pending base revision");
  expect(secondRevision === 2, "base replacement must increment the revision exactly once");
  await expectError(
    contractorA.client.rpc("replace_pending_offer_revision", {
      p_offer_id: revisionOffer.id,
      p_expected_revision: 1,
      p_base_scope: "Stale replacement",
      p_base_deadline: deadline,
      p_items: replacementItems,
    }),
    "replace a base revision with a stale expected revision",
  );
  const { data: currentRevisionItems, error: currentRevisionItemsError } = await contractorA.client
    .from("offer_items")
    .select("id, name, quantity, unit, specification, selling_rate_minor, labor_hours_per_unit")
    .eq("offer_id", revisionOffer.id)
    .order("position");
  expectNoError(currentRevisionItemsError, "read current revision items");
  const { data: thirdRevision, error: thirdRevisionError } = await contractorA.client.rpc(
    "replace_pending_offer_revision",
    {
      p_offer_id: revisionOffer.id,
      p_expected_revision: 2,
      p_base_scope: "Latest pending scope",
      p_base_deadline: deadline,
      p_items: currentRevisionItems.map((item) => itemPayload(item, 3)),
    },
  );
  expectNoError(thirdRevisionError, "supersede a pending base revision");
  expect(thirdRevision === 3, "second base replacement must advance to revision three");
  const { data: revisionHistory, error: revisionHistoryError } = await contractorA.client
    .from("offer_revisions")
    .select("id, revision, status, superseded_by, decision_outcome, items")
    .eq("offer_id", revisionOffer.id)
    .order("revision");
  expectNoError(revisionHistoryError, "read superseded base revision history");
  expect(
    revisionHistory.length === 3 &&
      revisionHistory[0].status === "superseded" &&
      revisionHistory[0].superseded_by === revisionHistory[1].id &&
      revisionHistory[1].status === "superseded" &&
      revisionHistory[1].superseded_by === revisionHistory[2].id &&
      revisionHistory[2].status === "pending" &&
      revisionHistory[0].items[0].quantity === 1 &&
      revisionHistory[2].items[0].quantity === 3,
    "each base replacement must preserve the prior immutable snapshot and supersession link",
  );
  const { data: latestSharedRevision, error: latestSharedRevisionError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: revisionOffer.share_token,
  });
  expectNoError(latestSharedRevisionError, "read replacement shared base revision identity");
  expect(
    latestSharedRevision.base_revision.id === revisionHistory[2].id &&
      latestSharedRevision.base_revision.revision === 3 &&
      latestSharedRevision.base_revision.status === "pending",
    "shared read must move to the latest pending base revision",
  );
  const staleBaseDecision = await expectError(
    anonymous.rpc("decide_shared_offer_revision", {
      p_share_token: revisionOffer.share_token,
      p_pin: "246810",
      p_offer_revision_id: firstSharedRevision.base_revision.id,
      p_outcome: "accepted",
    }),
    "decide a superseded base revision",
  );
  expect(staleBaseDecision.code === "PT409", "superseded base revision must return a conflict");
  const { data: acceptedRevision, error: acceptedRevisionError } = await anonymous.rpc("decide_shared_offer_revision", {
    p_share_token: revisionOffer.share_token,
    p_pin: "246810",
    p_offer_revision_id: latestSharedRevision.base_revision.id,
    p_outcome: "accepted",
  });
  expectNoError(acceptedRevisionError, "accept the current base revision by PIN");
  expect(acceptedRevision.outcome === "accepted", "PIN decision must bind to the current revision");
  const { data: acceptedSharedRevision, error: acceptedSharedRevisionError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: revisionOffer.share_token,
  });
  expectNoError(acceptedSharedRevisionError, "read accepted shared base revision status");
  expect(
    acceptedSharedRevision.base_revision.id === latestSharedRevision.base_revision.id &&
      acceptedSharedRevision.base_revision.status === "accepted",
    "shared read must reflect the decided base revision status",
  );
  const { data: repeatedRevisionDecision, error: repeatedRevisionDecisionError } = await anonymous.rpc(
    "decide_shared_offer_revision",
    {
      p_share_token: revisionOffer.share_token,
      p_pin: "246810",
      p_offer_revision_id: revisionHistory[2].id,
      p_outcome: "accepted",
    },
  );
  expectNoError(repeatedRevisionDecisionError, "repeat base revision PIN decision");
  expect(
    repeatedRevisionDecision.decided_at === acceptedRevision.decided_at &&
      repeatedRevisionDecision.outcome === "accepted",
    "repeated base revision decision must return the original decision",
  );
  const publishChange = async (
    revision,
    description,
    priceDelta,
    deadlineDelta = null,
    expectedPendingId = null,
    supersessionConfirmed = false,
  ) => {
    const { data, error } = await contractorA.client.rpc("publish_offer_change_checked", {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: revision,
      p_description: description,
      p_price_delta_minor: priceDelta,
      p_deadline_delta_days: deadlineDelta,
      p_estimate_snapshot: { scope_revision: revision, commercial_adjustment_minor: priceDelta },
      p_item_effects: [],
      p_confirmed_impact: true,
      p_expected_pending_change_id: expectedPendingId,
      p_supersession_confirmed: supersessionConfirmed,
    });
    expectNoError(error, description);
    return data;
  };
  const oldProposalId = await publishChange(1, "First proposal", 1_000);
  const unseenPendingError = await expectError(
    contractorA.client.rpc("publish_offer_change_checked", {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: 1,
      p_description: "Unseen second-tab proposal",
      p_price_delta_minor: 1_500,
      p_deadline_delta_days: null,
      p_estimate_snapshot: { scope_revision: 1, commercial_adjustment_minor: 1_500 },
      p_item_effects: [],
      p_confirmed_impact: true,
      p_expected_pending_change_id: null,
      p_supersession_confirmed: false,
    }),
    "publish from a tab that did not see the pending proposal",
  );
  expect(unseenPendingError.code === "PT409", "unseen pending proposal must cause a publication conflict");
  const unconfirmedSupersessionError = await expectError(
    contractorA.client.rpc("publish_offer_change_checked", {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: 1,
      p_description: "Unconfirmed correction",
      p_price_delta_minor: 1_500,
      p_deadline_delta_days: null,
      p_estimate_snapshot: { scope_revision: 1, commercial_adjustment_minor: 1_500 },
      p_item_effects: [],
      p_confirmed_impact: true,
      p_expected_pending_change_id: oldProposalId,
      p_supersession_confirmed: false,
    }),
    "replace a pending proposal without explicit confirmation",
  );
  expect(unconfirmedSupersessionError.code === "P0001", "supersession requires explicit confirmation");
  await expectError(
    contractorA.client.rpc("publish_offer_change", {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: 1,
      p_description: "Bypass pending confirmation",
      p_price_delta_minor: 1_500,
      p_deadline_delta_days: null,
      p_estimate_snapshot: { scope_revision: 1, commercial_adjustment_minor: 1_500 },
      p_item_effects: [],
      p_confirmed_impact: true,
    }),
    "call the revoked publication command directly",
  );
  const currentProposalId = await publishChange(1, "Corrected proposal", 1_500, 2, oldProposalId, true);
  const { data: proposalRows, error: proposalRowsError } = await contractorA.client
    .from("offer_changes")
    .select("id, status, proposal_revision, superseded_by, estimate_snapshot, item_effects")
    .eq("offer_id", revisionOffer.id)
    .order("proposal_revision");
  expectNoError(proposalRowsError, "read immutable proposal revisions");
  expect(
    proposalRows.length === 2 &&
      proposalRows[0].status === "superseded" &&
      proposalRows[0].superseded_by === currentProposalId &&
      proposalRows[1].status === "pending" &&
      proposalRows[1].estimate_snapshot.scope_revision === 1 &&
      Array.isArray(proposalRows[1].item_effects),
    "publishing a correction must retain and link the superseded proposal snapshot",
  );
  const staleProposalDecision = await expectError(
    anonymous.rpc("decide_shared_offer_change", {
      p_share_token: revisionOffer.share_token,
      p_pin: "246810",
      p_offer_change_id: oldProposalId,
      p_outcome: "accepted",
    }),
    "decide a superseded proposal",
  );
  expect(staleProposalDecision.code === "PT409", "superseded proposal must return a conflict");
  const { data: acceptedChangeDecision, error: acceptedChangeDecisionError } = await anonymous.rpc(
    "decide_shared_offer_change",
    {
      p_share_token: revisionOffer.share_token,
      p_pin: "246810",
      p_offer_change_id: currentProposalId,
      p_outcome: "accepted",
    },
  );
  expectNoError(acceptedChangeDecisionError, "accept current proposal by PIN");
  const { data: scopeBeforeRetry, error: scopeBeforeRetryError } = await contractorA.client
    .from("offers")
    .select("active_scope_revision")
    .eq("id", revisionOffer.id)
    .single();
  expectNoError(scopeBeforeRetryError, "read active scope revision before PIN retry");
  const { data: repeatedChangeDecision, error: repeatedChangeDecisionError } = await anonymous.rpc(
    "decide_shared_offer_change",
    {
      p_share_token: revisionOffer.share_token,
      p_pin: "246810",
      p_offer_change_id: currentProposalId,
      p_outcome: "accepted",
    },
  );
  expectNoError(repeatedChangeDecisionError, "repeat current proposal decision");
  expect(
    repeatedChangeDecision.decided_at === acceptedChangeDecision.decided_at &&
      repeatedChangeDecision.outcome === "accepted",
    "accepted proposal retries must return the persisted decision",
  );
  const { data: scopeAfterRetry, error: scopeAfterRetryError } = await contractorA.client
    .from("offers")
    .select("active_scope_revision")
    .eq("id", revisionOffer.id)
    .single();
  expectNoError(scopeAfterRetryError, "read active scope revision after PIN retry");
  expect(
    scopeAfterRetry.active_scope_revision === scopeBeforeRetry.active_scope_revision,
    "repeated PIN decisions must not activate the same effect twice",
  );
  const { data: agreedChangeId, error: agreedChangeError } = await contractorA.client.rpc(
    "publish_offer_change_checked",
    {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: 2,
      p_description: "Confirmed no-impact correction",
      p_price_delta_minor: 0,
      p_deadline_delta_days: 0,
      p_estimate_snapshot: { scope_revision: 2 },
      p_item_effects: [],
      p_confirmed_impact: true,
      p_expected_pending_change_id: null,
      p_supersession_confirmed: false,
    },
  );
  expectNoError(agreedChangeError, "publish a confirmed zero-impact correction");
  const { data: agreedChange, error: agreedChangeReadError } = await contractorA.client
    .from("offer_changes")
    .select("status, price_delta_minor, deadline_delta_days, activation_order")
    .eq("id", agreedChangeId)
    .single();
  expectNoError(agreedChangeReadError, "read confirmed zero-impact correction");
  expect(
    agreedChange.status === "agreed" &&
      agreedChange.price_delta_minor === null &&
      agreedChange.deadline_delta_days === null &&
      agreedChange.activation_order !== null,
    "confirmed zero-impact corrections must be agreed and activated exactly once",
  );
  const { data: activeItemsBeforeEffect, error: activeItemsBeforeEffectError } = await contractorA.client.rpc(
    "get_effective_offer_items",
    { p_offer_id: revisionOffer.id },
  );
  expectNoError(activeItemsBeforeEffectError, "read effective item projection before accepted effect");
  const baselineItem = activeItemsBeforeEffect[0];
  const { data: itemChangeId, error: itemChangeError } = await contractorA.client.rpc("publish_offer_change_checked", {
    p_offer_id: revisionOffer.id,
    p_expected_scope_revision: 3,
    p_description: "Increase agreed item quantity",
    p_price_delta_minor: 10_000,
    p_deadline_delta_days: null,
    p_estimate_snapshot: { scope_revision: 3, commercial_adjustment_minor: 0 },
    p_item_effects: [
      {
        item_id: baselineItem.id,
        before: effectItem(baselineItem),
        after: {
          id: baselineItem.id,
          name: baselineItem.name,
          quantity: 4,
          unit: baselineItem.unit,
          specification: baselineItem.specification,
          selling_rate_minor: baselineItem.selling_rate_minor,
          labor_hours_per_unit: baselineItem.labor_hours_per_unit,
        },
      },
    ],
    p_confirmed_impact: true,
    p_expected_pending_change_id: null,
    p_supersession_confirmed: false,
  });
  expectNoError(itemChangeError, "publish an item quantity effect");
  const { error: itemDecisionError } = await anonymous.rpc("decide_shared_offer_change", {
    p_share_token: revisionOffer.share_token,
    p_pin: "246810",
    p_offer_change_id: itemChangeId,
    p_outcome: "accepted",
  });
  expectNoError(itemDecisionError, "accept item quantity effect by PIN");
  const { data: activeItemsAfterUpdate, error: activeItemsAfterUpdateError } = await contractorA.client.rpc(
    "get_effective_offer_items",
    { p_offer_id: revisionOffer.id },
  );
  expectNoError(activeItemsAfterUpdateError, "read effective item projection after accepted effect");
  expect(
    activeItemsAfterUpdate.length === 1 &&
      activeItemsAfterUpdate[0].id === baselineItem.id &&
      Number(activeItemsAfterUpdate[0].quantity) === 4 &&
      Number(activeItemsAfterUpdate[0].line_amount_minor) === 40_000,
    "accepted item effects must update the effective item while preserving its stable identity",
  );
  const addedItemId = randomUUID();
  const { data: replaceItemChangeId, error: replaceItemChangeError } = await contractorA.client.rpc(
    "publish_offer_change_checked",
    {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: 4,
      p_description: "Replace the affected item",
      p_price_delta_minor: -10_000,
      p_deadline_delta_days: null,
      p_estimate_snapshot: { scope_revision: 4, commercial_adjustment_minor: 0 },
      p_item_effects: [
        { item_id: baselineItem.id, before: effectItem(activeItemsAfterUpdate[0]), after: null },
        {
          item_id: addedItemId,
          before: null,
          after: {
            id: addedItemId,
            name: "Replacement item",
            quantity: 3,
            unit: "piece",
            specification: "Replacement specification",
            selling_rate_minor: 10_000,
            labor_hours_per_unit: 1,
          },
        },
      ],
      p_confirmed_impact: true,
      p_expected_pending_change_id: null,
      p_supersession_confirmed: false,
    },
  );
  expectNoError(replaceItemChangeError, "publish replacement item effects");
  const { error: replaceItemDecisionError } = await anonymous.rpc("decide_shared_offer_change", {
    p_share_token: revisionOffer.share_token,
    p_pin: "246810",
    p_offer_change_id: replaceItemChangeId,
    p_outcome: "accepted",
  });
  expectNoError(replaceItemDecisionError, "accept replacement item effects by PIN");
  const { data: effectiveReplacementItems, error: effectiveReplacementItemsError } = await contractorA.client.rpc(
    "get_effective_offer_items",
    { p_offer_id: revisionOffer.id },
  );
  expectNoError(effectiveReplacementItemsError, "read effective items after replacement");
  expect(
    effectiveReplacementItems.length === 1 &&
      effectiveReplacementItems[0].id === addedItemId &&
      Number(effectiveReplacementItems[0].quantity) === 3,
    "activation order must apply removal and addition effects without editing original items",
  );
  const initialStatuses = ["superseded", "accepted", "agreed", "accepted", "accepted"];
  const replacementPublic = effectiveReplacementItems.map(publicItem);
  const { shared: replacementRead } = await verifyCurrentReads(
    contractorA.client,
    anonymous,
    revisionOffer,
    replacementPublic,
    31_500,
    initialStatuses,
  );
  const expectedActiveDeadline = new Date(`${deadline}T00:00:00Z`);
  expectedActiveDeadline.setUTCDate(expectedActiveDeadline.getUTCDate() + 2);
  expect(
    replacementRead.active_deadline === expectedActiveDeadline.toISOString().slice(0, 10),
    "active deadline must include only the accepted calendar-day adjustment",
  );
  const proposeReplacement = async (description, quantity, priceDelta, expectedPendingId = null) => {
    const { data, error } = await contractorA.client.rpc("publish_offer_change_checked", {
      p_offer_id: revisionOffer.id,
      p_expected_scope_revision: 5,
      p_description: description,
      p_price_delta_minor: priceDelta,
      p_deadline_delta_days: null,
      p_estimate_snapshot: {
        scope_revision: 5,
        commercial_adjustment_minor: 0,
        explanation: "Quantity change at the agreed selling rate",
        private_assessment_notes: "Never expose this note to the customer",
        template_assumptions: { hours: 99 },
      },
      p_item_effects: [
        {
          item_id: addedItemId,
          before: effectItem(effectiveReplacementItems[0]),
          after: { ...effectItem(effectiveReplacementItems[0]), quantity },
        },
      ],
      p_confirmed_impact: true,
      p_expected_pending_change_id: expectedPendingId,
      p_supersession_confirmed: expectedPendingId !== null,
    });
    expectNoError(error, description);
    return data;
  };
  const pendingReadId = await proposeReplacement("Pending quantity four", 4, 10_000);
  await verifyCurrentReads(contractorA.client, anonymous, revisionOffer, replacementPublic, 31_500, [
    ...initialStatuses,
    "pending",
  ]);
  const supersedingReadId = await proposeReplacement("Superseding quantity five", 5, 20_000, pendingReadId);
  const staleOpenViewDecision = await expectError(
    anonymous.rpc("decide_shared_offer_change", {
      p_share_token: revisionOffer.share_token,
      p_pin: "246810",
      p_offer_change_id: pendingReadId,
      p_outcome: "accepted",
    }),
    "stale open view cannot decide the superseded proposal",
  );
  expect(staleOpenViewDecision.code === "PT409", "stale open view must return a conflict");
  await verifyCurrentReads(contractorA.client, anonymous, revisionOffer, replacementPublic, 31_500, [
    ...initialStatuses,
    "superseded",
    "pending",
  ]);
  const rejectRequest = {
    p_share_token: revisionOffer.share_token,
    p_pin: "246810",
    p_offer_change_id: supersedingReadId,
    p_outcome: "rejected",
    p_rejection_comment: "Customer declined this quantity",
  };
  const { data: rejectedReadDecision, error: rejectedReadError } = await anonymous.rpc(
    "decide_shared_offer_change",
    rejectRequest,
  );
  expectNoError(rejectedReadError, "reject current read fixture proposal");
  const { data: repeatedRejectedReadDecision, error: repeatedRejectedReadError } = await anonymous.rpc(
    "decide_shared_offer_change",
    rejectRequest,
  );
  expectNoError(repeatedRejectedReadError, "repeat rejected decision");
  expect(
    repeatedRejectedReadDecision.decided_at === rejectedReadDecision.decided_at,
    "rejected decision retry must preserve its timestamp",
  );
  await verifyCurrentReads(contractorA.client, anonymous, revisionOffer, replacementPublic, 31_500, [
    ...initialStatuses,
    "superseded",
    "rejected",
  ]);
  const agreedAfter = {
    id: addedItemId,
    name: "Replacement item",
    quantity: 3,
    unit: "piece",
    specification: "Clarified agreed specification",
    selling_rate_minor: 10_000,
    labor_hours_per_unit: 1,
  };
  const { data: agreedReadId, error: agreedReadError } = await contractorA.client.rpc("publish_offer_change_checked", {
    p_offer_id: revisionOffer.id,
    p_expected_scope_revision: 5,
    p_description: "Clarify the replacement specification",
    p_price_delta_minor: 0,
    p_deadline_delta_days: 0,
    p_estimate_snapshot: { scope_revision: 5, commercial_adjustment_minor: 0 },
    p_item_effects: [{ item_id: addedItemId, before: effectItem(effectiveReplacementItems[0]), after: agreedAfter }],
    p_confirmed_impact: true,
    p_expected_pending_change_id: null,
    p_supersession_confirmed: false,
  });
  expectNoError(agreedReadError, "publish agreed item correction");
  expect(agreedReadId, "agreed correction must have a stable ID");
  const agreedPublic = [{ ...publicItem(agreedAfter), line_amount_minor: "30000" }];
  const { shared: agreedRead } = await verifyCurrentReads(
    contractorA.client,
    anonymous,
    revisionOffer,
    agreedPublic,
    31_500,
    [...initialStatuses, "superseded", "rejected", "agreed"],
  );
  expect(
    agreedRead.changes.at(-2).decision?.rejection_comment === "Customer declined this quantity" &&
      agreedRead.changes.at(-2).decision?.decided_at === rejectedReadDecision.decided_at,
    "shared history must retain the rejection explanation and timestamp",
  );
  const { data: otherSharedRead, error: otherSharedError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: offerB.share_token,
  });
  expectNoError(otherSharedError, "read another shared offer");
  expect(
    otherSharedRead.id === offerB.id &&
      !JSON.stringify(otherSharedRead).includes(addedItemId) &&
      !JSON.stringify(otherSharedRead).includes("Clarified agreed specification"),
    "a share token must expose only its assigned offer",
  );
  await expectError(
    contractorB.client.rpc("get_contractor_offer_current", { p_offer_id: revisionOffer.id }),
    "foreign contractor current read",
  );
  await expectError(
    anonymous.rpc("get_contractor_offer_current", { p_offer_id: revisionOffer.id }),
    "anonymous contractor read",
  );
  await expectError(
    anonymous.rpc("current_offer_projection", { p_offer_id: revisionOffer.id }),
    "anonymous internal projection access",
  );
  await expectError(
    anonymous.rpc("project_effective_offer_items", { p_offer_id: revisionOffer.id }),
    "anonymous internal item projection access",
  );

  const { data: newOfferItems, error: newOfferItemsError } = await contractorA.client
    .from("offer_items")
    .select("id, position, line_amount_minor, labor_hours_per_unit")
    .eq("offer_id", newOffer.offer_id)
    .order("position");
  expectNoError(newOfferItemsError, "read newly created offer items");
  expect(
    newOfferItems.length === 3 &&
      newOfferItems[0].line_amount_minor === 12_345 &&
      newOfferItems[1].line_amount_minor === 1 &&
      newOfferItems[2].line_amount_minor === 1,
    "line amounts must round half-grosz upward before summing the offer total",
  );

  const { data: foreignItems, error: foreignItemsError } = await contractorA.client
    .from("offer_items")
    .select("id")
    .eq("offer_id", offerB.id);
  expectNoError(foreignItemsError, "query another contractor's offer items");
  expect(foreignItems.length === 0, "item RLS must hide another contractor's records");
  const { data: contractorBItems, error: contractorBItemsError } = await contractorB.client
    .from("offer_items")
    .select("id")
    .eq("offer_id", offerB.id);
  expectNoError(contractorBItemsError, "read owned contractor B item IDs");

  const editedItems = [
    { ...newOfferRequest.p_items[0], id: newOfferItems[0].id, quantity: 2 },
    {
      name: "New edit item",
      quantity: 1,
      unit: "m",
      specification: "Added before change history",
      selling_rate_minor: 500,
      labor_hours_per_unit: 0.25,
    },
  ];
  const { data: editedRevision, error: editError } = await contractorA.client.rpc("edit_offer_items", {
    p_offer_id: newOffer.offer_id,
    p_expected_revision: 1,
    p_items: editedItems,
  });
  expectNoError(editError, "edit an owned pending offer without history");
  expect(editedRevision === 2, "successful item edit must advance the revision");
  const { data: editedOffer, error: editedOfferError } = await contractorA.client
    .from("offers")
    .select("base_amount_minor, items_revision")
    .eq("id", newOffer.offer_id)
    .single();
  expectNoError(editedOfferError, "read edited offer total and revision");
  expect(
    editedOffer.base_amount_minor === 20_252 && editedOffer.items_revision === 2,
    "edit must derive the new total from rounded lines and advance its revision",
  );
  const { data: itemEditRevisions, error: itemEditRevisionsError } = await contractorA.client
    .from("offer_revisions")
    .select("id, revision, status, superseded_by, base_amount_minor, items")
    .eq("offer_id", newOffer.offer_id)
    .order("revision");
  expectNoError(itemEditRevisionsError, "read revisions after pending item edit");
  expect(
    itemEditRevisions.length === 2 &&
      itemEditRevisions[0].revision === 1 &&
      itemEditRevisions[0].status === "superseded" &&
      itemEditRevisions[0].superseded_by === itemEditRevisions[1].id &&
      itemEditRevisions[0].base_amount_minor === 12_347 &&
      itemEditRevisions[0].items[0].quantity === 1.25 &&
      itemEditRevisions[1].revision === 2 &&
      itemEditRevisions[1].status === "pending" &&
      itemEditRevisions[1].base_amount_minor === 20_252 &&
      itemEditRevisions[1].items[0].quantity === 2,
    "pending item edits must retain the original snapshot and create a superseding revision",
  );
  const { data: retainedItem, error: retainedItemError } = await contractorA.client
    .from("offer_items")
    .select("id")
    .eq("offer_id", newOffer.offer_id)
    .eq("name", "Preparation")
    .single();
  expectNoError(retainedItemError, "read retained item identity");
  expect(retainedItem.id === newOfferItems[0].id, "editing must preserve retained item IDs");

  await expectError(
    contractorA.client.rpc("edit_offer_items", {
      p_offer_id: newOffer.offer_id,
      p_expected_revision: 1,
      p_items: editedItems,
    }),
    "edit with a stale revision",
  );
  await expectError(
    contractorB.client.rpc("edit_offer_items", {
      p_offer_id: newOffer.offer_id,
      p_expected_revision: 2,
      p_items: editedItems,
    }),
    "edit another contractor's offer",
  );
  await expectError(
    contractorA.client.rpc("edit_offer_items", {
      p_offer_id: newOffer.offer_id,
      p_expected_revision: 2,
      p_items: [{ ...editedItems[0], id: contractorBItems[0].id }],
    }),
    "retain an item ID from another offer",
  );

  const { data: rejectedItems, error: rejectedItemsError } = await contractorA.client
    .from("offer_items")
    .select("id, name")
    .eq("offer_id", revokedOffer.id)
    .order("position");
  expectNoError(rejectedItemsError, "read items from a non-pending offer without change rows");
  await expectError(
    contractorA.client.rpc("edit_offer_items", {
      p_offer_id: revokedOffer.id,
      p_expected_revision: 1,
      p_items: [{ ...newOfferRequest.p_items[0], id: rejectedItems[0].id }],
    }),
    "edit an offer that is no longer pending",
  );

  await expectError(
    contractorA.client.rpc("create_offer_with_customer", {
      ...newOfferRequest,
      p_customer_name: `No items customer ${runId}`,
      p_items: [],
    }),
    "create an offer without items",
  );
  const { data: invalidItemsCustomers, error: invalidItemsCustomersError } = await contractorA.client
    .from("customers")
    .select("id")
    .eq("name", `No items customer ${runId}`);
  expectNoError(invalidItemsCustomersError, "verify invalid item rollback");
  expect(invalidItemsCustomers.length === 0, "invalid items must roll back the new customer");

  for (const [label, item] of [
    ["quantity precision", { ...newOfferRequest.p_items[0], quantity: 0.0001 }],
    ["fractional selling rate", { ...newOfferRequest.p_items[0], selling_rate_minor: 100.5 }],
    ["unsupported unit", { ...newOfferRequest.p_items[0], unit: "item" }],
  ]) {
    const invalidCustomerName = `Invalid ${label} customer ${runId}`;
    await expectError(
      contractorA.client.rpc("create_offer_with_customer", {
        ...newOfferRequest,
        p_customer_name: invalidCustomerName,
        p_items: [item],
      }),
      `create offer with invalid ${label}`,
    );
    const { data: invalidCustomerRows, error: invalidCustomerError } = await contractorA.client
      .from("customers")
      .select("id")
      .eq("name", invalidCustomerName);
    expectNoError(invalidCustomerError, `verify ${label} rollback`);
    expect(invalidCustomerRows.length === 0, `invalid ${label} must roll back the customer`);
  }

  const { data: reusedOfferRows, error: reusedOfferError } = await contractorA.client.rpc(
    "create_offer_with_customer",
    {
      ...newOfferRequest,
      p_customer_id: offerA.customerId,
      p_customer_name: null,
      p_base_scope: "Existing customer scope",
    },
  );
  expectNoError(reusedOfferError, "create an offer for an owned customer");
  expect(
    reusedOfferRows?.length === 1 && reusedOfferRows[0].customer_id === offerA.customerId,
    "existing-customer RPC must reuse the selected owned customer",
  );

  const { count: customerCountBeforeForeignRequest, error: customerCountBeforeForeignRequestError } =
    await contractorA.client.from("customers").select("id", { count: "exact", head: true });
  expectNoError(customerCountBeforeForeignRequestError, "count customers before foreign request");
  await expectError(
    contractorA.client.rpc("create_offer_with_customer", {
      ...newOfferRequest,
      p_customer_id: offerB.customerId,
      p_customer_name: null,
    }),
    "create an offer for another contractor's customer",
  );
  const { count: customerCountAfterForeignRequest, error: customerCountAfterForeignRequestError } =
    await contractorA.client.from("customers").select("id", { count: "exact", head: true });
  expectNoError(customerCountAfterForeignRequestError, "count customers after foreign request");
  expect(
    customerCountAfterForeignRequest === customerCountBeforeForeignRequest,
    "foreign customer rejection must not create a customer",
  );

  await expectError(
    contractorA.client.rpc("create_offer_with_customer", {
      ...newOfferRequest,
      p_customer_name: newCustomerName.toUpperCase(),
    }),
    "create a case-insensitive duplicate customer without confirmation",
  );
  const { data: duplicateOfferRows, error: duplicateOfferError } = await contractorA.client.rpc(
    "create_offer_with_customer",
    {
      ...newOfferRequest,
      p_customer_name: newCustomerName.toUpperCase(),
      p_confirm_duplicate: true,
    },
  );
  expectNoError(duplicateOfferError, "create a confirmed duplicate customer");
  expect(
    duplicateOfferRows?.length === 1 && duplicateOfferRows[0].customer_id !== newOffer.customer_id,
    "explicit duplicate confirmation must create a distinct same-named customer",
  );

  const rollbackCustomerName = `Rollback customer ${runId}`;
  await expectError(
    contractorA.client.rpc("create_offer_with_customer", {
      ...newOfferRequest,
      p_customer_name: rollbackCustomerName,
      p_base_scope: " ",
    }),
    "create an offer with invalid scope",
  );
  const { data: rollbackCustomers, error: rollbackCustomersError } = await contractorA.client
    .from("customers")
    .select("id")
    .eq("name", rollbackCustomerName);
  expectNoError(rollbackCustomersError, "read customers after failed creation");
  expect(rollbackCustomers.length === 0, "failed creation must not leave a new customer behind");

  const acceptedChange = await seedChange(
    contractorA.client,
    contractorA.id,
    offerA.id,
    "Accepted scope change",
    1_500,
  );
  const protectedPendingChange = await seedChange(
    contractorA.client,
    contractorA.id,
    revisionOffer.id,
    "Protected pending change",
    2_500,
  );
  const rejectedChange = await seedChange(
    contractorB.client,
    contractorB.id,
    offerB.id,
    "Rejected scope change",
    2_000,
  );

  for (const [client, offer, label] of [
    [contractorA.client, offerA, "accepted-change offer"],
    [contractorB.client, offerB, "rejected-change offer"],
  ]) {
    const { data: beforeLock, error: beforeLockError } = await client
      .from("offers")
      .select("base_amount_minor, items_revision")
      .eq("id", offer.id)
      .single();
    expectNoError(beforeLockError, `read ${label} before edit lock`);
    const { data: itemsBeforeLock, error: itemsBeforeLockError } = await client
      .from("offer_items")
      .select("id, name")
      .eq("offer_id", offer.id)
      .order("position");
    expectNoError(itemsBeforeLockError, `read ${label} items before edit lock`);
    await expectError(
      client.rpc("edit_offer_items", {
        p_offer_id: offer.id,
        p_expected_revision: beforeLock.items_revision,
        p_items: [{ ...newOfferRequest.p_items[0], id: itemsBeforeLock[0].id }],
      }),
      `edit ${label} after a change row exists`,
    );
    const { data: afterLock, error: afterLockError } = await client
      .from("offers")
      .select("base_amount_minor, items_revision")
      .eq("id", offer.id)
      .single();
    expectNoError(afterLockError, `read ${label} after rejected edit`);
    const { data: itemsAfterLock, error: itemsAfterLockError } = await client
      .from("offer_items")
      .select("id, name")
      .eq("offer_id", offer.id)
      .order("position");
    expectNoError(itemsAfterLockError, `read ${label} items after rejected edit`);
    expect(
      afterLock.base_amount_minor === beforeLock.base_amount_minor &&
        afterLock.items_revision === beforeLock.items_revision &&
        JSON.stringify(itemsAfterLock) === JSON.stringify(itemsBeforeLock),
      `${label} edit rejection must preserve item rows, total, and revision`,
    );
  }

  const { data: ownOffers, error: ownOffersError } = await contractorA.client.from("offers").select("id");
  expectNoError(ownOffersError, "contractor A reads own offers");
  expect(
    ownOffers.length === 7 && ownOffers.every((offer) => offer.id !== offerB.id),
    "contractor A must not read contractor B's offer",
  );

  const { data: otherOffer, error: otherOfferError } = await contractorA.client
    .from("offers")
    .select("id")
    .eq("id", offerB.id);
  expectNoError(otherOfferError, "contractor A queries contractor B's offer");
  expect(otherOffer.length === 0, "RLS must hide contractor B's offer from contractor A");
  await expectError(
    contractorA.client.from("offers").update({ base_amount_minor: 1 }).eq("id", offerA.id),
    "directly change an offer total outside the item RPC",
  );

  await expectError(
    anonymous.rpc("create_offer_with_customer", {
      ...newOfferRequest,
      p_customer_name: `Anonymous customer ${runId}`,
    }),
    "anonymous offer creation RPC access",
  );
  await expectError(
    anonymous.rpc("set_offer_pin", { p_offer_id: pinOffer.id, p_pin: "135790" }),
    "anonymous offer PIN update access",
  );
  for (const table of ["customers", "offers", "offer_items", "offer_changes", "change_decisions"]) {
    await expectError(anonymous.from(table).select("id"), `anonymous ${table} table access`);
  }

  const { data: sharedOffer, error: sharedOfferError } = await anonymous.rpc("get_shared_offer", {
    p_share_token: offerA.share_token,
  });
  expectNoError(sharedOfferError, "read offer through a valid token");
  expect(sharedOffer?.id === offerA.id, "shared offer RPC must return the token's offer");
  expect(!JSON.stringify(sharedOffer).includes("pin_hash"), "shared offer RPC must not expose pin_hash");
  expect(
    sharedOffer.active_scope.items.length === 1 &&
      !JSON.stringify(sharedOffer.active_scope.items).includes("labor_hours_per_unit") &&
      !JSON.stringify(sharedOffer.active_scope.items).includes("contractor_id"),
    "shared offer projection must include public item pricing without private effort or ownership fields",
  );

  await expectError(
    contractorA.client.rpc("set_offer_pin", { p_offer_id: pinOffer.id, p_pin: null }),
    "set an offer PIN with a missing value",
  );
  for (const invalidPin of ["12345", "1234567", "12a456", " 12345"]) {
    await expectError(
      contractorA.client.rpc("set_offer_pin", { p_offer_id: pinOffer.id, p_pin: invalidPin }),
      "set an offer PIN with invalid format",
    );
  }
  await expectError(
    contractorA.client.rpc("set_offer_pin", { p_offer_id: offerB.id, p_pin: "135790" }),
    "set a PIN on another contractor's offer",
  );

  const { data: initialPinResult, error: initialPinError } = await contractorA.client.rpc("set_offer_pin", {
    p_offer_id: pinOffer.id,
    p_pin: "135790",
  });
  expectNoError(initialPinError, "set an initial offer PIN");
  expect(initialPinResult === true, "PIN command must return only its minimal success result");
  expect(
    !JSON.stringify(initialPinResult).includes("135790") && !JSON.stringify(initialPinResult).includes("$2"),
    "PIN command result must not contain plaintext or hash material",
  );
  const { data: initiallyConfiguredOffer, error: initiallyConfiguredOfferError } = await contractorA.client
    .from("offers")
    .select("pin_hash, share_token")
    .eq("id", pinOffer.id)
    .single();
  expectNoError(initiallyConfiguredOfferError, "read initially configured offer contract fields");
  expect(
    initiallyConfiguredOffer.pin_hash !== null && initiallyConfiguredOffer.pin_hash !== "135790",
    "PIN command must persist only a hash",
  );
  expect(
    initiallyConfiguredOffer.share_token === pinOffer.share_token,
    "initial PIN set must leave the share token unchanged",
  );

  async function verifyPinWithDecision(pin, context, shouldSucceed) {
    const changeId = await seedChange(
      contractorA.client,
      contractorA.id,
      pinOffer.id,
      `${context} verification change`,
      100,
    );
    const request = anonymous.rpc("decide_shared_offer_change", {
      p_share_token: pinOffer.share_token,
      p_pin: pin,
      p_offer_change_id: changeId,
      p_outcome: "accepted",
    });
    if (!shouldSucceed) {
      await expectError(request, context);
      const { error: cleanupError } = await admin.from("offer_changes").delete().eq("id", changeId);
      expectNoError(cleanupError, `${context}: remove failed verification change`);
      return;
    }
    const { data, error } = await request;
    expectNoError(error, context);
    expect(data.outcome === "accepted", `${context}: valid PIN must authorize a decision`);
  }

  await verifyPinWithDecision("135790", "initial PIN decision verification", true);
  await expectError(
    contractorA.client.rpc("set_offer_pin", { p_offer_id: pinOffer.id, p_pin: "135790" }),
    "reset an offer PIN to its current value",
  );
  const { data: resetPinResult, error: resetPinError } = await contractorA.client.rpc("set_offer_pin", {
    p_offer_id: pinOffer.id,
    p_pin: "864209",
  });
  expectNoError(resetPinError, "reset an offer PIN");
  expect(resetPinResult === true, "PIN reset must return only its minimal success result");
  const { data: resetOffer, error: resetOfferError } = await contractorA.client
    .from("offers")
    .select("pin_hash, share_token")
    .eq("id", pinOffer.id)
    .single();
  expectNoError(resetOfferError, "read reset offer contract fields");
  expect(resetOffer.pin_hash !== initiallyConfiguredOffer.pin_hash, "PIN reset must replace the stored hash");
  expect(resetOffer.share_token === pinOffer.share_token, "PIN reset must leave the share token unchanged");
  await verifyPinWithDecision("135790", "old PIN after reset", false);
  await verifyPinWithDecision("864209", "new PIN after reset", true);

  await expectError(
    contractorA.client.from("offer_changes").update({ status: "accepted" }).eq("id", acceptedChange),
    "contractor directly accepts a pending change",
  );
  await expectError(
    contractorA.client
      .from("offer_changes")
      .update({ description: "Tampered proposal" })
      .eq("id", protectedPendingChange),
    "contractor directly mutates a pending proposal",
  );
  await expectError(
    contractorA.client.from("offer_changes").delete().eq("id", protectedPendingChange),
    "contractor directly deletes a pending proposal",
  );
  await expectError(
    contractorB.client
      .from("offer_changes")
      .update({ description: "Foreign mutation" })
      .eq("id", protectedPendingChange),
    "foreign contractor attempts proposal mutation",
  );
  await expectError(
    contractorB.client.from("offer_changes").delete().eq("id", protectedPendingChange),
    "foreign contractor attempts proposal deletion",
  );
  const { data: protectedPendingRows, error: protectedPendingError } = await contractorA.client
    .from("offer_changes")
    .select("description, status")
    .eq("id", protectedPendingChange)
    .single();
  expectNoError(protectedPendingError, "verify proposal survived foreign mutation attempts");
  expect(
    protectedPendingRows.description === "Protected pending change" && protectedPendingRows.status === "pending",
    "foreign contractor cannot mutate or delete another contractor's proposal",
  );
  await expectError(
    contractorA.client
      .from("offer_changes")
      .update({ description: "Tampered agreed correction" })
      .eq("id", agreedChangeId),
    "contractor directly mutates an agreed correction",
  );
  await expectError(
    contractorA.client.from("offer_changes").delete().eq("id", agreedChangeId),
    "contractor directly deletes an agreed correction",
  );
  await expectError(
    contractorA.client.from("change_decisions").insert({
      contractor_id: contractorA.id,
      offer_change_id: acceptedChange,
      outcome: "accepted",
    }),
    "contractor directly creates a customer decision",
  );

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
  await expectError(
    contractorA.client.from("offer_changes").delete().eq("id", acceptedChange),
    "contractor directly deletes an accepted change",
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
    rejectedSharedOffer.active_amount_minor === "10000" &&
      rejectedSharedOffer.active_scope.accepted_changes.length === 0,
    "a rejected change must not alter active offer state",
  );

  const { data: pageCustomer, error: pageCustomerError } = await contractorA.client
    .from("customers")
    .insert({ contractor_id: contractorA.id, name: "Pagination customer" })
    .select("id")
    .single();
  expectNoError(pageCustomerError, "seed pagination customer");
  const paginationOffers = [];
  const tiedCreatedAt = "2026-09-01T12:00:00.000Z";
  for (const name of ["page one", "page two", "page three", "page four"]) {
    paginationOffers.push(
      await seedOffer({
        client: contractorA.client,
        contractorId: contractorA.id,
        name,
        pinHash,
        customerId: pageCustomer.id,
        createdAt: tiedCreatedAt,
      }),
    );
  }
  const tiedOfferIds = paginationOffers.map(({ id }) => id).sort();

  const { data: browseFirstPage, error: browseFirstPageError } = await contractorA.client.rpc("list_customer_offers", {
    p_customer_id: pageCustomer.id,
    p_limit: 2,
  });
  expectNoError(browseFirstPageError, "read first owned offer page");
  expect(browseFirstPage.length === 2, "offer page must not exceed its requested limit");
  expect(
    browseFirstPage[0].offer_id === tiedOfferIds.at(-1) && browseFirstPage[1].offer_id === tiedOfferIds.at(-2),
    "equal-timestamp offers must use descending ID tie ordering",
  );
  const lastFirstPageOffer = browseFirstPage.at(-1);
  const { data: browseSecondPage, error: browseSecondPageError } = await contractorA.client.rpc(
    "list_customer_offers",
    {
      p_customer_id: pageCustomer.id,
      p_limit: 2,
      p_before_created_at: lastFirstPageOffer.created_at,
      p_before_id: lastFirstPageOffer.offer_id,
    },
  );
  expectNoError(browseSecondPageError, "continue offer pagination");
  const pagedIds = [...browseFirstPage, ...browseSecondPage].map((row) => row.offer_id);
  expect(new Set(pagedIds).size === pagedIds.length, "offer page continuation must not repeat rows");
  expect(browseSecondPage.length === 2, "continuation must reach the next tied-timestamp offers");
  const { data: allBrowseRows, error: allBrowseRowsError } = await contractorA.client.rpc("list_customer_offers", {
    p_customer_id: offerA.customerId,
    p_limit: 10,
  });
  expectNoError(allBrowseRowsError, "read full bounded fixture page");
  expect(
    allBrowseRows.find((row) => row.offer_id === offerA.id)?.current_amount_minor === "11500",
    "current amount must include accepted changes and remain exact minor-unit text",
  );
  const pendingChange = await seedChange(contractorA.client, contractorA.id, offerA.id, "Pending browse change", 3_000);
  expect(pendingChange, "pending change fixture must be created");
  const { error: rejectedBrowseChangeError } = await anonymous.rpc("decide_shared_offer_change", {
    p_share_token: offerA.share_token,
    p_pin: "246810",
    p_offer_change_id: pendingChange,
    p_outcome: "rejected",
    p_rejection_comment: "Rejected browse change",
  });
  expectNoError(rejectedBrowseChangeError, "reject browse change through the shared decision flow");
  const { data: afterPendingChange, error: afterPendingChangeError } = await contractorA.client.rpc(
    "list_customer_offers",
    { p_customer_id: offerA.customerId, p_limit: 10 },
  );
  expectNoError(afterPendingChangeError, "read totals with pending change");
  expect(
    afterPendingChange.find((row) => row.offer_id === offerA.id)?.current_amount_minor === "11500",
    "pending changes must not affect current amount",
  );
  const { data: foreignCustomerPage, error: foreignCustomerPageError } = await contractorA.client.rpc(
    "list_customer_offers",
    { p_customer_id: offerB.customerId, p_limit: 10 },
  );
  expectNoError(foreignCustomerPageError, "read another contractor's customer page");
  expect(foreignCustomerPage.length === 0, "foreign customer IDs must return no offers");
  const { data: unknownCustomerPage, error: unknownCustomerPageError } = await contractorA.client.rpc(
    "list_customer_offers",
    { p_customer_id: randomUUID(), p_limit: 10 },
  );
  expectNoError(unknownCustomerPageError, "read unknown customer page");
  expect(unknownCustomerPage.length === 0, "unknown customer IDs must return no offers");
  await expectError(
    anonymous.rpc("list_customer_offers", { p_customer_id: offerA.customerId, p_limit: 10 }),
    "anonymous offer-list RPC access",
  );
  expect(
    !JSON.stringify(browseFirstPage).match(/share_token|pin_hash|pin/i),
    "offer-list RPC must not expose share tokens or PIN material",
  );

  const lockEditOffer = await seedOffer({
    client: contractorA.client,
    contractorId: contractorA.id,
    name: "lock original edit",
    pinHash,
  });
  const lockDecisionOffer = await seedOffer({
    client: contractorA.client,
    contractorId: contractorA.id,
    name: "lock customer decision",
    pinHash,
  });
  const lockDecisionChangeId = await seedChange(
    contractorA.client,
    contractorA.id,
    lockDecisionOffer.id,
    "Change waiting on offer lock",
    300,
  );
  const { data: lockEditState, error: lockEditStateError } = await contractorA.client
    .from("offers")
    .select("items_revision")
    .eq("id", lockEditOffer.id)
    .single();
  expectNoError(lockEditStateError, "read original edit lock fixture");
  const { data: lockEditItems, error: lockEditItemsError } = await contractorA.client
    .from("offer_items")
    .select("id, name, quantity, unit, specification, selling_rate_minor, labor_hours_per_unit")
    .eq("offer_id", lockEditOffer.id)
    .order("position");
  expectNoError(lockEditItemsError, "read original edit lock fixture items");
  const { data: lockPublishState, error: lockPublishStateError } = await contractorA.client
    .from("offers")
    .select("active_scope_revision")
    .eq("id", revisionOffer.id)
    .single();
  expectNoError(lockPublishStateError, "read publication lock fixture");
  const lockedCommands = await verifyOfferCommandLocks(
    [lockEditOffer.id, revisionOffer.id, lockDecisionOffer.id],
    [
      async () => {
        const { error } = await contractorA.client.rpc("edit_offer_items", {
          p_offer_id: lockEditOffer.id,
          p_expected_revision: lockEditState.items_revision,
          p_items: lockEditItems.map((item) => itemPayload(item, 2)),
        });
        expectNoError(error, "edit original items after offer lock release");
        return "edit";
      },
      async () => {
        const { error } = await contractorA.client.rpc("publish_offer_change_checked", {
          p_offer_id: revisionOffer.id,
          p_expected_scope_revision: lockPublishState.active_scope_revision,
          p_description: "Publication waiting on offer lock",
          p_price_delta_minor: 2_500,
          p_deadline_delta_days: null,
          p_estimate_snapshot: {
            scope_revision: lockPublishState.active_scope_revision,
            commercial_adjustment_minor: 2_500,
          },
          p_item_effects: [],
          p_confirmed_impact: true,
          p_expected_pending_change_id: protectedPendingChange,
          p_supersession_confirmed: true,
        });
        expectNoError(error, "publish proposal after offer lock release");
        return "publication";
      },
      async () => {
        const { error } = await anonymous.rpc("decide_shared_offer_change", {
          p_share_token: lockDecisionOffer.share_token,
          p_pin: "246810",
          p_offer_change_id: lockDecisionChangeId,
          p_outcome: "accepted",
        });
        expectNoError(error, "decide proposal after offer lock release");
        return "decision";
      },
    ],
  );
  expect(
    lockedCommands.join(",") === "edit,publication,decision",
    "original edits, proposal publication, and customer decisions must serialize behind the offer lock",
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
