// server/calendarRsvp.ts
//
// Lets a GUEST who has no login (an external client/vendor invited by email)
// Accept / Decline / Propose a new time by clicking a link in their invite
// email — no account needed. The link carries a signed token so nobody can
// forge a response on someone else's behalf or for an event they weren't
// invited to.
//
// Internal (logged-in) guests use the normal authenticated
// POST /api/calendar-events/:id/respond route instead; this file is only
// for the public, token-based path.

import crypto from "crypto";

const RSVP_SECRET =
    process.env.CALENDAR_RSVP_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET || // reuse another already-configured secret if present
    "dev-insecure-calendar-rsvp-secret";

if (!process.env.CALENDAR_RSVP_SECRET) {
    console.warn(
        "⚠️  CALENDAR_RSVP_SECRET is not set — falling back to a less-secure derived secret. " +
        "Set CALENDAR_RSVP_SECRET in .env for production."
    );
}

// Token = eventId + guest email, signed. Doesn't need to be stored anywhere;
// it's recomputed and compared on the way in, so it works even for guests
// who never created an account.
export function generateRsvpToken(eventId: string, email: string): string {
    const payload = `${eventId}:${email.trim().toLowerCase()}`;
    return crypto.createHmac("sha256", RSVP_SECRET).update(payload).digest("hex").slice(0, 32);
}

export function verifyRsvpToken(eventId: string, email: string, token: string): boolean {
    if (!eventId || !email || !token) return false;
    const expected = generateRsvpToken(eventId, email);
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
    } catch {
        return false;
    }
}

export function buildRsvpLink(appUrl: string, eventId: string, email: string, status: "accepted" | "declined") {
    const token = generateRsvpToken(eventId, email);
    const params = new URLSearchParams({ event: eventId, email, token, status });
    return `${appUrl}/api/calendar-rsvp/respond?${params.toString()}`;
}

export function buildProposeLink(appUrl: string, eventId: string, email: string) {
    const token = generateRsvpToken(eventId, email);
    const params = new URLSearchParams({ event: eventId, email, token });
    return `${appUrl}/api/calendar-rsvp/propose?${params.toString()}`;
}

// For the ORGANIZER to accept/decline a guest's proposed new time straight
// from the notification email. Token is keyed on eventId+guestEmail (the
// guest who proposed) — whoever holds this link (the organizer, since it's
// only ever emailed to them) can resolve that specific proposal.
export function buildResolveProposalLink(appUrl: string, eventId: string, guestEmail: string, action: "accept" | "decline") {
    const token = generateRsvpToken(eventId, guestEmail);
    const params = new URLSearchParams({ event: eventId, guestEmail, token, action });
    return `${appUrl}/api/calendar-rsvp/resolve-proposal?${params.toString()}`;
}