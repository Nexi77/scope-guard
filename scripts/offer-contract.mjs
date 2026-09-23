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
    ownOffers.length === 6 && ownOffers.every((offer) => offer.id !== offerB.id),
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

  const anonymous = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
      const { error: cleanupError } = await contractorA.client.from("offer_changes").delete().eq("id", changeId);
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
    rejectedSharedOffer.active_amount_minor === 10_000 &&
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
