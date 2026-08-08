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
  emergencyMessage: string;
  batteryLevel?: number;
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
    `Time: ${p.timestamp}`,
    p.batteryLevel !== undefined ? `Battery: ${p.batteryLevel}%` : null,
    "Please respond immediately.",
    `Event reference: ${p.eventId}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Dispatches an emergency SOS alert to all trusted contacts over SMS and email,
 * containing the user's name, a timestamp, and a Google Maps live-location link.
 *
 * No SMS/email provider credentials are configured yet, so dispatch is recorded
 * and logged here as the delivery record. Swap the sendSms/sendEmail bodies for
 * a real gateway (e.g. Twilio for SMS, Resend/Nodemailer for email) when
 * credentials are added.
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

async function sendSms(
  contact: { name: string; phone: string },
  body: string,
): Promise<boolean> {
  console.info(`[SOS:SMS] To ${contact.name} <${contact.phone}>\n${body}`);
  return true;
}

async function sendEmail(
  contact: { name: string; phone: string; email?: string | null },
  body: string,
): Promise<boolean> {
  console.info(`[SOS:EMAIL] To ${contact.name} <${contact.email}>\n${body}`);
  return true;
}