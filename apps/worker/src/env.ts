// Bindings declared in wrangler.jsonc. Kept structural so tests need no Workers runtime.
export interface AssetsBinding {
  fetch(input: Request | string): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
  /** P5: absent until ESV is enabled (compliance-gated). */
  ESV_BUDGET?: DoNamespace;
  /** P6: accounts and sync (D§4.2). */
  DB?: import("./db.ts").D1;
  /** Magic-link email sender; none configured yet (sending is a no-op). */
  MAILER?: import("./auth/mail.ts").Mailer;
}

/** Durable Object namespace, structural subset (D§3.12 EsvBudget). */
export interface DoNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}
