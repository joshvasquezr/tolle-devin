// Bindings declared in wrangler.jsonc. Kept structural so tests need no Workers runtime.
export interface AssetsBinding {
  fetch(input: Request | string): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
  /** P5: absent until ESV is enabled (compliance-gated). */
  ESV_BUDGET?: DoNamespace;
  /** Worker secret (`wrangler secret put ESV_API_KEY`); only ever sent upstream in the Authorization header. */
  ESV_API_KEY?: string;
  /** Compliance gate: ESV endpoints answer only when "1" (P5.8 checks pass and Josh enables it). */
  ESV_ENABLED?: string;
  /** Local Playwright only: base URL replacing https://api.esv.org/v3/ (a placeholder-text mock). */
  ESV_UPSTREAM?: string;
  /** P6: accounts and sync (D§4.2). */
  DB?: import("./db.ts").D1;
  /** Magic-link email sender; none configured yet (sending is a no-op). */
  MAILER?: import("./auth/mail.ts").Mailer;
  /** "1" only under local `wrangler dev` (Playwright mail sink). */
  DEV_MAIL?: string;
  /** Workers Analytics Engine dataset for anonymous counters (P7.4); optional. */
  METRICS?: import("./metrics.ts").AnalyticsEngine;
}

/** Durable Object namespace, structural subset (D§3.12 EsvBudget). */
export interface DoNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}
