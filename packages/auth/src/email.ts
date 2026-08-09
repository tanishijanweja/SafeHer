/**
 * Transactional email service. Uses the Resend REST API when a key + from
 * address are configured; otherwise it prints the message to the server
 * console in development (so the reset/verify link stays usable locally) and
 * does NOTHING in production (the feature is safely off — no token is ever
 * returned to a client, and nothing is leaked to logs).
 */

export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendTransactionalEmail(email: TransactionalEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (apiKey && from) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html, text: email.text }),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Resend HTTP ${res.status}: ${detail}`);
    }
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(`[email] dev mode — no provider configured\n  to: ${email.to}\n  subject: ${email.subject}\n  ---\n${email.text}\n  ---`);
    return true;
  }

  console.warn(`[email] no provider configured — not delivering mail to ${email.to}`);
  return false;
}