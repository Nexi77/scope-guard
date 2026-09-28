declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}

declare module "cloudflare:workers" {
  interface Env {
    DECISION_LIMITER?: {
      limit(input: { key: string }): Promise<{ success: boolean }>;
    };
  }

  export const env: Env;
}
