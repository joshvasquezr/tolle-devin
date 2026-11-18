// D§3.12 Auth: 32-byte random tokens; only SHA-256 hashes are stored.
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const randomHex = (bytes: number) => hex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
