// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

import { URL } from "node:url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
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
let foreignCustomerId = null;
let offerId = null;
let foreignOfferId = null;
let firstGeneratedPin = null;

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
    "offer creation form renders trade template selection for signed-in user",
    () => request("/offers/new"),
    {
      status: 200,
      body: ["Choose a template (optional)", "Start work items from a trade template", "Starter prompts"],
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
      body: ["Offer details", "Smoke-tested original scope"],
      check: () => Boolean(createdCustomerId && offerId),
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
    "new-customer offer group renders scope, status, current price, and deadline",
    () => request(`/offers?customer=${createdCustomerId}`),
    { status: 200, body: [customerName, "Smoke-tested original scope", "pending", "1", today()] },
  ],
  [
    "offer card exposes configured PIN state without secrets",
    async () => {
      const page = await request(`/offers?customer=${createdCustomerId}`);
      offerId = offerIdFromPage(page.body);
      return { ...page, body: `${page.body}${page.body.includes("Not configured") ? "Not configured" : ""}` };
    },
    { status: 200, body: "Not configured", check: () => Boolean(offerId) },
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
    () => request(`/offers?customer=${createdCustomerId}`),
    {
      status: 200,
      body: "Configured",
      absentBody: [firstGeneratedPin ?? "INVALID_PIN_SENTINEL", "share_token", "pin_hash"],
    },
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
    "pending offer revision is recorded atomically",
    () =>
      request(`/api/offers/${reusedOfferId}/revision`, {
        method: "POST",
        form: {
          expected_revision: "1",
          base_scope: "Revised smoke-tested scope",
          base_deadline: today(),
          items_json: JSON.stringify(standardItems(300)),
        },
      }),
    { status: 200, body: '"revision":2' },
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
    "invalid customer query shows a safe unavailable state",
    () => request("/offers?customer=invalid"),
    { status: 200, body: "This customer could not be loaded" },
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
