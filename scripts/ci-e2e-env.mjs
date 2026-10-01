import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { URL } from "node:url";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";

// Run from the checkout root. The ownership record is private and ignored alongside auth state.
const statePath = "playwright/.auth/ci-env.json";
const environmentPaths = [".env", ".dev.vars"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

class SafeFailure extends Error {}

function fail(message) {
  throw new SafeFailure(message);
}

function validateLocal(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("Local backend URL is invalid.");
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.protocol !== "http:") {
    fail("CI provisioning requires a loopback HTTP backend.");
  }
}

function adminClient(state) {
  validateLocal(state.url);
  return createClient(state.url, state.adminKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function saveState(state, exclusive = false) {
  writeFileSync(statePath, JSON.stringify(state), { mode: 0o600, flag: exclusive ? "wx" : "w" });
}

async function cleanup(state) {
  if (
    !/^[0-9a-f-]{36}$/.test(state.runId ?? "") ||
    state.email !== `scopeguard-ci-${state.runId}@example.test` ||
    !state.files ||
    Object.entries(state.files).some(([path, hash]) => !environmentPaths.includes(path) || !/^[0-9a-f]{64}$/.test(hash))
  ) {
    fail("CI ownership record is invalid.");
  }
  // Refuse to remove a replaced/edited developer file, even if an ownership record remains.
  for (const [path, hash] of Object.entries(state.files)) {
    if (
      existsSync(path) &&
      (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink() || digest(readFileSync(path)) !== hash)
    ) {
      fail("Generated configuration changed; cleanup refused to delete it.");
    }
  }
  if (state.userId) {
    const admin = adminClient(state);
    const { data, error } = await admin.auth.admin.getUserById(state.userId);
    if (error && error.status !== 404) fail("Could not verify the owned CI user for cleanup.");
    if (data?.user) {
      if (data.user.email !== state.email || data.user.user_metadata?.scopeguard_ci_run !== state.runId) {
        fail("CI user ownership differs; cleanup refused.");
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(state.userId);
      if (deleteError) fail("Could not delete the owned CI user.");
    }
  }
  for (const path of Object.keys(state.files)) {
    if (existsSync(path)) unlinkSync(path);
  }
  unlinkSync(statePath);
}

async function prepare() {
  if ([statePath, ...environmentPaths].some((path) => existsSync(path))) {
    fail("CI provisioning refuses to overwrite existing configuration or ownership state.");
  }
  let local;
  try {
    local = parseEnv(
      execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    );
  } catch {
    fail("Local Supabase status unavailable; private command output omitted.");
  }
  validateLocal(local.API_URL);
  if (!local.ANON_KEY || !local.SERVICE_ROLE_KEY || !(local.SECRET_KEY ?? local.SERVICE_ROLE_KEY)) {
    fail("Local Supabase status is missing required credentials.");
  }
  const runId = randomUUID();
  const state = {
    runId,
    url: local.API_URL,
    adminKey: local.SECRET_KEY ?? local.SERVICE_ROLE_KEY,
    email: `scopeguard-ci-${runId}@example.test`,
    userId: null,
    files: {},
  };
  mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 });
  saveState(state, true);
  try {
    const password = randomBytes(32).toString("base64url");
    const { data, error } = await adminClient(state).auth.admin.createUser({
      email: state.email,
      password,
      email_confirm: true,
      user_metadata: { scopeguard_ci_run: runId },
    });
    if (error || !data.user) fail("Could not create the dedicated local CI user.");
    state.userId = data.user.id;
    saveState(state);
    const app = `SUPABASE_URL=${local.API_URL}\nSUPABASE_KEY=${local.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${local.SERVICE_ROLE_KEY}\n`;
    const files = { ".env": `${app}E2E_USERNAME=${state.email}\nE2E_PASSWORD=${password}\n`, ".dev.vars": app };
    for (const [path, contents] of Object.entries(files)) {
      writeFileSync(path, contents, { mode: 0o600, flag: "wx" });
      state.files[path] = digest(contents);
      saveState(state);
    }
    console.log("Dedicated local CI user and private configuration prepared.");
  } catch {
    try {
      await cleanup(state);
    } catch {
      fail("CI preparation failed; owned cleanup remains pending. Run cleanup before retrying.");
    }
    fail("CI preparation failed; owned resources cleaned up. Private error details omitted.");
  }
}

try {
  if (process.argv[2] === "prepare") {
    await prepare();
  } else if (process.argv[2] === "cleanup") {
    if (existsSync(statePath)) {
      if (lstatSync(statePath).isSymbolicLink() || !lstatSync(statePath).isFile())
        fail("CI ownership record is invalid.");
      await cleanup(JSON.parse(readFileSync(statePath, "utf8")));
    }
    console.log("Owned CI resources cleaned up.");
  } else {
    fail("Usage: node scripts/ci-e2e-env.mjs prepare|cleanup (from checkout root).");
  }
} catch (error) {
  // Only our fixed messages may reach logs; SDK, filesystem and command bodies stay private.
  const message =
    error instanceof SafeFailure ? error.message : "CI environment operation failed; private error details omitted.";
  console.error(message);
  process.exitCode = 1;
}
