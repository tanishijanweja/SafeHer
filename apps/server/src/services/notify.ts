export type NotifyContact = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
};

export type NotifyChannel = "sms" | "email";

export type NotifiedContact = {
  contactId: string;
  name: string;
  phone: string;
  channel: NotifyChannel;
  delivered: boolean;
};

export type SosAlertPayload = {
  userName: string;
  timestamp: string;
  mapsUrl: string | null;
  coordinates: string | null;
  /** Optional readable place name/note, rendered as plain text. */
  location?: string | null;
  emergencyMessage: string;
  batteryLevel?: number;
  audioUrl?: string | null;
  eventId: string;
};

/** Human-readable alert that goes into the SMS and email bodies. */
function buildAlertBody(p: SosAlertPayload): string {
  const lines = [
    `SOS from ${p.userName}`,
    p.emergencyMessage,
    p.mapsUrl
      ? `Live location: ${p.mapsUrl}`
      : p.coordinates
        ? `Location: ${p.coordinates}`
        : null,
    p.audioUrl ? `Live audio: ${p.audioUrl}` : null,
    p.location ? `Location note: ${p.location}` : null,
    `Time: ${p.timestamp}`,
    p.batteryLevel !== undefined ? `Battery: ${p.batteryLevel}%` : null,
    "Please respond immediately.",
    `Event reference: ${p.eventId}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Dispatches an emergency SOS alert to all trusted contacts over SMS and email,
 * containing the user's name, a timestamp, a Google Maps live-location link and
 * (when available) a link to the live audio clip.
 *
 * SMS uses Twilio when TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_PHONE_NUMBER are configured; otherwise the delivery is recorded and
 * logged here so the flow can be tested without credentials.
 */
export async function notifyTrustedContacts(
  contacts: NotifyContact[],
  payload: SosAlertPayload,
): Promise<NotifiedContact[]> {
  const body = buildAlertBody(payload);
  const notified: NotifiedContact[] = [];

  for (const contact of contacts) {
    const smsDelivered = await sendSms(contact, body);
    notified.push({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      channel: "sms",
      delivered: smsDelivered,
    });

    if (contact.email) {
      const emailDelivered = await sendEmail(contact, body);
      notified.push({
        contactId: contact.id,
        name: contact.name,
        phone: contact.phone,
        channel: "email",
        delivered: emailDelivered,
      });
    }
  }

  return notified;
}

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;
const twilioConfigured = Boolean(TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM);

/** Mask a phone number so only the last four digits remain visible. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "(none)";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${(local ?? "").slice(0, 1)}***@${domain}`;
}

/** Best-effort E.164 conversion; assumes +91 for local Indian numbers. */
function toE164(raw: string): string {
  const trimmed = raw.trim();
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length <= 11) return `+91${digits}`;
  return `+${digits}`;
}

/** Never fake a delivered alert in production — if Twilio is missing, fail loud. */
const mockDeliveryAllowed = process.env.NODE_ENV !== "production";

async function sendSms(
  contact: { name: string; phone: string },
  body: string,
): Promise<boolean> {
  if (!twilioConfigured) {
    if (!mockDeliveryAllowed) {
      console.error(
        `[SOS:SMS] Twilio not configured in production — NOT delivering to ${maskPhone(contact.phone)}`,
      );
      return false;
    }
    console.info(
      `[SOS:SMS] Mock-delivered to ${maskPhone(contact.phone)} (${body.length} chars, no Twilio configured)`,
    );
    return true;
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: TWILIO_FROM!,
          To: toE164(contact.phone),
          Body: body,
        }).toString(),
      },
    );
    if (!res.ok) {
      console.error(
        `[SOS:SMS] Twilio error ${res.status} for ${maskPhone(contact.phone)}`,
      );
      return false;
    }
    console.info(`[SOS:SMS] Delivered to ${maskPhone(contact.phone)} via Twilio`);
    return true;
  } catch (error) {
    console.error("[SOS:SMS] Failed to deliver via Twilio.", error);
    return false;
  }
}

async function sendEmail(
  contact: { name: string; phone: string; email?: string | null },
  body: string,
): Promise<boolean> {
  // No mail transport is wired up yet; never log the full alert body (it
  // contains the live-location link + name). Record delivery as not-reached.
  if (contact.email) {
    console.info(
      `[SOS:EMAIL] Would email ${maskEmail(contact.email)} (${body.length} chars, no mail transport)`,
    );
  }
  return false;
}