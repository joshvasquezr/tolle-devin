// Magic-link email (D§3.12). No provider is configured yet; without one, sending is a no-op and the
// request still answers 202. Never logs addresses or links (SPEC §7).
export interface Mailer {
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}
export const noMailer: Mailer = { send: async () => {} };

/** Local development and Playwright only (`wrangler dev --var DEV_MAIL:1`); never configured in wrangler.jsonc. */
export const devOutbox = new Map<string, { to: string; subject: string; text: string }>();
export const devMailer: Mailer = { send: async (m) => void devOutbox.set(m.to, m) };
