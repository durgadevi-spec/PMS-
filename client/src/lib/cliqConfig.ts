// ---------------------------------------------------------------------------
// Zoho Cliq deep-link configuration (Phase 1: launcher only, no API/OAuth)
//
// Cliq is hosted on a different domain per Zoho data center. Set this to the
// domain your organization's Cliq account actually uses — check the URL bar
// while logged into Cliq in a browser.
//
//   US: cliq.zoho.com   | EU: cliq.zoho.eu       | IN: cliq.zoho.in
//   AU: cliq.zoho.com.au | CN: cliq.zoho.com.cn  | JP: cliq.zoho.jp
//
// Docs: https://www.zoho.com/cliq/help/platform/deep-linking.html
// ---------------------------------------------------------------------------
export const CLIQ_BASE_URL = "https://cliq.zoho.in";

/**
 * Deep link that opens a native Cliq direct-message conversation with the
 * given user's email. This is a plain URL, not an API call — it hands the
 * browser off to Cliq's own app, where Cliq's real-time chat, history,
 * presence, attachments, and notifications all work unmodified.
 */
export function buildCliqUserDeepLink(email: string) {
  return `${CLIQ_BASE_URL}/users/${encodeURIComponent(email.trim())}`;
}