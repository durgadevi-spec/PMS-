// server/googleCalendar.ts
//
// Handles Google OAuth2 (connect/refresh) and two-way Google Calendar sync.
// Uses plain fetch (Node 22 global fetch) — no googleapis dependency needed.

import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "./db.ts";
import { googleCalendarAccounts, calendarEvents } from "../shared/schema.ts";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "";

const SCOPE = "https://www.googleapis.com/auth/calendar.events email profile";
const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_API = "https://www.googleapis.com/calendar/v3";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.warn(
        "⚠️  Google Calendar sync is not configured — missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in .env"
    );
}

/* ============================================================
   OAuth: build consent URL, exchange code, refresh tokens
============================================================ */

// `state` carries the internal user id so we know who's connecting
// when Google redirects back to /api/google/callback.
export function getGoogleAuthUrl(userId: string): string {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: "code",
        access_type: "offline", // required to get a refresh_token
        prompt: "consent", // force refresh_token even on repeat connects
        scope: SCOPE,
        state: userId,
    });
    return `${AUTH_BASE}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string) {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Google token exchange failed: ${JSON.stringify(data)}`);
    }
    return data as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
        token_type: string;
        id_token?: string;
    };
}

async function refreshAccessToken(refreshToken: string) {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
        }),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Google token refresh failed: ${JSON.stringify(data)}`);
    }
    return data as { access_token: string; expires_in: number };
}

async function fetchGoogleProfileEmail(accessToken: string): Promise<string> {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    return data.email || "unknown";
}

/* ============================================================
   Handle the OAuth callback: save tokens for this user
============================================================ */
export async function handleGoogleCallback(userId: string, code: string) {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
        // Happens if the user had already granted consent before and Google
        // doesn't resend a refresh_token. We force `prompt=consent` above to
        // avoid this, but guard anyway.
        throw new Error(
            "Google did not return a refresh token. Please disconnect and reconnect, granting access again."
        );
    }

    const email = await fetchGoogleProfileEmail(tokens.access_token);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);

    await db
        .insert(googleCalendarAccounts)
        .values({
            userId,
            googleEmail: email,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry: expiry,
            calendarId: "primary",
        })
        .onConflictDoUpdate({
            target: googleCalendarAccounts.userId,
            set: {
                googleEmail: email,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpiry: expiry,
            },
        });

    return { email };
}

/* ============================================================
   Get a valid access token for a user, refreshing if needed
============================================================ */
async function getValidAccessToken(userId: string): Promise<string | null> {
    const [account] = await db
        .select()
        .from(googleCalendarAccounts)
        .where(eq(googleCalendarAccounts.userId, userId));

    if (!account) return null;

    const now = Date.now();
    const expiry = new Date(account.tokenExpiry).getTime();

    // Refresh if expiring within the next 2 minutes
    if (expiry - now > 2 * 60 * 1000) {
        return account.accessToken;
    }

    const refreshed = await refreshAccessToken(account.refreshToken);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);

    await db
        .update(googleCalendarAccounts)
        .set({ accessToken: refreshed.access_token, tokenExpiry: newExpiry })
        .where(eq(googleCalendarAccounts.userId, userId));

    return refreshed.access_token;
}

export async function isGoogleConnected(userId: string) {
    const [account] = await db
        .select()
        .from(googleCalendarAccounts)
        .where(eq(googleCalendarAccounts.userId, userId));
    return account
        ? { connected: true, email: account.googleEmail, lastSyncedAt: account.lastSyncedAt }
        : { connected: false };
}

export async function disconnectGoogle(userId: string) {
    await db.delete(googleCalendarAccounts).where(eq(googleCalendarAccounts.userId, userId));
}

/* ============================================================
   Map our internal event shape -> Google Calendar event shape
============================================================ */
function toGoogleEvent(evt: any, timeZone: string = "UTC") {
    const g: any = {
        summary: evt.title || "Untitled event",
        description: evt.description || undefined,
        location: evt.location || undefined,
        visibility: evt.visibility && evt.visibility !== "default" ? evt.visibility : undefined,
        transparency: evt.busy === false ? "transparent" : "opaque",
        guestsCanModify: !!evt.guestsCanModify,
        guestsCanInviteOthers: evt.guestsCanInvite !== false,
        guestsCanSeeOtherGuests: evt.guestsCanSeeGuestList !== false,
    };

    if (Array.isArray(evt.guests) && evt.guests.length > 0) {
        g.attendees = evt.guests
            .map((gu: any) => (typeof gu === "string" ? { email: gu } : { email: gu.email }))
            .filter((a: any) => !!a.email);
    }

    if (evt.allDay) {
        g.start = { date: evt.date };
        const endDateStr = evt.endDate || evt.date;
        const [y, m, d] = endDateStr.split('-').map(Number);
        const endD = new Date(Date.UTC(y, m - 1, d + 1));
        g.end = { date: endD.toISOString().split('T')[0] };
    } else {
        g.start = { dateTime: combineDateTime(evt.date, evt.startTime), timeZone };
        g.end = { dateTime: combineDateTime(evt.endDate || evt.date, evt.endTime), timeZone };
    }

    return g;
}

function combineDateTime(dateStr: string, timeStr: string): string {
    // dateStr: "2026-07-10", timeStr: "09:00" -> local ISO string (no Z, Google
    // will interpret using the timeZone passed alongside dateTime).
    const time = timeStr && timeStr.length > 0 ? timeStr : "00:00";
    return `${dateStr}T${time}:00`;
}

// Map a Google event back into our internal column shape (partial row).
function fromGoogleEvent(g: any) {
    const allDay = !!g.start?.date && !g.start?.dateTime;
    const date = allDay ? g.start.date : (g.start?.dateTime || "").slice(0, 10);

    // Google's end date is exclusive for all-day events, so we subtract 1 day for our internal state
    let endDate = allDay ? (g.end?.date || g.start.date) : (g.end?.dateTime || "").slice(0, 10);
    if (allDay && g.end?.date) {
        const [y, m, d] = g.end.date.split('-').map(Number);
        const endD = new Date(Date.UTC(y, m - 1, d - 1));
        endDate = endD.toISOString().split('T')[0];
    }

    const startTime = allDay ? "00:00" : (g.start?.dateTime || "").slice(11, 16);
    const endTime = allDay ? "23:59" : (g.end?.dateTime || "").slice(11, 16);

    return {
        title: g.summary || "Untitled event",
        description: g.description || null,
        location: g.location || null,
        allDay,
        date,
        endDate,
        startTime,
        endTime,
        busy: g.transparency !== "transparent",
        guests: Array.isArray(g.attendees) ? g.attendees.map((a: any) => ({
            id: a.email,
            name: a.displayName || a.email,
            email: a.email,
            isExternal: true,
            optional: !!a.optional
        })).filter((a: any) => !!a.email) : [],
        googleEventId: g.id,
        source: "google",
        googleUpdatedAt: g.updated ? new Date(g.updated) : new Date(),
    };
}

/* ============================================================
   PUSH: app event -> Google (create / update / delete)
   All of these are best-effort: failures are logged, not thrown,
   so a Google hiccup never blocks the user's normal CRUD action.
============================================================ */
export type PushResult = { success: boolean; error?: string; skipped?: boolean };

export async function pushEventToGoogle(userId: string, event: any, timeZone: string = "UTC"): Promise<PushResult> {
    try {
        const token = await getValidAccessToken(userId);
        if (!token) return { success: false, skipped: true, error: "Not connected to Google Calendar" };

        const [account] = await db
            .select()
            .from(googleCalendarAccounts)
            .where(eq(googleCalendarAccounts.userId, userId));
        const calendarId = account?.calendarId || "primary";

        const body = toGoogleEvent(event, timeZone);

        if (event.googleEventId) {
            // Update existing
            const res = await fetch(
                `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${event.googleEventId}`,
                {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );
            if (!res.ok) {
                const text = await res.text();
                console.error("Google event update failed:", res.status, text);
                return { success: false, error: `Google returned ${res.status}: ${text.slice(0, 300)}` };
            }
            return { success: true };
        } else {
            // Create new
            const res = await fetch(`${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                console.error("Google event create failed:", res.status, data);
                return { success: false, error: `Google returned ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
            }
            // Save the google_event_id back onto our row
            await db
                .update(calendarEvents)
                .set({ googleEventId: data.id, googleUpdatedAt: new Date() })
                .where(eq(calendarEvents.id, event.id));
            return { success: true };
        }
    } catch (err: any) {
        console.error("pushEventToGoogle error:", err);
        return { success: false, error: err?.message || String(err) };
    }
}

export async function deleteEventFromGoogle(userId: string, googleEventId: string | null) {
    if (!googleEventId) return;
    try {
        const token = await getValidAccessToken(userId);
        if (!token) return;

        const [account] = await db
            .select()
            .from(googleCalendarAccounts)
            .where(eq(googleCalendarAccounts.userId, userId));
        const calendarId = account?.calendarId || "primary";

        const res = await fetch(
            `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
            { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
        );
        // 410/404 just means it's already gone on Google's side — fine either way.
        if (!res.ok && res.status !== 410 && res.status !== 404) {
            console.error("Google event delete failed:", await res.text());
        }
    } catch (err) {
        console.error("deleteEventFromGoogle error:", err);
    }
}

