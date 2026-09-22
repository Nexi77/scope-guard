import type { APIRoute } from "astro";

export const GET: APIRoute = (context) => context.redirect("/dashboard");
