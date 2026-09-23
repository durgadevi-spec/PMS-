/**
 * API client helper with caching, request deduplication, and automatic Bearer token injection
 * Features:
 * - Automatic Bearer token from localStorage
 * - Response caching for GET requests (5 min default)
 * - Request deduplication (prevents duplicate in-flight requests)
 * - Automatic cache invalidation on POST/PUT/DELETE
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const cache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<Response>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes default

// PERF: this file used to console.log on every single request, cache hit,
// and response — including the ~6+ parallel calls the Tasks page fires on
// every mount. That's cheap per-call but adds up fast and is pure overhead
// in production. Gate it behind a flag instead of removing outright, so it
// can still be flipped on for debugging (e.g. from the browser console:
// localStorage.setItem("api_debug", "1")).
const API_DEBUG = typeof localStorage !== "undefined" && localStorage.getItem("api_debug") === "1";
const apiLog = (...args: any[]) => { if (API_DEBUG) console.log(...args); };

/**
 * Clear all cached data (useful on logout or data refresh)
 */
export const clearApiCache = () => {
  cache.clear();
};

/**
 * Invalidate specific cache entry
 */
export const invalidateCache = (url: string) => {
  cache.delete(url);
};

/**
 * Main API fetch with caching and deduplication
 */
export const apiFetch = (url: string, opts?: RequestInit & { bypassCache?: boolean }) => {
  const token = localStorage.getItem("knockturn_token");
  // Only include Authorization header when we actually have a token
  const headers = {
    ...(opts?.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } as Record<string, string>;

  const method = (opts?.method || "GET").toUpperCase();
  const isGetRequest = method === "GET";
  const shouldCache = isGetRequest && !opts?.bypassCache;

  apiLog(`[API] ${method} ${url}`, { hasToken: !!token, bypassCache: !!opts?.bypassCache });

  // Check cache for GET requests
  if (shouldCache && cache.has(url)) {
    const entry = cache.get(url)!;
    if (Date.now() - entry.timestamp < entry.ttl) {
      apiLog(`[API] Cache hit for ${url}`);
      return Promise.resolve(new Response(JSON.stringify(entry.data), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    } else {
      cache.delete(url);
    }
  }

  // Deduplicate in-flight requests
  if (shouldCache && inFlightRequests.has(url)) {
    apiLog(`[API] Deduplicating in-flight request for ${url}`);
    // Wait for the in-flight request to complete and return a fresh Response
    // built from the cached JSON if available (avoids clone/bodyUsed races).
    return inFlightRequests.get(url)!.then(async (r) => {
      if (cache.has(url)) {
        const entry = cache.get(url)!;
        return new Response(JSON.stringify(entry.data), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      try {
        // Best-effort clone; if clone fails, return original response as fallback
        return r.clone();
      } catch (e) {
        return r;
      }
    });
  }

  // Invalidate cache on mutations.
  // PERF: this used to be cache.clear(), wiping every cached GET across the
  // whole app (projects, employees, etc.) on every single write — so one
  // button click (e.g. an inline edit) forced a slow full re-fetch of
  // everything else on the page too, on top of the page's own refreshTasks()
  // call. Only invalidate GET entries that share a resource with the
  // mutation, so unrelated cached data (and other pages/tabs) stay fast.
  //
  // A mutated URL's "resource keyword" isn't always the same string as every
  // endpoint that serves that resource — e.g. PATCH/DELETE /api/key-steps/:id
  // must also invalidate GET /api/keysteps/bulk (no hyphen) and GET
  // /api/projects/:id/key-steps (nested under a different base path). Instead
  // of a fixed list of exact paths, normalize every path segment (strip
  // non-alphanumerics, lowercase) and invalidate any cached URL that shares a
  // normalized segment with the mutated one — this naturally covers
  // "key-steps" === "keysteps" and nested routes like ".../key-steps".
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pathOf = (u: string) => {
    try {
      return new URL(u, typeof window !== "undefined" ? window.location.origin : "http://localhost").pathname;
    } catch {
      return null;
    }
  };
  const segmentsOf = (path: string) => path.split("/").filter(Boolean);
  // Looks like a record id (uuid or numeric) rather than a resource name.
  const isIdLike = (seg: string) => /^[0-9a-f-]{20,}$/i.test(seg) || /^\d+$/.test(seg);

  // ROLLUP endpoints aggregate data from several unrelated resources at once
  // (e.g. /api/workspace pulls from projects, key-steps, tasks, subtasks, and
  // employees together). A mutation to any of those base resources must also
  // drop any cached rollup entry, since the rollup's own path shares no
  // resource keyword with the thing that changed.
  const ROLLUP_DEPENDENTS: Record<string, string[]> = {
    tasks: ["/api/workspace"],
    subtasks: ["/api/workspace"],
    keysteps: ["/api/workspace"],
    projects: ["/api/workspace"],
    employees: ["/api/workspace"],
  };

  if (!isGetRequest) {
    try {
      const mutatedPath = pathOf(url);
      if (!mutatedPath) throw new Error("unparseable mutated URL");

      const mutatedKeywords = new Set(
        segmentsOf(mutatedPath)
          .filter((seg) => seg !== "api" && !isIdLike(seg))
          .map(normalize)
      );

      const dependentRollups = new Set<string>();
      mutatedKeywords.forEach((kw) => (ROLLUP_DEPENDENTS[kw] || []).forEach((d) => dependentRollups.add(d)));

      for (const cachedUrl of Array.from(cache.keys())) {
        const cachedPath = pathOf(cachedUrl);
        if (!cachedPath) {
          cache.delete(cachedUrl); // malformed cached key — drop it to be safe
          continue;
        }
        const cachedKeywords = segmentsOf(cachedPath)
          .filter((seg) => seg !== "api" && !isIdLike(seg))
          .map(normalize);
        const sharesResource = cachedKeywords.some((kw) => mutatedKeywords.has(kw));
        const isDependentRollup = Array.from(dependentRollups).some(
          (d) => cachedPath === d || cachedPath.startsWith(d)
        );
        if (sharesResource || isDependentRollup) {
          cache.delete(cachedUrl);
        }
      }
    } catch {
      cache.clear(); // fallback: if url parsing fails, behave as before
    }
  }

  const fetchPromise = fetch(url, { ...opts, headers, cache: "no-store" })
    .then(async (response) => {
      apiLog(`[API] Response for ${method} ${url}:`, response.status, response.statusText);

      // Global handling for unauthorized responses: remove invalid token and redirect
      if (response.status === 401) {
        console.warn(`[API] 401 Unauthorized for ${url} — clearing token and redirecting to /login`);
        try {
          localStorage.removeItem("knockturn_token");
          cache.clear();
        } catch (e) {
          /* ignore */
        }
        if (typeof window !== "undefined") {
          // navigate the SPA to the login screen
          window.location.href = "/login";
        }
        return response;
      }

      // Cache successful GET responses
      if (shouldCache && response.ok && response.status === 200) {
        const data = await response.clone().json().catch(() => null);
        if (data) {
          cache.set(url, {
            data,
            timestamp: Date.now(),
            ttl: CACHE_TTL,
          });
        }
      }
      return response;
    })
    .catch((err) => {
      console.error(`[API] Network error for ${method} ${url}:`, err);
      throw err;
    })
    .finally(() => {
      // Remove from in-flight tracking
      inFlightRequests.delete(url);
    });

  // Track in-flight request
  if (shouldCache) {
    inFlightRequests.set(url, fetchPromise);
  }

  return fetchPromise;
};