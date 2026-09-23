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

async function request(path, { method = "GET", form } = {}, session = jar) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(session),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response, session);
  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

function customerIdFromLocation(location) {
  return new URL(location, BASE_URL).searchParams.get("customer");
}

const customerName = `Smoke customer ${Date.now()}`;
const foreignCustomerName = `Foreign smoke customer ${Date.now()}`;
const foreignScope = "Foreign contractor private scope";
let createdCustomerId = null;
let reusedCustomerId = null;
let foreignCustomerId = null;

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
  ["offer creation form renders for signed-in user", () => request("/offers/new"), { status: 200 }],
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
    "offer creation redirects to confirmation",
    async () => {
      const creation = await request("/api/offers", {
        method: "POST",
        form: {
          customer_name: customerName,
          confirm_duplicate: "false",
          base_scope: "Smoke-tested original scope",
          base_amount: "1,250.00",
          base_deadline: today(),
        },
      });
      createdCustomerId = customerIdFromLocation(creation.location);
      return creation;
    },
    {
      status: 302,
      locationPattern: /^\/offers\/new\?created=1&customer=[0-9a-f-]{36}$/i,
      check: () => Boolean(createdCustomerId),
    },
  ],
  [
    "new-customer creation confirmation links to the owned customer group",
    () => request(`/offers/new?created=1&customer=${createdCustomerId}`),
    {
      status: 200,
      body: ["Offer created", "View this customer’s offers", "Create another offer"],
      check: (actual) => actual.body.includes(`/offers?customer=${createdCustomerId}`),
    },
  ],
  [
    "new-customer offer group renders scope, status, current price, and deadline",
    () => request(`/offers?customer=${createdCustomerId}`),
    { status: 200, body: [customerName, "Smoke-tested original scope", "pending", "1", today()] },
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
          base_amount: "2.50",
          base_deadline: today(),
        },
      });
      reusedCustomerId = customerId;
      return created;
    },
    { status: 302, locationPattern: /^\/offers\/new\?created=1&customer=[0-9a-f-]{36}$/i },
  ],
  [
    "offer creation confirmation renders",
    () => request("/offers/new?created=1"),
    { status: 200, body: "Offer created" },
  ],
  [
    "reused-customer confirmation links to the same group",
    async () => {
      return request(`/offers/new?created=1&customer=${reusedCustomerId}`);
    },
    {
      status: 200,
      body: "Offer created",
      check: (actual) => actual.body.includes(`/offers?customer=${reusedCustomerId}`),
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
        "1250,00 zł",
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
            base_amount: "9.99",
            base_deadline: today(),
          },
        },
        foreignJar,
      );
      foreignCustomerId = customerIdFromLocation(creation.location);
      return { ...creation, body: foreignCustomerId ? "foreign-customer-created" : creation.body };
    },
    {
      status: 302,
      locationPattern: /^\/offers\/new\?created=1&customer=[0-9a-f-]{36}$/i,
      body: "foreign-customer-created",
    },
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
