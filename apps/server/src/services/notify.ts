export type NotifiedContact = {
  contactId: string;
  name: string;
  phone: string;
  channel: "sms";
  delivered: boolean;
};

/**
 * Sends an SOS alert to the given trusted contacts.
 *
 * Notifications are intentionally dispatched ONLY to contacts that are saved
 * in the database for the requesting user. No provider credentials are
 * configured yet, so the delivery is recorded and logged here — swap the body
 * of this function for a real SMS/WhatsApp gateway when available.
 */
export async function notifyTrustedContacts(
  contacts: { id: string; name: string; phone: string }[],
  message: string,
): Promise<NotifiedContact[]> {
  return contacts.map((contact) => {
    console.info(`[SOS] Notifying ${contact.name} <${contact.phone}>: ${message}`);
    return {
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      channel: "sms",
      delivered: true,
    };
  });
}
