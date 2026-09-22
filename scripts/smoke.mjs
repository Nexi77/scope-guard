// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
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

const customerName = `Smoke customer ${Date.now()}`;

const steps = [
  ["root redirects to dashboard", () => request("/"), { status: 302, location: "/dashboard" }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
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
    () =>
      request("/api/offers", {
        method: "POST",
        form: {
          customer_name: customerName,
          confirm_duplicate: "false",
          base_scope: "Smoke-tested original scope",
          base_amount: "1,250.00",
          base_deadline: today(),
        },
      }),
    { status: 302, location: "/offers/new?created=1" },
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
      return request("/api/offers", {
        method: "POST",
        form: {
          customer_id: customerId,
          base_scope: "Smoke-tested reused customer scope",
          base_amount: "2.50",
          base_deadline: today(),
        },
      });
    },
    { status: 302, location: "/offers/new?created=1" },
  ],
  [
    "offer creation confirmation renders",
    () => request("/offers/new?created=1"),
    { status: 200, body: "Offer created" },
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
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.body === undefined || actual.body.includes(expected.body));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
    if (actual.status === 0) console.log(`      ${actual.body}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);
