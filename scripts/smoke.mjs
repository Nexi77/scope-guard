// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

import { URL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const supabaseUrl = process.env.API_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.ANON_KEY ?? process.env.SUPABASE_KEY;
const supabaseServiceKey = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error("Smoke test requires the local Supabase API_URL, ANON_KEY, and SECRET_KEY.");
}
const sharedClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `smoke-${Date.now()}@example.com`;
const foreignEmail = `smoke-foreign-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();
const foreignJar = new Map();

function cookieHeader(session) {
  return [...session.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response, session) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) session.delete(name.trim());
    else session.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form, headers = {}, body } = {}, session = jar) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(session),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...headers,
    },
    body: form ? new URLSearchParams(form).toString() : body,
  });
  storeCookies(response, session);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    headers: response.headers,
    body: await response.text(),
  };
}

async function requestWithTransientProxyRetry(path, options, session) {
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    result = await request(path, options, session);
    const transientProxyFailure =
      result.status === 500 &&
      result.headers.get("content-type")?.startsWith("text/plain") &&
      /Network connection lost/i.test(result.body);
    if (!transientProxyFailure) return result;
    // Retry only the explicitly safe validation and one-time PIN requests.
    // If a PIN response was dropped, the next call replaces the undisclosed
    // value and returns the current one.
    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }
  return result;
}

function unwrapAstroProp(value) {
  if (Array.isArray(value)) {
    if (value[0] === 0 || value[0] === 1) return unwrapAstroProp(value[1]);
    return value.map(unwrapAstroProp);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, unwrapAstroProp(item)]));
  }
  return value;
}

function customerIdFromPage(body, name) {
  const markedCustomer = body.match(/data-customer-id="([0-9a-f-]{36})"/i);
  if (markedCustomer) return markedCustomer[1];
  const islands = body.matchAll(/<astro-island\b[^>]*\bprops=(?:"([^"]*)"|'([^']*)')/g);
  for (const [, doubleQuoted, singleQuoted] of islands) {
    const encodedProps = doubleQuoted ?? singleQuoted;
    const candidates = [encodedProps.replaceAll("&quot;", '"').replaceAll("&amp;", "&")];
    try {
      candidates.push(decodeURIComponent(encodedProps));
    } catch {
      // The attribute may not be URI encoded.
    }
    try {
      const decoded = globalThis.atob(encodedProps.replaceAll("-", "+").replaceAll("_", "/"));
      candidates.push(
        decodeURIComponent([...decoded].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")),
      );
    } catch {
      // The attribute may not be base64 encoded.
    }
    for (const candidate of candidates) {
      try {
        const props = unwrapAstroProp(JSON.parse(candidate));
        const customer = props.customers?.find((item) => item.name === name);
        if (customer?.id) return customer.id;
      } catch {
        // Other Astro islands may use a different props shape; keep looking.
      }
    }
  }
  return null;
}

function customerPagerFromPage(body) {
  return (
    body.match(/<nav\b(?=[^>]*aria-label="Customer pages (?:before|after) list")[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? ""
  );
}

function offerIdFromPage(body) {
  const markedOffer = body.match(/data-offer-id="([0-9a-f-]{36})"/i);
  if (markedOffer) return markedOffer[1];
  const islands = body.matchAll(/<astro-island\b[^>]*\bprops=(?:"([^"]*)"|'([^']*)')/g);
  for (const [, doubleQuoted, singleQuoted] of islands) {
    const encoded = doubleQuoted ?? singleQuoted;
    const candidates = [encoded.replaceAll("&quot;", '"').replaceAll("&amp;", "&")];
    try {
      candidates.push(decodeURIComponent(encoded));
    } catch {
      /* keep looking */
    }
    try {
      const decoded = globalThis.atob(encoded.replaceAll("-", "+").replaceAll("_", "/"));
      candidates.push(
        decodeURIComponent([...decoded].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")),
      );
    } catch {
      /* keep looking */
    }
    for (const candidate of candidates) {
      const match = candidate.match(/"offerId"\s*:\s*"([0-9a-f-]{36})"/i);
      if (match) return match[1];
    }
  }
  return null;
}

function offerRowAttributes(body, id) {
  return body.match(new RegExp(`<tr\\b[^>]*data-offer-id="${id}"[^>]*>`, "i"))?.[0] ?? "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function standardItems(rateMinor = 125_000) {
  return [
    {
      name: "Smoke-tested work item",
      quantity: 1,
      unit: "piece",
      specification: "Smoke-tested specification",
      selling_rate_minor: rateMinor,
      labor_hours_per_unit: 1.25,
    },
  ];
}

function primaryItems() {
  return [
    {
      name: "Painted wall",
      quantity: 1.25,
      unit: "m²",
      specification: "Two coats, white finish",
      selling_rate_minor: 99_800,
      labor_hours_per_unit: 0.4,
    },
    {
      name: "Socket installation",
      quantity: 2,
      unit: "piece",
      specification: "White recessed socket",
      selling_rate_minor: 125,
      labor_hours_per_unit: 0.25,
    },
  ];
}

function offerIdFromLocation(location) {
  const url = new URL(location, BASE_URL);
  return url.searchParams.get("offer") ?? url.pathname.match(/^\/offers\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}

function itemIdsFromPage(body) {
  return [...body.matchAll(/data-offer-item-id="([0-9a-f-]{36})"/gi)].map((match) => match[1]);
}

function itemLineAmountsFromPage(body) {
  return [...body.matchAll(/data-line-amount-minor="(\d+)"/gi)].map((match) => match[1]);
}

function offerTotalFromPage(body) {
  return body.match(/data-offer-total-minor="(\d+)"/i)?.[1] ?? null;
}

const customerName = `Smoke customer ${Date.now()}`;
const malformedCustomerName = `Malformed items customer ${Date.now()}`;
const oversizedCustomerName = `Oversized items customer ${Date.now()}`;
const foreignCustomerName = `Foreign smoke customer ${Date.now()}`;
const foreignScope = "Foreign contractor private scope";
let createdCustomerId = null;
let reusedCustomerId = null;
let reusedOfferId = null;
let reusedItemIds = [];
let historyLockedOfferId = null;
let rejectedOfferId = null;
let copiedOfferId = null;
let rejectedOfferPin = null;
let copiedOfferPin = null;
let rejectedOfferSnapshot = null;
let publishedChangeId = null;
let reusedOfferPin = null;
let reusedShareToken = null;
let publishableChange = null;
let replacedSmokeChangeId = null;
let displayedChangeState = null;
let foreignCustomerId = null;
let offerId = null;
let foreignOfferId = null;
let firstGeneratedPin = null;
let originalOwnerShareToken = null;
let replacementOwnerShareToken = null;
let foreignShareToken = null;

const steps = [
  ["root redirects to dashboard", () => request("/"), { status: 302, location: "/dashboard" }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["offers redirects anonymous user", () => request("/offers"), { status: 302, location: "/auth/signin" }],
  [
    "offer creation redirects anonymous user",
    () =>
      request("/api/offers", {
        method: "POST",
        form: {
          customer_name: customerName,
          base_scope: "Anonymous smoke scope",
          base_amount: "1.00",
          base_deadline: today(),
        },
      }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["offer browser renders signed-in empty state", () => request("/offers"), { status: 200, body: "No customers yet" }],
  [
    "offer creation form renders ordered sections, required fields, and item-local templates",
    () => request("/offers/new"),
    {
      status: 200,
      body: [
        "Customer",
        "Scope and deadline",
        "Original scope",
        "Deadline",
        "Work items",
        "Template for item 1",
        "Choose a template (optional)",
        "Starter prompts",
        "Calculated offer total",
        "The total will appear once every work item is complete.",
        "Create offer",
        'aria-required="true"',
        "data-template-select",
      ],
      absentBody: ["Start work items from a trade template"],
    },
  ],
  [
    "offer creation rejects invalid submission",
    () =>
      request("/api/offers", {
        method: "POST",
        form: {
          customer_name: customerName,
          base_scope: "",
          base_amount: "not-a-price",
          base_deadline: "",
        },
      }),
    { status: 302, location: "/offers/new?error=" },
  ],
  [
    "oversized offer request is rejected before creating a customer",
    async () => {
      const rejected = await request("/api/offers", {
        method: "POST",
        form: {
          customer_name: oversizedCustomerName,
          confirm_duplicate: "false",
          base_scope: "Must not be saved",
          base_deadline: today(),
          items_json: " ".repeat(512 * 1024 + 1),
        },
      });
      if (rejected.status !== 302 || !rejected.location.startsWith("/offers/new?error=")) return rejected;
      return request(`/offers?q=${encodeURIComponent(oversizedCustomerName)}`);
    },
    { status: 200, body: "No matching customers", absentBody: ["Must not be saved"] },
  ],
  [
    "malformed item creation leaves no partial customer or offer",
    async () => {
      const rejected = await request("/api/offers", {
        method: "POST",
        form: {
          customer_name: malformedCustomerName,
          confirm_duplicate: "false",
          base_scope: "Must not be saved",
          base_deadline: today(),
          items_json: JSON.stringify([{ ...standardItems()[0], quantity: 0 }]),
        },
      });
      if (rejected.status !== 302 || !rejected.location.startsWith("/offers/new?error=")) {
        return { ...rejected, body: `malformed-create-status-${rejected.status}` };
      }
      return request(`/offers?q=${encodeURIComponent(malformedCustomerName)}`);
    },
    { status: 200, body: "No matching customers", absentBody: ["Must not be saved"] },
  ],
  [
    "offer creation redirects directly to the saved offer detail",
    async () => {
      const creation = await request("/api/offers", {
        method: "POST",
        form: {
          customer_name: customerName,
          confirm_duplicate: "false",
          base_scope: "Smoke-tested original scope",
          base_deadline: today(),
          items_json: JSON.stringify(primaryItems()),
        },
      });
      offerId = offerIdFromLocation(creation.location);
      const form = await request("/offers/new");
      createdCustomerId = customerIdFromPage(form.body, customerName);
      const detail = await request(creation.location);
      return { ...detail, location: creation.location };
    },
    {
      status: 200,
      locationPattern: /^\/offers\/[0-9a-f-]{36}$/i,
      body: ["Current offer", "Offer awaiting acceptance", "Smoke-tested original scope"],
      check: () => Boolean(createdCustomerId && offerId),
    },
  ],
  [
    "offer creation success state links to the saved offer and customer offers",
    () =>
      request(
        `/offers/new?created=1&offer=${encodeURIComponent(offerId)}&customer=${encodeURIComponent(createdCustomerId)}`,
      ),
    {
      status: 200,
      body: ["Offer created", "Review this offer", "View this customer’s offers", "Create another offer"],
    },
  ],
  [
    "offer detail shows item lines, rounded total, deadline, and private effort",
    () => request(`/offers/${offerId}`),
    {
      status: 200,
      body: ["Painted wall", "Socket installation", "2,50 zł", "Labor hours/unit (private)", "0.4"],
      check: (actual) =>
        itemIdsFromPage(actual.body).length === 2 &&
        JSON.stringify(itemLineAmountsFromPage(actual.body)) === JSON.stringify(["124750", "250"]) &&
        offerTotalFromPage(actual.body) === "125000",
    },
  ],
  [
    "oversized item JSON is rejected before parsing or editing",
    () =>
      request(`/api/offers/${offerId}/items`, {
        method: "POST",
        form: { expected_revision: "1", items_json: " ".repeat(256 * 1024 + 1) },
      }),
    { status: 413, body: "Offer items are too large" },
  ],
  [
    "offer item edit succeeds before change history and advances the revision",
    async () => {
      const details = await request(`/offers/${offerId}`);
      const itemIds = itemIdsFromPage(details.body);
      const changedItems = primaryItems();
      changedItems[0].quantity = 1.5;
      return request(`/api/offers/${offerId}/items`, {
        method: "POST",
        form: {
          expected_revision: "1",
          items_json: JSON.stringify(changedItems.map((item, index) => ({ ...item, id: itemIds[index] }))),
        },
      });
    },
    { status: 200, body: '"revision":2' },
  ],
  [
    "edited offer detail reflects the recalculated total",
    () => request(`/offers/${offerId}`),
    {
      status: 200,
      body: "Painted wall",
      check: (actual) =>
        JSON.stringify(itemLineAmountsFromPage(actual.body)) === JSON.stringify(["149700", "250"]) &&
        offerTotalFromPage(actual.body) === "149950",
    },
  ],
  [
    "malformed and stale item edits are rejected without changing the saved total",
    async () => {
      const detailsBefore = await request(`/offers/${offerId}`);
      const itemIds = itemIdsFromPage(detailsBefore.body);
      const validItems = primaryItems().map((item, index) => ({ ...item, id: itemIds[index] }));
      const invalid = await request(`/api/offers/${offerId}/items`, {
        method: "POST",
        form: {
          expected_revision: "2",
          items_json: JSON.stringify([{ ...validItems[0], quantity: 0 }, validItems[1]]),
        },
      });
      if (invalid.status !== 400) return { ...invalid, body: `invalid-edit-status-${invalid.status}` };
      const stale = await request(`/api/offers/${offerId}/items`, {
        method: "POST",
        form: { expected_revision: "1", items_json: JSON.stringify(validItems) },
      });
      if (stale.status !== 409) return { ...stale, body: `stale-edit-status-${stale.status}` };
      const detailsAfter = await request(`/offers/${offerId}`);
      const amounts = itemLineAmountsFromPage(detailsAfter.body);
      return {
        ...detailsAfter,
        body: `${invalid.body} ${stale.body} lines:${amounts.join(",")} total:${offerTotalFromPage(detailsAfter.body)}`,
      };
    },
    {
      status: 200,
      body: ["positive quantity", "changed while you were editing", "lines:149700,250", "total:149950"],
    },
  ],
  [
    "anonymous contractor cannot edit an offer's items",
    () =>
      request(
        `/api/offers/${offerId}/items`,
        { method: "POST", form: { expected_revision: "2", items_json: "[]" } },
        new Map(),
      ),
    { status: 401, body: "Sign in to edit this offer" },
  ],
  [
    "expanded customer group renders an eligible pending offer without PIN controls",
    () => request(`/offers?customer=${createdCustomerId}`),
    {
      status: 200,
      body: [customerName, "Smoke-tested original scope", "pending", "1", today(), 'aria-expanded="true"'],
      check: (actual) =>
        /<h2[^>]*id="offer-list-title"[^>]*tabindex="-1"/.test(actual.body) &&
        offerRowAttributes(actual.body, offerId).includes('data-can-edit="true"') &&
        offerRowAttributes(actual.body, offerId).includes('data-can-propose-change="false"') &&
        actual.body.includes(`/offers/${offerId}`),
      absentBody: ["Manage PIN", "Generate PIN"],
    },
  ],
  [
    "offer search and malformed page parameters resolve to the first matching page",
    () =>
      request(
        `/offers?q=${encodeURIComponent(customerName)}&page=999&customer=${encodeURIComponent(createdCustomerId)}&offerPage=invalid`,
      ),
    {
      status: 200,
      body: [customerName, "Page 1 of 1", "Showing 1–1 of 1 customers", "Showing 1–1 of 1 offers"],
      check: (actual) => {
        const customerPager = customerPagerFromPage(actual.body);
        return (
          customerIdFromPage(actual.body, customerName) === createdCustomerId &&
          customerPager.includes("Page 1 of 1") &&
          !customerPager.includes("Next customers")
        );
      },
    },
  ],
  [
    "offer detail exposes PIN state without secrets",
    async () => {
      const page = await request(`/offers?customer=${createdCustomerId}`);
      offerId = offerIdFromPage(page.body);
      return request(`/offers/${offerId}`);
    },
    { status: 200, body: ["Customer access", "Not configured"], check: () => Boolean(offerId) },
  ],
  [
    "invalid offer ID is rejected without a candidate PIN",
    () => request("/api/offers/not-a-uuid/pin", { method: "POST" }),
    { status: 400, body: "Offer is unavailable" },
  ],
  [
    "cross-origin PIN generation is rejected by Astro",
    () => request(`/api/offers/${offerId}/pin`, { method: "POST", headers: { Origin: "https://attacker.example" } }),
    { status: 403, body: "Cross-site POST form submissions are forbidden" },
  ],
  [
    "cross-origin JSON PIN generation is rejected by the API",
    () =>
      request(`/api/offers/${offerId}/pin`, {
        method: "POST",
        headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
        body: "{}",
      }),
    { status: 403 },
  ],
  [
    "initial PIN generation is returned once with no-store",
    async () => {
      const result = await request(`/api/offers/${offerId}/pin`, { method: "POST" });
      try {
        firstGeneratedPin = JSON.parse(result.body).pin;
      } catch {
        /* assertion below reports failure */
      }
      return result;
    },
    {
      status: 200,
      check: (actual) => /^\d{6}$/.test(firstGeneratedPin ?? "") && actual.headers.get("cache-control") === "no-store",
    },
  ],
  [
    "offer refresh shows configured state without rendering PIN or token",
    () => request(`/offers/${offerId}`),
    {
      status: 200,
      body: "Configured",
      absentBody: [firstGeneratedPin ?? "INVALID_PIN_SENTINEL", "share_token", "pin_hash"],
    },
  ],
  [
    "owner share controls revoke and rotate links with no-store responses",
    async () => {
      const { data: before, error: beforeError } = await admin
        .from("offers")
        .select("share_token, pin_hash")
        .eq("id", offerId)
        .single();
      if (beforeError || !before?.share_token) return { status: 0, body: "Could not read initial share state." };
      originalOwnerShareToken = before.share_token;
      const pageBefore = await request(`/offers/${offerId}`);
      const anonymous = await request(
        `/api/offers/${offerId}/share`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revoke" }),
        },
        new Map(),
      );
      const malformed = await request("/api/offers/not-a-uuid/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const invalidAction = await request(`/api/offers/${offerId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const crossOrigin = await request(`/api/offers/${offerId}/share`, {
        method: "POST",
        headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const revoked = await request(`/api/offers/${offerId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      const oldRead = await sharedClient.rpc("get_shared_offer", { p_share_token: originalOwnerShareToken });
      const rotated = await request(`/api/offers/${offerId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reshare" }),
      });
      let rotatedBody;
      try {
        rotatedBody = JSON.parse(rotated.body);
      } catch {
        rotatedBody = {};
      }
      replacementOwnerShareToken = rotatedBody.share_token;
      const newRead = replacementOwnerShareToken
        ? await sharedClient.rpc("get_shared_offer", { p_share_token: replacementOwnerShareToken })
        : { data: null, error: new Error("Missing replacement token") };
      const pageAfter = await request(`/offers/${offerId}`);
      const { data: after, error: afterError } = await admin
        .from("offers")
        .select("share_token, share_link_revoked_at, pin_hash")
        .eq("id", offerId)
        .single();
      const apiNoStore =
        revoked.headers.get("cache-control") === "no-store" && rotated.headers.get("cache-control") === "no-store";
      const validLifecycle =
        revoked.status === 200 &&
        rotated.status === 200 &&
        replacementOwnerShareToken &&
        replacementOwnerShareToken !== originalOwnerShareToken &&
        oldRead.data === null &&
        !oldRead.error &&
        newRead.data?.id === offerId &&
        !newRead.error &&
        !afterError &&
        after.share_token === replacementOwnerShareToken &&
        after.share_link_revoked_at === null &&
        after.pin_hash === before.pin_hash &&
        apiNoStore &&
        pageBefore.status === 200 &&
        pageBefore.headers.get("cache-control") === "no-store" &&
        pageBefore.body.includes(originalOwnerShareToken) &&
        pageBefore.body.includes("Revoke link") &&
        pageAfter.status === 200 &&
        pageAfter.headers.get("cache-control") === "no-store" &&
        pageAfter.body.includes(replacementOwnerShareToken) &&
        !pageAfter.body.includes(originalOwnerShareToken) &&
        pageAfter.body.includes("Revoke link");
      return {
        status:
          validLifecycle &&
          anonymous.status === 401 &&
          malformed.status === 404 &&
          invalidAction.status === 400 &&
          crossOrigin.status === 403
            ? 200
            : 500,
        body: `lifecycle:${validLifecycle} anonymous:${anonymous.status} malformed:${malformed.status} invalid:${invalidAction.status} cross-origin:${crossOrigin.status}`,
      };
    },
    { status: 200, body: "lifecycle:true anonymous:401 malformed:404 invalid:400 cross-origin:403" },
  ],
  [
    "anonymous PIN generation is rejected",
    () => request(`/api/offers/${offerId}/pin`, { method: "POST" }, new Map()),
    { status: 401, body: "Sign in" },
  ],
  [
    "reset returns a different one-time PIN",
    async () => {
      const result = await request(`/api/offers/${offerId}/pin`, { method: "POST" });
      let replacement = "";
      try {
        replacement = JSON.parse(result.body).pin ?? "";
      } catch {
        /* checked below */
      }
      return {
        ...result,
        body:
          /^\d{6}$/.test(replacement) && replacement !== firstGeneratedPin
            ? "replacement-generated"
            : "invalid-replacement",
      };
    },
    { status: 200, body: "replacement-generated" },
  ],
  [
    "offer creation reuses an existing customer",
    async () => {
      const page = await request("/offers/new");
      const customerId = customerIdFromPage(page.body, customerName);
      if (!customerId) {
        return {
          status: 0,
          location: "",
          body: "Could not find the created customer in the authenticated offer form.",
        };
      }
      const created = await request("/api/offers", {
        method: "POST",
        form: {
          customer_id: customerId,
          base_scope: "Smoke-tested reused customer scope",
          base_deadline: today(),
          items_json: JSON.stringify(standardItems(250)),
        },
      });
      reusedCustomerId = customerId;
      reusedOfferId = offerIdFromLocation(created.location);
      const detail = await request(created.location);
      reusedItemIds = itemIdsFromPage(detail.body);
      return { ...detail, location: created.location };
    },
    {
      status: 200,
      locationPattern: /^\/offers\/[0-9a-f-]{36}$/i,
      body: "Smoke-tested reused customer scope",
      check: () => Boolean(reusedOfferId && reusedCustomerId),
    },
  ],
  [
    "reused-customer group contains both offers with their current values",
    () => request(`/offers?customer=${reusedCustomerId}`),
    {
      status: 200,
      body: [
        "Smoke-tested reused customer scope",
        "Smoke-tested original scope",
        "2,50 zł",
        "499,50 zł",
        "pending",
        today(),
      ],
    },
  ],
  [
    "foreign contractor creates a private customer for isolation coverage",
    async () => {
      const signup = await request(
        "/api/auth/signup",
        { method: "POST", form: { email: foreignEmail, password } },
        foreignJar,
      );
      if (signup.status !== 302) return signup;
      await request("/api/auth/signin", { method: "POST", form: { email: foreignEmail, password } }, foreignJar);
      const creation = await request(
        "/api/offers",
        {
          method: "POST",
          form: {
            customer_name: foreignCustomerName,
            confirm_duplicate: "false",
            base_scope: foreignScope,
            base_deadline: today(),
            items_json: JSON.stringify(standardItems(999)),
          },
        },
        foreignJar,
      );
      foreignOfferId = offerIdFromLocation(creation.location);
      if (foreignOfferId) {
        const { data: foreignOffer } = await admin
          .from("offers")
          .select("share_token")
          .eq("id", foreignOfferId)
          .single();
        foreignShareToken = foreignOffer?.share_token ?? null;
      }
      const foreignForm = await request("/offers/new", {}, foreignJar);
      foreignCustomerId = customerIdFromPage(foreignForm.body, foreignCustomerName);
      return { ...creation, body: foreignCustomerId ? "foreign-customer-created" : creation.body };
    },
    {
      status: 302,
      locationPattern: /^\/offers\/[0-9a-f-]{36}$/i,
      body: "foreign-customer-created",
    },
  ],
  [
    "shared offer page is available anonymously and to a signed-in contractor without private data",
    async () => {
      if (!replacementOwnerShareToken) return { status: 0, body: "Missing active share token." };
      const anonymous = await request(`/shared/${replacementOwnerShareToken}`, {}, new Map());
      const signedIn = await request(`/shared/${replacementOwnerShareToken}`);
      return {
        ...anonymous,
        signedIn,
        privateFields: ["pin_hash", "labor_hours_per_unit", "price_breakdown", "owner_id", "share_token"].filter(
          (field) => anonymous.body.toLowerCase().includes(field),
        ),
      };
    },
    {
      status: 200,
      body: [
        "Shared offer",
        "Proposed total",
        "Smoke-tested original scope",
        "Status: Awaiting customer decision",
        "Your decision",
        "Accept offer",
        "Reject offer",
        "Six-digit offer PIN",
      ],
      absentBody: ["Revoke link", "labor_hours_per_unit", "price_breakdown", "pin_hash", "share_token"],
      check: (actual) =>
        actual.signedIn.status === 200 &&
        actual.headers.get("cache-control") === "no-store" &&
        actual.headers.get("referrer-policy") === "no-referrer" &&
        actual.body.includes('name="robots" content="noindex, nofollow"') &&
        actual.privateFields.length === 0,
    },
  ],
  [
    "shared offer unavailable tokens have identical public response and foreign offers stay isolated",
    async () => {
      const malformed = await request("/shared/not-a-token", {}, new Map());
      const unknown = await request("/shared/00000000-0000-4000-8000-000000000000", {}, new Map());
      const revoked = originalOwnerShareToken
        ? await request(`/shared/${originalOwnerShareToken}`, {}, new Map())
        : null;
      const foreign = foreignShareToken ? await request(`/shared/${foreignShareToken}`, {}, new Map()) : null;
      const current = replacementOwnerShareToken
        ? await request(`/shared/${replacementOwnerShareToken}`, {}, new Map())
        : null;
      const unavailable = [malformed, unknown, revoked];
      return {
        ...unknown,
        unavailable,
        foreign,
        current,
        body: `${unknown.body} malformed:${malformed.status}:${malformed.body.includes("Offer unavailable")} revoked:${revoked?.status}:${revoked?.body.includes("Offer unavailable")} foreign:${foreign?.status}:${foreign?.body.includes(foreignScope)}:other:${foreign?.body.includes("Smoke-tested original scope")}`,
      };
    },
    {
      status: 404,
      body: ["Offer unavailable", "malformed:404:true", "revoked:404:true", "foreign:200:true:other:false"],
      absentBody: ["Smoke-tested original scope"],
      check: (actual) =>
        actual.unavailable.every(
          (response) => response.status === 404 && response.body.includes("Offer unavailable"),
        ) &&
        new Set(actual.unavailable.map((response) => response.body)).size === 1 &&
        actual.foreign?.status === 200 &&
        actual.foreign.body.includes(foreignScope) &&
        !actual.foreign.body.includes("Smoke-tested original scope") &&
        actual.current?.status === 200,
    },
  ],
  [
    "foreign offer detail and item edits reveal no offer data",
    async () => {
      const detail = await request(`/offers/${foreignOfferId}`);
      const edit = await request(`/api/offers/${foreignOfferId}/items`, {
        method: "POST",
        form: { expected_revision: "1", items_json: JSON.stringify(standardItems()) },
      });
      return { ...detail, body: `${detail.body} ${edit.body} edit-status-${edit.status}` };
    },
    {
      status: 404,
      body: ["Offer unavailable", "Offer is unavailable", "edit-status-404"],
      absentBody: [foreignCustomerName, foreignScope],
    },
  ],
  [
    "foreign offer PIN cannot be managed by this contractor",
    async () => {
      if (!foreignOfferId) return { status: 0, location: "", body: "foreign offer unavailable" };
      return request(`/api/offers/${foreignOfferId}/pin`, { method: "POST" });
    },
    { status: 404, body: "Offer is unavailable", absentBody: ["pin_hash", "share_token"] },
  ],
  [
    "foreign contractor share controls are unavailable",
    async () => {
      const page = await request(`/offers/${foreignOfferId}`);
      const api = await request(`/api/offers/${foreignOfferId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      return { ...api, body: `${api.body} detail:${page.status}:${page.body.includes("Offer unavailable")}` };
    },
    { status: 404, body: ["Offer is unavailable", "detail:404:true"], absentBody: ["share_token", "pin_hash"] },
  ],
  [
    "history route keeps foreign and unknown offers unavailable",
    async () => {
      const foreign = await request(`/offers/${foreignOfferId}/history`);
      const unknown = await request(`/offers/00000000-0000-4000-8000-000000000000/history`);
      return {
        ...foreign,
        body: `${foreign.body} unknown:${unknown.status}:${unknown.body.includes("Offer unavailable")}`,
      };
    },
    { status: 404, body: ["Offer unavailable", "unknown:404:true"], absentBody: [foreignScope] },
  ],
  [
    "anonymous history route redirects to sign in",
    () => request(`/offers/${offerId}/history`, {}, new Map()),
    { status: 302, location: "/auth/signin" },
  ],
  [
    "rejected initial offer shows its decision and reason without an active-work claim",
    async () => {
      const creation = await request("/api/offers", {
        method: "POST",
        form: {
          customer_id: reusedCustomerId,
          base_scope: "Rejected initial smoke scope",
          base_deadline: today(),
          items_json: JSON.stringify(standardItems(700)),
        },
      });
      rejectedOfferId = offerIdFromLocation(creation.location);
      if (!rejectedOfferId) return { status: 0, body: "Could not create rejected fixture." };
      const pinResponse = await request(`/api/offers/${rejectedOfferId}/pin`, { method: "POST" });
      try {
        rejectedOfferPin = JSON.parse(pinResponse.body).pin ?? null;
      } catch {
        rejectedOfferPin = null;
      }
      if (pinResponse.status !== 200 || !/^\d{6}$/.test(rejectedOfferPin ?? "")) {
        return { status: 0, body: "Could not prepare an independently pinned rejected fixture." };
      }
      const { error: offerError } = await admin.from("offers").update({ status: "rejected" }).eq("id", rejectedOfferId);
      const { error: revisionError } = await admin
        .from("offer_revisions")
        .update({
          status: "rejected",
          decision_outcome: "rejected",
          rejection_comment: "Customer declined the first offer",
          decided_at: new Date().toISOString(),
        })
        .eq("offer_id", rejectedOfferId)
        .eq("revision", 1);
      if (offerError || revisionError) return { status: 0, body: "Could not mark rejected fixture." };
      const { data: sourceOffer, error: sourceOfferError } = await admin
        .from("offers")
        .select("id, customer_id, status, base_scope, base_deadline, share_token, pin_hash")
        .eq("id", rejectedOfferId)
        .single();
      const { data: sourceRevision, error: sourceRevisionError } = await admin
        .from("offer_revisions")
        .select(
          "revision, base_scope, base_amount_minor, base_deadline, status, decision_outcome, decided_at, rejection_comment, items",
        )
        .eq("offer_id", rejectedOfferId)
        .eq("revision", 1)
        .single();
      if (sourceOfferError || sourceRevisionError) {
        const snapshotFailures = [
          ["offer", sourceOfferError],
          ["revision", sourceRevisionError],
        ]
          .filter(([, error]) => error)
          .map(([table, error]) => `${table}:${error.code ?? "unknown"}:${error.message}`)
          .join("; ");
        return { status: 0, body: `Could not snapshot rejected fixture: ${snapshotFailures}` };
      }
      rejectedOfferSnapshot = { offer: sourceOffer, revision: sourceRevision };
      const detail = await request(`/offers/${rejectedOfferId}`);
      const history = await request(`/offers/${rejectedOfferId}/history`);
      return {
        ...detail,
        body: `${detail.body} history:${history.status}:${history.body.includes("Customer declined the first offer")}`,
      };
    },
    {
      status: 200,
      body: [
        "Customer rejected this offer",
        "Customer declined the first offer",
        "Create new offer from this one",
        "history:200:true",
      ],
      absentBody: ["Current agreed work", "Record a change", 'aria-label="Offer actions"'],
    },
  ],
  [
    "rejected offer prefill is owner-scoped and creates an independent offer",
    async () => {
      if (!rejectedOfferId || !rejectedOfferSnapshot) return { status: 0, body: "Missing rejected offer fixture." };
      const sourceForm = await request(`/offers/new?source=${encodeURIComponent(rejectedOfferId)}`);
      const malformed = await request("/offers/new?source=not-a-uuid");
      const unknown = await request("/offers/new?source=00000000-0000-4000-8000-000000000000");
      const foreign = await request(`/offers/new?source=${encodeURIComponent(foreignOfferId)}`);
      const pending = await request(`/offers/new?source=${encodeURIComponent(reusedOfferId)}`);
      const invalidSourceFallbacks = [malformed, unknown, foreign, pending];
      const manualFallbackAvailable = invalidSourceFallbacks.every(
        (result) =>
          result.status === 200 &&
          result.body.includes("The rejected offer is unavailable") &&
          result.body.includes('action="/api/offers"') &&
          !result.body.includes("data-prefilled-source-offer=") &&
          !result.body.includes("Rejected initial smoke scope"),
      );
      if (!manualFallbackAvailable)
        return { ...malformed, body: `${malformed.body} invalid-source-manual-fallback-mismatch` };
      const prefillVisible =
        sourceForm.status === 200 &&
        sourceForm.body.includes(`data-prefilled-source-offer="${rejectedOfferId}"`) &&
        sourceForm.body.includes(`name="customer_id" value="${rejectedOfferSnapshot.offer.customer_id}"`) &&
        sourceForm.body.includes("Rejected initial smoke scope") &&
        sourceForm.body.includes("Smoke-tested work item") &&
        sourceForm.body.includes("Smoke-tested specification");
      if (!prefillVisible) return { ...sourceForm, body: `${sourceForm.body} authorized-prefill-missing` };
      const creation = await request("/api/offers", {
        method: "POST",
        form: {
          customer_id: rejectedOfferSnapshot.offer.customer_id,
          base_scope: "Rejected initial smoke scope",
          base_deadline: rejectedOfferSnapshot.offer.base_deadline,
          items_json: JSON.stringify(standardItems(700)),
        },
      });
      copiedOfferId = offerIdFromLocation(creation.location);
      if (creation.status !== 302 || !copiedOfferId || copiedOfferId === rejectedOfferId) {
        return { ...creation, body: "Independent offer was not created." };
      }
      const newPinResponse = await request(`/api/offers/${copiedOfferId}/pin`, { method: "POST" });
      try {
        copiedOfferPin = JSON.parse(newPinResponse.body).pin ?? null;
      } catch {
        copiedOfferPin = null;
      }
      const { data: copiedOffer, error: copiedOfferError } = await admin
        .from("offers")
        .select("id, customer_id, status, base_scope, base_deadline, share_token, pin_hash")
        .eq("id", copiedOfferId)
        .single();
      const { data: copiedRevisions, error: copiedRevisionError } = await admin
        .from("offer_revisions")
        .select("revision, status, decision_outcome, decided_at, rejection_comment, items")
        .eq("offer_id", copiedOfferId);
      const { data: unchangedOffer, error: unchangedOfferError } = await admin
        .from("offers")
        .select("id, customer_id, status, base_scope, base_deadline, share_token, pin_hash")
        .eq("id", rejectedOfferId)
        .single();
      const { data: unchangedRevision, error: unchangedRevisionError } = await admin
        .from("offer_revisions")
        .select(
          "revision, base_scope, base_amount_minor, base_deadline, status, decision_outcome, decided_at, rejection_comment, items",
        )
        .eq("offer_id", rejectedOfferId)
        .eq("revision", 1)
        .single();
      const historyUnchanged =
        JSON.stringify(unchangedOffer) === JSON.stringify(rejectedOfferSnapshot.offer) &&
        JSON.stringify(unchangedRevision) === JSON.stringify(rejectedOfferSnapshot.revision);
      const sourceItems = rejectedOfferSnapshot.revision.items;
      const copiedItems = copiedRevisions?.[0]?.items;
      const copiedItemIdsAreNew =
        Array.isArray(sourceItems) &&
        Array.isArray(copiedItems) &&
        sourceItems.length === copiedItems.length &&
        sourceItems.every((item, index) => item.id !== copiedItems[index]?.id);
      const itemSnapshotsMatch =
        Array.isArray(sourceItems) &&
        Array.isArray(copiedItems) &&
        JSON.stringify(
          sourceItems.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"))),
        ) ===
          JSON.stringify(
            copiedItems.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "id"))),
          );
      const independentDraft =
        !copiedOfferError &&
        !copiedRevisionError &&
        copiedOffer.status === "pending" &&
        copiedOffer.customer_id === rejectedOfferSnapshot.offer.customer_id &&
        copiedOffer.base_scope === rejectedOfferSnapshot.offer.base_scope &&
        copiedOffer.base_deadline === rejectedOfferSnapshot.offer.base_deadline &&
        copiedItemIdsAreNew &&
        itemSnapshotsMatch &&
        copiedOffer.share_token !== rejectedOfferSnapshot.offer.share_token &&
        copiedOffer.pin_hash !== rejectedOfferSnapshot.offer.pin_hash &&
        Boolean(copiedOffer.pin_hash) &&
        newPinResponse.status === 200 &&
        /^\d{6}$/.test(copiedOfferPin ?? "") &&
        copiedRevisions.length === 1 &&
        copiedRevisions[0].status === "pending" &&
        copiedRevisions[0].decision_outcome === null &&
        copiedRevisions[0].decided_at === null &&
        copiedRevisions[0].rejection_comment === null;
      const invalidSourcesSafe = [malformed, unknown, foreign, pending].every(
        (response) =>
          response.status === 200 &&
          response.body.includes("The rejected offer is unavailable") &&
          !response.body.includes("Foreign contractor private scope") &&
          !response.body.includes("Rejected initial smoke scope"),
      );
      const page = await request(`/offers/${rejectedOfferId}`);
      return {
        ...page,
        body: `prefill:${prefillVisible} independent:${independentDraft} source-history:${historyUnchanged} invalid-sources:${invalidSourcesSafe} errors:${copiedOfferError?.message ?? "none"}/${copiedRevisionError?.message ?? "none"}/${unchangedOfferError?.message ?? "none"}/${unchangedRevisionError?.message ?? "none"}`,
      };
    },
    {
      status: 200,
      body: "prefill:true independent:true source-history:true invalid-sources:true errors:none/none/none/none",
    },
  ],
  [
    "pending offer edit route is available while change proposal route is unavailable",
    async () => {
      const detail = await request(`/offers/${reusedOfferId}`);
      const edit = await request(`/offers/${reusedOfferId}/edit`);
      const change = await request(`/offers/${reusedOfferId}/changes/new`);
      return {
        ...edit,
        body: `${edit.body} overview-actions:${detail.body.includes('aria-label="Offer actions"')} rejected-copy:${detail.body.includes("Create new offer from this one")} change:${change.status}:${change.body.includes("Change proposal unavailable")}`,
      };
    },
    {
      status: 200,
      body: [
        "Edit pending offer",
        "Replace the pending version",
        "overview-actions:true",
        "rejected-copy:false",
        "change:404:true",
      ],
      check: (actual) =>
        actual.body.includes("Edit pending offer") && !actual.body.includes("Change proposal unavailable"),
    },
  ],
  [
    "task routes keep foreign, unknown, and anonymous offers unavailable",
    async () => {
      const foreign = await request(`/offers/${foreignOfferId}/edit`);
      const unknown = await request("/offers/00000000-0000-4000-8000-000000000000/changes/new");
      const anonymous = await request(`/offers/${reusedOfferId}/edit`, {}, new Map());
      return {
        ...foreign,
        body: `${foreign.body} unknown:${unknown.status}:${unknown.body.includes("Change proposal unavailable")} anonymous:${anonymous.status}:${anonymous.location}`,
      };
    },
    {
      status: 404,
      body: ["Offer editing unavailable", "unknown:404:true", "anonymous:302:/auth/signin"],
      absentBody: [foreignScope],
    },
  ],
  [
    "pending offer revision is recorded atomically",
    async () => {
      const revision = await request(`/api/offers/${reusedOfferId}/revision`, {
        method: "POST",
        form: {
          expected_revision: "1",
          base_scope: "Revised smoke-tested scope",
          base_deadline: today(),
          items_json: JSON.stringify([{ ...standardItems(300)[0], id: reusedItemIds[0] }]),
        },
      });
      const detail = await request(`/offers/${reusedOfferId}?notice=revision-replaced`);
      return {
        ...revision,
        body: `${revision.body} retained:${JSON.stringify(itemIdsFromPage(detail.body))} notice:${detail.body.includes("The pending offer was replaced")}`,
      };
    },
    {
      status: 200,
      body: ['"revision":2', "notice:true"],
      check: (actual) => actual.body.includes(`retained:${JSON.stringify(reusedItemIds)}`),
    },
  ],
  [
    "offer version history retains both the superseded and current snapshots",
    () => request(`/offers/${reusedOfferId}/history`),
    {
      status: 200,
      body: ["Offer history", "Smoke-tested reused customer scope", "Revised smoke-tested scope"],
      check: (actual) =>
        /data-offer-revision="1"[^>]*data-revision-status="superseded"[^>]*data-revision-amount-minor="250"/.test(
          actual.body,
        ) &&
        /data-offer-revision="2"[^>]*data-revision-status="pending"[^>]*data-revision-amount-minor="300"/.test(
          actual.body,
        ),
    },
  ],
  [
    "malformed offer revision is rejected",
    () =>
      request(`/api/offers/${reusedOfferId}/revision`, {
        method: "POST",
        form: {
          expected_revision: "2",
          base_scope: "Malformed revision",
          base_deadline: today(),
          items_json: "{",
        },
      }),
    { status: 400, body: "invalid JSON" },
  ],
  [
    "oversized offer revision is rejected",
    () =>
      request(`/api/offers/${reusedOfferId}/revision`, {
        method: "POST",
        form: {
          expected_revision: "2",
          base_scope: "Oversized revision",
          base_deadline: today(),
          items_json: " ".repeat(256 * 1024 + 1),
        },
      }),
    { status: 413, body: "Offer items are too large" },
  ],
  [
    "stale offer revision is rejected",
    () =>
      request(`/api/offers/${reusedOfferId}/revision`, {
        method: "POST",
        form: {
          expected_revision: "1",
          base_scope: "Stale revision",
          base_deadline: today(),
          items_json: JSON.stringify(standardItems(300)),
        },
      }),
    { status: 409, body: "changed or was accepted" },
  ],
  [
    "pending offer with recorded change history hides replacement and rejects direct revision",
    async () => {
      const creation = await request("/api/offers", {
        method: "POST",
        form: {
          customer_id: reusedCustomerId,
          base_scope: "History-locked smoke offer",
          base_deadline: today(),
          items_json: JSON.stringify(standardItems(500)),
        },
      });
      historyLockedOfferId = offerIdFromLocation(creation.location);
      if (!historyLockedOfferId) return { status: 0, body: "Could not create history-locked fixture." };
      const { data: owner, error: ownerError } = await admin
        .from("offers")
        .select("contractor_id")
        .eq("id", historyLockedOfferId)
        .single();
      if (ownerError) return { status: 0, body: "Could not read fixture owner." };
      const { error: changeError } = await admin.from("offer_changes").insert({
        contractor_id: owner.contractor_id,
        offer_id: historyLockedOfferId,
        description: "Recorded history lock",
        price_delta_minor: 100,
      });
      if (changeError) return { status: 0, body: "Could not seed change history." };
      const detail = await request(`/offers/${historyLockedOfferId}`);
      const revision = await request(`/api/offers/${historyLockedOfferId}/revision`, {
        method: "POST",
        form: {
          expected_revision: "1",
          base_scope: "Must not replace",
          base_deadline: today(),
          items_json: JSON.stringify(standardItems(600)),
        },
      });
      return {
        ...revision,
        body: `${revision.body} hidden:${!detail.body.includes('id="replace-offer-title"')}`,
      };
    },
    { status: 409, body: ['"error"', "hidden:true"] },
  ],
  [
    "foreign and anonymous revision requests remain unavailable",
    async () => {
      const form = {
        expected_revision: "1",
        base_scope: "Must not replace",
        base_deadline: today(),
        items_json: JSON.stringify(standardItems()),
      };
      const foreign = await request(`/api/offers/${foreignOfferId}/revision`, { method: "POST", form });
      const anonymous = await request(
        `/api/offers/${historyLockedOfferId}/revision`,
        { method: "POST", form },
        new Map(),
      );
      return { ...foreign, body: `${foreign.body} anonymous:${anonymous.status}` };
    },
    { status: 404, body: ["Offer is unavailable", "anonymous:401"] },
  ],
  [
    "history-locked pending offer has no Edit row action",
    () => request(`/offers?customer=${reusedCustomerId}`),
    {
      status: 200,
      check: (actual) =>
        offerRowAttributes(actual.body, historyLockedOfferId).includes('data-can-edit="false"') &&
        offerRowAttributes(actual.body, historyLockedOfferId).includes('data-can-propose-change="false"'),
    },
  ],
  [
    "change preview rejects malformed and oversized requests",
    async () => {
      const malformed = await request(`/api/offers/${reusedOfferId}/changes/preview`, {
        method: "POST",
        form: { change_json: "{" },
      });
      const oversized = await request(`/api/offers/${reusedOfferId}/changes/preview`, {
        method: "POST",
        form: { change_json: " ".repeat(256 * 1024 + 1) },
      });
      return { ...oversized, body: `${malformed.body} ${oversized.body} oversized:${oversized.status}` };
    },
    { status: 413, body: ["invalid JSON", "oversized:413"] },
  ],
  [
    "out-of-range commercial adjustments return field errors for preview and publication",
    async () => {
      const invalidChange = {
        expected_scope_revision: 1,
        description: "Invalid commercial adjustment",
        target_deadline: today(),
        effects: [],
        commercial_adjustment_minor: "10000000000000000",
      };
      const preview = await request(`/api/offers/${reusedOfferId}/changes/preview`, {
        method: "POST",
        form: { change_json: JSON.stringify(invalidChange) },
      });
      const publication = await request(`/api/offers/${reusedOfferId}/changes/`, {
        method: "POST",
        form: { change_json: JSON.stringify({ ...invalidChange, commercial_adjustment_minor: "-10000000000000000" }) },
      });
      return { ...preview, body: `${preview.body} ${publication.body}`, publicationStatus: publication.status };
    },
    {
      status: 400,
      body: ["outside the supported amount range", '"commercial_adjustment_minor"'],
      check: (actual) =>
        actual.publicationStatus === 400 && (actual.body.match(/"commercial_adjustment_minor"/g) ?? []).length === 2,
    },
  ],
  [
    "change preview rejects stale scope revisions",
    () =>
      request(`/api/offers/${reusedOfferId}/changes/preview`, {
        method: "POST",
        form: {
          change_json: JSON.stringify({
            expected_scope_revision: 999,
            description: "Stale estimate",
            target_deadline: today(),
            effects: [],
          }),
        },
      }),
    { status: 409, body: "scope changed" },
  ],
  [
    "anonymous change preview is rejected",
    () =>
      request(
        `/api/offers/${reusedOfferId}/changes/preview`,
        { method: "POST", form: { change_json: "{}" } },
        new Map(),
      ),
    { status: 401, body: "Sign in" },
  ],
  [
    "foreign offer change preview is unavailable",
    () =>
      request(`/api/offers/${foreignOfferId}/changes/preview`, {
        method: "POST",
        form: { change_json: JSON.stringify({ expected_scope_revision: 1, description: "Foreign", effects: [] }) },
      }),
    { status: 404, body: "Offer is unavailable" },
  ],
  [
    "contractor change template is saved for reuse",
    () =>
      request(`/api/offers/${reusedOfferId}/templates`, {
        method: "POST",
        form: {
          template_json: JSON.stringify({
            trade: "painting",
            name: "Smoke saved painting template",
            unit: "m²",
            prompts: ["Confirm substrate."],
            selling_rate_minor: "12500",
            labor_hours_per_unit: "0.5",
            companion_operations: [],
          }),
        },
      }),
    { status: 201, body: "Smoke saved painting template" },
  ],
  [
    "anonymous contractor cannot save a change template",
    () =>
      request(`/api/offers/${reusedOfferId}/templates`, { method: "POST", form: { template_json: "{}" } }, new Map()),
    { status: 401, body: "Sign in" },
  ],
  [
    "foreign offer cannot be used to save a change template",
    () =>
      request(`/api/offers/${foreignOfferId}/templates`, {
        method: "POST",
        form: {
          template_json: JSON.stringify({
            trade: "painting",
            name: "Foreign template",
            unit: "piece",
            prompts: [],
            selling_rate_minor: null,
            labor_hours_per_unit: null,
            companion_operations: [],
          }),
        },
      }),
    { status: 404, body: "Offer is unavailable" },
  ],
  [
    "customer accepts the current base revision with the offer PIN",
    async () => {
      const contractor = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: signInError } = await contractor.auth.signInWithPassword({ email, password });
      if (signInError) return { status: 0, body: "Could not authenticate the smoke contractor with local Supabase." };
      const { data: offer, error: offerError } = await contractor
        .from("offers")
        .select("share_token")
        .eq("id", reusedOfferId)
        .single();
      if (offerError || !offer?.share_token)
        return { status: 0, body: "Could not read the smoke contractor's offer token." };
      const pinResponse = await requestWithTransientProxyRetry(`/api/offers/${reusedOfferId}/pin`, { method: "POST" });
      let pin;
      try {
        pin = JSON.parse(pinResponse.body).pin;
      } catch {
        return {
          status: 0,
          body: `Could not generate the smoke offer PIN (HTTP ${pinResponse.status}, ${pinResponse.headers.get("content-type") ?? "no content type"}).`,
        };
      }
      if (pinResponse.status !== 200 || !/^\d{6}$/.test(pin))
        return { status: 0, body: "Could not generate a valid smoke offer PIN." };
      reusedOfferPin = pin;
      reusedShareToken = offer.share_token;
      const { data: shared, error: sharedError } = await sharedClient.rpc("get_shared_offer", {
        p_share_token: offer.share_token,
      });
      if (sharedError || !shared?.base_revision?.id)
        return { status: 0, body: "Could not read the current shared offer revision." };
      const wrongOrigin = await request(
        `/api/shared/${offer.share_token}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "https://other.example" },
          body: "{}",
        },
        new Map(),
      );
      const oversized = await request(
        `/api/shared/${offer.share_token}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: `{"padding":"${"x".repeat(8_200)}"}`,
        },
        new Map(),
      );
      const invalidJson = await requestWithTransientProxyRetry(
        `/api/shared/${offer.share_token}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        },
        new Map(),
      );
      const baseDecision = {
        target_kind: "base",
        target_id: shared.base_revision.id,
        expected_base_revision: shared.base_revision.revision,
        expected_active_scope_revision: shared.active_scope_revision,
        pin,
        outcome: "accepted",
      };
      const wrongPin = await request(
        `/api/shared/${offer.share_token}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseDecision, pin: pin === "000000" ? "000001" : "000000" }),
        },
        new Map(),
      );
      const staleView = await request(
        `/api/shared/${offer.share_token}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseDecision, expected_base_revision: shared.base_revision.revision + 1 }),
        },
        new Map(),
      );
      if (
        wrongOrigin.status !== 403 ||
        oversized.status !== 413 ||
        invalidJson.status !== 400 ||
        wrongPin.status !== 400 ||
        staleView.status !== 409
      ) {
        return {
          status: 0,
          body: `Decision endpoint status checks failed: origin=${wrongOrigin.status}, size=${oversized.status}, JSON=${invalidJson.status}, PIN=${wrongPin.status}, stale=${staleView.status}.`,
        };
      }
      const decisionResponse = await request(
        `/api/shared/${offer.share_token}/decision`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(baseDecision) },
        new Map(),
      );
      let decision;
      try {
        decision = JSON.parse(decisionResponse.body);
      } catch {
        const diagnostic = decisionResponse.body
          .slice(0, 300)
          .replaceAll(pin, "[redacted]")
          .replaceAll(supabaseServiceKey, "[redacted]");
        return {
          status: 0,
          body: `Decision response was not JSON (HTTP ${decisionResponse.status}, ${decisionResponse.headers.get("content-type") ?? "no content type"}): ${diagnostic}`,
        };
      }
      if (decisionResponse.status !== 200 || decision?.outcome !== "accepted")
        return { status: 0, body: "Could not accept the current smoke offer revision." };
      const { data: items, error: itemsError } = await contractor
        .from("offer_items")
        .select("id, name, quantity, unit, specification, selling_rate_minor, labor_hours_per_unit")
        .eq("offer_id", reusedOfferId)
        .order("position", { ascending: true });
      if (itemsError || items?.length !== 1)
        return { status: 0, body: "Could not read the accepted smoke offer item." };
      const item = items[0];
      const before = {
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        unit: item.unit,
        specification: item.specification,
        selling_rate_minor: Number(item.selling_rate_minor),
        labor_hours_per_unit: Number(item.labor_hours_per_unit),
      };
      publishableChange = {
        expected_scope_revision: 1,
        expected_pending_change_id: null,
        supersession_confirmed: false,
        description: "Add one smoke-tested work item unit",
        target_deadline: today(),
        effects: [{ itemId: item.id, before, after: { ...before, quantity: 2 } }],
        commercial_adjustment_minor: "0",
      };
      return {
        status: 200,
        location: "",
        body: "Accepted current base revision through the public endpoint and prepared its item effect.",
      };
    },
    { status: 200, body: "Accepted current base revision" },
  ],
  [
    "accepted base decision is read-only and includes its recorded result",
    async () => {
      const page = await request(`/shared/${reusedShareToken}`, {}, new Map());
      return page;
    },
    {
      status: 200,
      body: ["Accepted offer", "Decision recorded"],
      absentBody: ["Your decision", "Accept offer", "Six-digit offer PIN"],
    },
  ],
  [
    "accepted overview shows effective values and history navigation",
    () => request(`/offers/${reusedOfferId}`),
    {
      status: 200,
      body: ["Current agreed work", "Current state", "History", 'data-current-amount-minor="300"'],
      absentBody: ["Offer version history", "awaiting customer acceptance"],
    },
  ],
  [
    "accepted offer row offers History and Propose change but no Edit",
    () => request(`/offers?customer=${reusedCustomerId}`),
    {
      status: 200,
      check: (actual) =>
        offerRowAttributes(actual.body, reusedOfferId).includes('data-can-edit="false"') &&
        offerRowAttributes(actual.body, reusedOfferId).includes('data-can-propose-change="true"') &&
        actual.body.includes(`/offers/${reusedOfferId}`),
    },
  ],
  [
    "accepted change task is directly available and linked from history",
    async () => {
      const change = await request(`/offers/${reusedOfferId}/changes/new`);
      const history = await request(`/offers/${reusedOfferId}/history`);
      const edit = await request(`/offers/${reusedOfferId}/edit`);
      return {
        ...change,
        body: `${change.body} history-actions:${history.body.includes('aria-label="Offer actions"')} edit:${edit.status}:${edit.body.includes("Offer editing unavailable")}`,
      };
    },
    {
      status: 200,
      body: [
        "Propose a change",
        "Current agreed scope",
        "Affected agreed work",
        "history-actions:true",
        "edit:404:true",
      ],
      absentBody: ["Change proposal unavailable"],
    },
  ],
  [
    "change publication rejects malformed effect details",
    () =>
      request(`/api/offers/${reusedOfferId}/changes/`, {
        method: "POST",
        form: { change_json: JSON.stringify({ ...publishableChange, effects: [{ itemId: "invalid" }] }) },
      }),
    { status: 400, body: "affected item" },
  ],
  [
    "change publication rejects stale scope revisions",
    () =>
      request(`/api/offers/${reusedOfferId}/changes/`, {
        method: "POST",
        form: { change_json: JSON.stringify({ ...publishableChange, expected_scope_revision: 999 }) },
      }),
    { status: 409, body: "scope changed" },
  ],
  [
    "anonymous contractor cannot publish a change",
    () =>
      request(
        `/api/offers/${reusedOfferId}/changes/`,
        { method: "POST", form: { change_json: JSON.stringify(publishableChange) } },
        new Map(),
      ),
    { status: 401, body: "Sign in" },
  ],
  [
    "foreign contractor's offer is unavailable for publication",
    () =>
      request(`/api/offers/${foreignOfferId}/changes/`, {
        method: "POST",
        form: { change_json: JSON.stringify(publishableChange) },
      }),
    { status: 404, body: "Offer is unavailable" },
  ],
  [
    "accepted offer publishes an estimated change through HTTP",
    () =>
      request(`/api/offers/${reusedOfferId}/changes/`, {
        method: "POST",
        form: { change_json: JSON.stringify(publishableChange) },
      }),
    {
      status: 201,
      body: ['"success":true', '"priceDeltaMinor":"300"'],
      check: (actual) => {
        try {
          publishedChangeId = JSON.parse(actual.body).changeId;
          return /^[0-9a-f-]{36}$/i.test(publishedChangeId);
        } catch {
          return false;
        }
      },
    },
  ],
  [
    "pending proposal links to history without changing the active amount",
    async () => {
      const detail = await request(`/offers/${reusedOfferId}`);
      const history = await request(
        `/offers/${reusedOfferId}/history?target=${publishedChangeId}&target_kind=change#change-${publishedChangeId}`,
      );
      const orderedHistory = await request(`/offers/${reusedOfferId}/history`);
      return {
        ...detail,
        body: `${detail.body} history-anchor:${history.body.includes(`id="change-${publishedChangeId}"`)}`,
        historyBody: history.body,
        orderedHistoryBody: orderedHistory.body,
        historyHeaders: history.headers,
      };
    },
    {
      status: 200,
      body: ["waiting for customer approval", 'data-current-amount-minor="300"', "history-anchor:true"],
      check: (actual) => {
        const events = [
          ...actual.orderedHistoryBody.matchAll(
            /data-history-kind="([^"]+)" data-history-at="([^"]+)" data-history-id="([^"]+)" data-history-priority="(\d+)" data-history-stable-id="([^"]+)"/g,
          ),
        ].map((match) => ({
          kind: match[1],
          at: Date.parse(match[2]),
          id: match[3],
          priority: Number(match[4]),
          stableId: match[5],
        }));
        return (
          actual.body.includes(
            `/history?target=${publishedChangeId}&amp;target_kind=change#change-${publishedChangeId}`,
          ) &&
          actual.historyHeaders.get("cache-control") === "no-store" &&
          actual.historyBody.includes("history-target") &&
          actual.historyBody.includes("Status at creation: pending") &&
          events.length >= 3 &&
          events.every(
            (event, index) =>
              index === 0 ||
              events[index - 1].at < event.at ||
              (events[index - 1].at === event.at &&
                (events[index - 1].priority < event.priority ||
                  (events[index - 1].priority === event.priority &&
                    events[index - 1].stableId.localeCompare(event.stableId) < 0))),
          )
        );
      },
    },
  ],
  [
    "public shared view separates agreed amount from pending proposal impact",
    async () => {
      if (!reusedShareToken) return { status: 0, body: "Missing accepted offer share token." };
      const anonymous = await request(`/shared/${reusedShareToken}`, {}, new Map());
      const signedIn = await request(`/shared/${reusedShareToken}`);
      const state = await request(`/api/shared/${reusedShareToken}/state`, {}, new Map());
      try {
        displayedChangeState = JSON.parse(state.body);
      } catch {
        displayedChangeState = null;
      }
      return {
        ...anonymous,
        signedIn,
        state,
        body: `${anonymous.body} signed-in-status:${signedIn.status} state:${state.status}:${state.headers.get("cache-control")}:${state.headers.get("referrer-policy")}`,
      };
    },
    {
      status: 200,
      body: [
        "Current total",
        "Revised smoke-tested scope",
        "Pending proposal",
        "Add one smoke-tested work item unit",
        "not included in the current total",
        "Proposed price impact",
        "Accept change",
        "Reject change",
        "Six-digit offer PIN",
      ],
      absentBody: ["Accept offer", "Reject offer", "price_breakdown", "labor_hours_per_unit"],
      check: (actual) =>
        actual.body.includes("signed-in-status:200") &&
        actual.body.includes("state:200:no-store:no-referrer") &&
        displayedChangeState?.target_kind === "change" &&
        displayedChangeState?.target_id === publishedChangeId &&
        (actual.body.match(/3,00 zł/g) ?? []).length >= 2,
    },
  ],
  [
    "superseded open proposal is blocked until the refreshed page shows the replacement",
    async () => {
      if (!displayedChangeState || !reusedShareToken) return { status: 0, body: "Missing displayed decision state." };
      replacedSmokeChangeId = publishedChangeId;
      const replacement = await request(`/api/offers/${reusedOfferId}/changes/`, {
        method: "POST",
        form: {
          change_json: JSON.stringify({
            ...publishableChange,
            expected_pending_change_id: replacedSmokeChangeId,
            supersession_confirmed: true,
            description: "Corrected smoke-tested change",
          }),
        },
      });
      if (replacement.status !== 201) return { status: 0, body: "Could not publish the replacement proposal." };
      try {
        publishedChangeId = JSON.parse(replacement.body).changeId;
      } catch {
        return { status: 0, body: "Could not read the replacement proposal ID." };
      }
      const staleDecision = await request(
        `/api/shared/${reusedShareToken}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_kind: "change",
            target_id: replacedSmokeChangeId,
            expected_base_revision: displayedChangeState.base_revision,
            expected_active_scope_revision: displayedChangeState.active_scope_revision,
            pin: reusedOfferPin,
            outcome: "accepted",
          }),
        },
        new Map(),
      );
      const state = await request(`/api/shared/${reusedShareToken}/state`, {}, new Map());
      const refreshedPage = await request(`/shared/${reusedShareToken}`, {}, new Map());
      let currentState;
      try {
        currentState = JSON.parse(state.body);
      } catch {
        currentState = null;
      }
      return {
        ...refreshedPage,
        body: `${refreshedPage.body} conflict:${staleDecision.status} state:${state.status}:${currentState?.target_id ?? "missing"}`,
      };
    },
    {
      status: 200,
      body: ["Corrected smoke-tested change", "Accept change", "conflict:409", `state:200:`],
      check: (actual) => actual.body.includes(`state:200:${publishedChangeId}`),
    },
  ],
  [
    "rejected change stays in history and leaves the active amount unchanged",
    async () => {
      const { data: shared, error: sharedError } = await sharedClient.rpc("get_shared_offer", {
        p_share_token: reusedShareToken,
      });
      if (sharedError || !shared?.active_scope_revision)
        return { status: 0, body: "Could not read the current scope revision." };
      const rejected = await request(
        `/api/shared/${reusedShareToken}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_kind: "change",
            target_id: publishedChangeId,
            expected_base_revision: shared.base_revision.revision,
            expected_active_scope_revision: shared.active_scope_revision,
            pin: reusedOfferPin,
            outcome: "rejected",
            rejection_comment: "Customer declined this change",
          }),
        },
        new Map(),
      );
      if (rejected.status !== 200) return { status: 0, body: "Could not reject the smoke proposal." };
      const retryBody = JSON.stringify({
        target_kind: "change",
        target_id: publishedChangeId,
        expected_base_revision: shared.base_revision.revision,
        expected_active_scope_revision: shared.active_scope_revision,
        pin: reusedOfferPin,
        outcome: "rejected",
        rejection_comment: "Customer declined this change",
      });
      for (let retry = 0; retry < 1; retry += 1) {
        const response = await request(
          `/api/shared/${reusedShareToken}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: retryBody,
          },
          new Map(),
        );
        if (response.status !== 200)
          return { status: 0, body: "Idempotent decision retry did not return its original result." };
      }
      const limited = await request(
        `/api/shared/${reusedShareToken}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: retryBody,
        },
        new Map(),
      );
      const detail = await request(`/offers/${reusedOfferId}`);
      const history = await request(`/offers/${reusedOfferId}/history`);
      const customerPage = await request(`/shared/${reusedShareToken}`, {}, new Map());
      return {
        ...detail,
        body: `${detail.body} history-reason:${history.body.includes("Customer declined this change")} limited:${limited.status} customer-result:${customerPage.body.includes("Customer comment: Customer declined this change")}:${customerPage.body.includes("Decision recorded")}`,
      };
    },
    {
      status: 200,
      body: ['data-current-amount-minor="300"', "history-reason:true", "limited:429", "customer-result:true:true"],
      absentBody: ["waiting for customer approval"],
    },
  ],
  [
    "history cursor controls browse every event exactly once",
    async () => {
      const identities = [];
      let pageCount = 0;
      let current = await request(`/offers/${reusedOfferId}/history?page_size=2`);
      while (pageCount < 20) {
        if (current.status !== 200)
          return { ...current, body: `History page failed: ${current.status} ${current.body}` };
        pageCount += 1;
        for (const [, kind, id] of current.body.matchAll(
          /data-history-kind="([^"]+)" data-history-at="[^"]+" data-history-id="([^"]+)"/g,
        ))
          identities.push(`${kind}:${id}`);
        const laterLink = current.body.match(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Later events\s*→/);
        if (!laterLink) break;
        const targetUrl = new URL(laterLink[1].replaceAll("&amp;", "&"), BASE_URL);
        current = await request(`${targetUrl.pathname}${targetUrl.search}`);
      }
      return {
        status: 200,
        body: `pages:${pageCount} events:${identities.length} unique:${new Set(identities).size}`,
      };
    },
    {
      status: 200,
      check: (actual) => {
        const values = Object.fromEntries(
          [...actual.body.matchAll(/(pages|events|unique):(\d+)/g)].map((match) => [match[1], Number(match[2])]),
        );
        return values.pages >= 2 && values.events > 2 && values.events === values.unique;
      },
    },
  ],
  [
    "invalid customer query shows a safe unavailable state",
    () => request("/offers?customer=invalid"),
    { status: 200, body: "Customer could not be loaded" },
  ],
  [
    "unknown customer query shows no customer data",
    () => request("/offers?customer=00000000-0000-4000-8000-000000000000"),
    { status: 200, body: ["Customer unavailable", "This customer is unavailable"] },
  ],
  [
    "foreign customer query is unavailable and does not reveal its offer",
    () => request(`/offers?customer=${foreignCustomerId}`),
    { status: 200, body: "Customer unavailable", absentBody: [foreignCustomerName, foreignScope] },
  ],
  [
    "signout clears session",
    () => request("/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/auth/signin" },
  ],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const normalizedBody = actual.body.replace(/&nbsp;|&#160;|&#xA0;/gi, " ").replace(/[\s\u00a0\u202f]+/g, " ");
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.locationPattern === undefined || expected.locationPattern.test(actual.location)) &&
    (expected.body === undefined ||
      (Array.isArray(expected.body)
        ? expected.body.every((value) => normalizedBody.includes(value))
        : normalizedBody.includes(expected.body))) &&
    (expected.absentBody === undefined || expected.absentBody.every((value) => !normalizedBody.includes(value))) &&
    (expected.check === undefined || expected.check(actual));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? expected.locationPattern ?? ""}`);
    if (Array.isArray(expected.body)) {
      const missing = expected.body.filter((value) => !normalizedBody.includes(value));
      if (missing.length) console.log(`      missing visible text: ${missing.join(" | ")}`);
    }
    if (actual.status === 0) console.log(`      ${actual.body}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
