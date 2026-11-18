// Magic-link email (D§3.12). No provider is configured yet; without one, sending is a no-op and the
// request still answers 202. Never logs addresses or links (SPEC §7).
export interface Mailer {
  send(msg: { to: string; subject: string; text: string }): Promise<void>;
}
export const noMailer: Mailer = { send: async () => {} };