/* ============================================================
   PULL: Google -> app, using incremental sync tokens
============================================================ */
export async function syncFromGoogle(userId: string): Promise<{ synced: number; connected: boolean; error?: string }> {
    let token: string | null;
    try {
        token = await getValidAccessToken(userId);
    } catch (err: any) {
        console.error("syncFromGoogle: token refresh failed:", err);
        return { synced: 0, connected: false, error: `Token refresh failed: ${err?.message || err}` };
    }
    if (!token) return { synced: 0, connected: false };

    const [account] = await db
        .select()
        .from(googleCalendarAccounts)
        .where(eq(googleCalendarAccounts.userId, userId));
    if (!account) return { synced: 0, connected: false };

    const calendarId = account.calendarId || "primary";
    let pageToken: string | undefined;
    let syncToken: string | undefined = account.syncToken || undefined;
    let synced = 0;
    let newSyncToken: string | undefined;
    let maxPages = 5; // Limit to 5 pages per request to prevent Vercel 504 timeout

    do {
        const params = new URLSearchParams({ maxResults: "250", singleEvents: "true" });
        if (pageToken) params.set("pageToken", pageToken);
        if (syncToken) params.set("syncToken", syncToken);
        else params.set("timeMin", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        const res = await fetch(
            `${CAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();

        if (!res.ok) {
            // A 410 means the syncToken is stale/expired — do a full resync next time.
            if (res.status === 410) {
                await db
                    .update(googleCalendarAccounts)
                    .set({ syncToken: null })
                    .where(eq(googleCalendarAccounts.userId, userId));
                return syncFromGoogle(userId);
            }
            console.error("Google events list failed:", res.status, data);
            await db
                .update(googleCalendarAccounts)
                .set({ lastSyncedAt: new Date() })
                .where(eq(googleCalendarAccounts.userId, userId));
            return {
                synced,
                connected: true,
                error: `Google returned ${res.status}: ${JSON.stringify(data).slice(0, 300)}`,
            };
        }

        const items = data.items || [];
        if (items.length > 0) {
            const googleEventIds = items.map((g: any) => g.id).filter(Boolean);
            let existingEvents: any[] = [];
            if (googleEventIds.length > 0) {
                existingEvents = await db
                    .select()
                    .from(calendarEvents)
                    .where(inArray(calendarEvents.googleEventId, googleEventIds));
            }
            const existingMap = new Map(existingEvents.map(e => [e.googleEventId, e]));

            const writeOps = items.map((g: any) => async () => {
                const existing = existingMap.get(g.id);
                if (g.status === "cancelled") {
                    if (existing) {
                        await db.delete(calendarEvents).where(eq(calendarEvents.id, existing.id));
                    }
                    return;
                }

                const mapped = fromGoogleEvent(g);
                if (existing) {
                    await db.update(calendarEvents).set(mapped).where(eq(calendarEvents.id, existing.id));
                } else {
                    await db.insert(calendarEvents).values({
                        ...mapped,
                        userId,
                        calendarType: "meeting",
                        colorKey: "peacock",
                    } as any);
                }
            });

            // Execute in batches of 20
            for (let i = 0; i < writeOps.length; i += 20) {
                await Promise.all(writeOps.slice(i, i + 20).map((op: () => Promise<void>) => op()));
            }
            synced += items.filter((g: any) => g.status !== "cancelled").length;
        }

        pageToken = data.nextPageToken;
        newSyncToken = data.nextSyncToken || newSyncToken;
        maxPages--;
    } while (pageToken && maxPages > 0);

    await db
        .update(googleCalendarAccounts)
        .set({ syncToken: newSyncToken || null, lastSyncedAt: new Date() })
        .where(eq(googleCalendarAccounts.userId, userId));

    return { synced, connected: true };
}

/* ============================================================
   PUSH ALL: Push unsynced app events to Google Calendar
============================================================ */
export async function syncToGoogle(
    userId: string,
    timeZone: string = "UTC"
): Promise<{ pushed: number; failed: number; error?: string }> {
    const token = await getValidAccessToken(userId);
    if (!token) return { pushed: 0, failed: 0 };

    // Limit to 50 pushes per request to prevent Vercel 504 timeout on large backlogs
    const unsynced = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), isNull(calendarEvents.googleEventId)))
        .limit(50);

    let pushed = 0;
    let failed = 0;
    let firstError: string | undefined;

    const pushOps = unsynced.map(evt => async () => {
        return await pushEventToGoogle(userId, evt, timeZone);
    });

    // Execute in batches of 10
    for (let i = 0; i < pushOps.length; i += 10) {
        const results = await Promise.all(pushOps.slice(i, i + 10).map(op => op()));
        for (const result of results) {
            if (result.success) {
                pushed++;
            } else if (!result.skipped) {
                failed++;
                if (!firstError) firstError = result.error;
            }
        }
    }

    return { pushed, failed, error: firstError };
}