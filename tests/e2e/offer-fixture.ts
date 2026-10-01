import process from "node:process";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";
import { parseEnv } from "node:util";
import { expect, type APIRequestContext } from "@playwright/test";

interface OfferRow {
  id: string;
  customer_id: string;
  share_token: string;
}
interface RevisionRow {
  id: string;
  revision: number;
}
interface ItemRow {
  id: string;
  name: string;
  quantity: number | string;
  unit: string;
  specification: string;
  selling_rate_minor: number | string;
  labor_hours_per_unit: number | string;
}

export class OfferFixture {
  readonly token = `e2e-risk3-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  readonly deadline = "2099-01-15";
  offerId = "";
  changeId = "";
  private shareToken = "";
  private pin = "";
  private revisionId = "";
  private readonly backend: string;
  private headers: Record<string, string>;

  constructor(
    private readonly request: APIRequestContext,
    private readonly baseURL: string,
  ) {
    const env = parseEnv(readFileSync(".dev.vars", "utf8"));
    const backend = env.SUPABASE_URL;
    if (!backend || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(backend).hostname)) {
      throw new Error("Fixture cleanup requires local Supabase in .dev.vars.");
    }
    this.backend = backend;
    const anonKey = env.SUPABASE_KEY;
    if (!anonKey) throw new Error("Local Supabase anonymous key is missing.");
    this.headers = { apikey: anonKey };
  }

  async rows<T>(table: string, query: string): Promise<T[]> {
    const response = await this.request.get(`${this.backend}/rest/v1/${table}?${query}`, { headers: this.headers });
    expect(response.ok(), `Local fixture read failed: ${table}, HTTP ${response.status()}`).toBe(true);
    const value = (await response.json()) as unknown;
    expect(Array.isArray(value)).toBe(true);
    return value as T[];
  }

  async create() {
    const login = await this.request.post(`${this.backend}/auth/v1/token?grant_type=password`, {
      headers: this.headers,
      data: { email: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD },
    });
    expect(login.ok(), "Local fixture authentication failed").toBe(true);
    const session = (await login.json()) as { access_token: string };
    this.headers.Authorization = `Bearer ${session.access_token}`;

    const response = await this.request.post(`${this.baseURL}/api/offers`, {
      headers: { Origin: new URL(this.baseURL).origin },
      maxRedirects: 0,
      form: {
        customer_name: this.token,
        base_scope: "Agreed wall painting",
        base_deadline: this.deadline,
        items_json: JSON.stringify([
          {
            name: "Painted wall",
            quantity: 1,
            unit: "piece",
            specification: "White finish",
            selling_rate_minor: 10000,
            labor_hours_per_unit: 1,
          },
        ]),
      },
    });
    expect(response.status()).toBe(302);
    const offers = await this.rows<OfferRow>(
      "offers",
      `select=id,customer_id,share_token&customer_id=in.(${(await this.rows<{ id: string }>("customers", `select=id&name=eq.${this.token}`)).map((row) => row.id).join(",")})`,
    );
    expect(offers).toHaveLength(1);
    const offer = offers[0];
    this.offerId = offer.id;
    this.shareToken = offer.share_token;
    const revisions = await this.rows<RevisionRow>("offer_revisions", `select=id,revision&offer_id=eq.${this.offerId}`);
    expect(revisions).toHaveLength(1);
    this.revisionId = revisions[0].id;
    const pinResponse = await this.request.post(`${this.baseURL}/api/offers/${this.offerId}/pin`, {
      headers: { Origin: new URL(this.baseURL).origin },
    });
    expect(pinResponse.ok(), "PIN setup failed; sensitive response omitted").toBe(true);
    this.pin = ((await pinResponse.json()) as { pin: string }).pin;
    expect(/^\d{6}$/.test(this.pin)).toBe(true);
  }

  async decide(kind: "base" | "change", outcome: "accepted" | "rejected") {
    const response = await this.request.post(`${this.baseURL}/api/shared/${this.shareToken}/decision`, {
      headers: { Origin: new URL(this.baseURL).origin },
      data: {
        target_kind: kind,
        target_id: kind === "base" ? this.revisionId : this.changeId,
        expected_base_revision: 1,
        expected_active_scope_revision: 1,
        pin: this.pin,
        outcome,
        rejection_comment: outcome === "rejected" ? "Keep the original agreement" : undefined,
      },
    });
    expect(response.ok(), "Customer decision failed; sensitive request omitted").toBe(true);
  }

  async publish() {
    const items = await this.rows<ItemRow>(
      "offer_items",
      `select=id,name,quantity,unit,specification,selling_rate_minor,labor_hours_per_unit&offer_id=eq.${this.offerId}`,
    );
    expect(items).toHaveLength(1);
    const before = {
      ...items[0],
      quantity: Number(items[0].quantity),
      selling_rate_minor: Number(items[0].selling_rate_minor),
      labor_hours_per_unit: Number(items[0].labor_hours_per_unit),
    };
    const response = await this.request.post(`${this.baseURL}/api/offers/${this.offerId}/changes/`, {
      headers: { Origin: new URL(this.baseURL).origin },
      form: {
        change_json: JSON.stringify({
          expected_scope_revision: 1,
          expected_pending_change_id: null,
          supersession_confirmed: false,
          description: `${this.token} double the painted wall`,
          target_deadline: "2099-01-22",
          effects: [{ itemId: before.id, before, after: { ...before, quantity: 2 } }],
          commercial_adjustment_minor: "0",
        }),
      },
    });
    expect(response.status()).toBe(201);
    this.changeId = ((await response.json()) as { changeId: string }).changeId;
    expect(this.changeId).toMatch(/^[0-9a-f-]{36}$/i);
  }

  cleanup() {
    // The app has no deletion endpoint. Cleanup is restricted to the local Docker database.
    if (!/^e2e-risk3-[a-z0-9-]+$/.test(this.token)) throw new Error("Invalid fixture token");
    const config = readFileSync("supabase/config.toml", "utf8");
    const project = /^project_id = "([a-z0-9-]+)"/m.exec(config)?.[1];
    if (!project) throw new Error("Local Supabase project ID is missing");
    const sql = `BEGIN;
      CREATE TEMP TABLE fixture_offers AS SELECT id FROM public.offers WHERE customer_id IN (SELECT id FROM public.customers WHERE name = '${this.token}');
      CREATE TEMP TABLE fixture_changes AS SELECT id FROM public.offer_changes WHERE offer_id IN (SELECT id FROM fixture_offers);
      DELETE FROM public.offers WHERE id IN (SELECT id FROM fixture_offers);
      DELETE FROM public.customers WHERE name = '${this.token}';
      SELECT (SELECT count(*) FROM public.customers WHERE name = '${this.token}')
        + (SELECT count(*) FROM public.offers WHERE id IN (SELECT id FROM fixture_offers))
        + (SELECT count(*) FROM public.offer_items WHERE offer_id IN (SELECT id FROM fixture_offers))
        + (SELECT count(*) FROM public.offer_revisions WHERE offer_id IN (SELECT id FROM fixture_offers))
        + (SELECT count(*) FROM public.offer_changes WHERE offer_id IN (SELECT id FROM fixture_offers))
        + (SELECT count(*) FROM public.change_decisions WHERE offer_change_id IN (SELECT id FROM fixture_changes));
      COMMIT;`;
    const result = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        `supabase_db_${project}`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", timeout: 15000 },
    );
    expect(result.status, "Local fixture cleanup must succeed").toBe(0);
    expect(result.stdout.trim(), "No fixture residue may remain in any written table").toBe("0");
  }
}
