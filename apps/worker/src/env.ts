// Bindings declared in wrangler.jsonc. Kept structural so tests need no Workers runtime.
export interface AssetsBinding {
  fetch(input: Request | string): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsBinding;
}
