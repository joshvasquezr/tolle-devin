// Bindings declared in wrangler.jsonc. Kept structural so tests need no Workers runtime.
export interface AssetsBinding {
  fetch(input: Request | string): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
  /** P5: absent until ESV is enabled (compliance-gated). */
  ESV_BUDGET?: DoNamespace;
}

/** Durable Object namespace, structural subset (D§3.12 EsvBudget). */
export interface DoNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: Request | string, init?: RequestInit): Promise<Response> };
}
