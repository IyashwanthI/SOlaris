// Centralized API layer for the Solari Agent-Assist frontend.
// All calls target the existing FastAPI backend and degrade gracefully when
// an endpoint or response field is not implemented server-side.

export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://localhost:8000";

export const TOKEN_KEY = "solari_token";
export const USER_KEY = "solari_user";

/** Thrown for non-2xx responses so callers can inspect status + server detail. */
export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

// ---- Token management -------------------------------------------------------

let authToken = localStorage.getItem(TOKEN_KEY) || null;
let onAuthFailure = null; // callback set by the app to force logout/redirect

export function setToken(token) {
  authToken = token || null;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken() {
  return authToken;
}

export function setAuthFailureHandler(fn) {
  onAuthFailure = fn;
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Authenticated fetch: attaches the Bearer token + JSON headers. On 401, or a
 * 403 whose detail mentions "revoked", triggers the global auth-failure handler
 * (clear localStorage + redirect to login) before throwing.
 */
export async function authFetch(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parseJsonSafe(res);

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || `${method} ${path} failed`;
    const revoked =
      typeof detail === "string" && detail.toLowerCase().includes("revoked");
    if (res.status === 401 || (res.status === 403 && revoked)) {
      if (onAuthFailure) {
        onAuthFailure(
          revoked
            ? "Access revoked by an administrator. Please sign in again."
            : "Session expired. Please sign in again.",
        );
      }
    }
    throw new ApiError(res.status, detail);
  }
  return data;
}

// Backwards-compatible alias used by the endpoint helpers below.
const request = (path, opts = {}) => authFetch(path, opts);

// ---- Auth endpoints ---------------------------------------------------------

export async function login(email, password) {
  return authFetch("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export async function register(email, full_name, password) {
  return authFetch("/api/auth/register", {
    method: "POST",
    body: { email, full_name, password },
  });
}

export async function me() {
  return authFetch("/api/auth/me");
}

// ---- Admin user management --------------------------------------------------

export async function adminUsers() {
  const data = await authFetch("/api/admin/users");
  return data?.users || [];
}

export async function promoteUser(userId) {
  const data = await authFetch(`/api/admin/users/${userId}/promote`, {
    method: "PATCH",
  });
  return data?.user;
}

export async function kickUser(userId) {
  const data = await authFetch(`/api/admin/users/${userId}/kick`, {
    method: "POST",
  });
  return data?.user;
}

// ---- Built-in fallback presets (demo always works, even w/o backend data) ----

export const FALLBACK_INCOMING = [
  {
    ticket_id: "NT-101",
    subject: "CSV export missing the last week of data",
    category: "export",
    description:
      "Customer's CSV export of transaction history is missing the most recent 7 days of records even though the dashboard shows them.",
    tags: ["export", "csv", "timezone"],
  },
  {
    ticket_id: "NT-1",
    subject: "Can't log in, password reset email never arrives",
    category: "auth",
    description:
      "A customer requested a password reset an hour ago and says the email still hasn't shown up, even after checking spam.",
    tags: ["login", "password-reset", "email"],
  },
  {
    ticket_id: "NT-3",
    subject: "Getting charged twice this month",
    category: "billing",
    description:
      "Customer's card statement shows two charges for what should be a single monthly subscription payment.",
    tags: ["billing", "duplicate-charge"],
  },
];

export const FALLBACK_SAMPLES = [
  {
    ticket_id: "T-1002",
    subject: "SSO login redirects to blank page",
    category: "auth",
    description:
      "Customer using Okta SSO is redirected back to the app after authenticating, but the page is completely blank with no error.",
    tags: ["sso", "saml", "okta", "login"],
  },
  {
    ticket_id: "T-1303",
    subject: "Charged twice for the same billing cycle",
    category: "billing",
    description:
      "Customer noticed two identical charges on their card statement for what should be a single monthly charge.",
    tags: ["billing", "duplicate-charge", "payments"],
  },
  {
    ticket_id: "T-1201",
    subject: "Revenue chart shows blank instead of bars",
    category: "render",
    description:
      "The main revenue chart on the dashboard renders as an empty white box with no bars or axis labels.",
    tags: ["chart", "rendering", "dashboard"],
  },
];

export const UNSEEN_BUG = {
  ticket_id: "NT-UNSEEN",
  subject: "Flux capacitor overheats when brewing espresso in zero gravity",
  category: "",
  description:
    "A nonsensical, entirely out-of-domain report with no relation to any analytics-platform support topic in our knowledge base. Used to verify the confidence-floor guardrail rejects irrelevant queries.",
  tags: ["nonsense", "out-of-scope"],
};

// ---- Endpoints ----

export async function fetchIncoming() {
  // Not implemented on the current backend -> fall back to presets.
  try {
    const data = await request("/api/tickets/incoming");
    return {
      incoming_tickets: data?.incoming_tickets?.length
        ? data.incoming_tickets
        : FALLBACK_INCOMING,
      sample_historical_tickets: data?.sample_historical_tickets?.length
        ? data.sample_historical_tickets
        : FALLBACK_SAMPLES,
      source: "backend",
    };
  } catch {
    return {
      incoming_tickets: FALLBACK_INCOMING,
      sample_historical_tickets: FALLBACK_SAMPLES,
      source: "fallback",
    };
  }
}

/** Derive a routing recommendation client-side when the backend omits it. */
function deriveRoute(matches, belowThreshold) {
  if (belowThreshold || !matches.length) {
    return {
      badge: "ESCALATE",
      queue: "Tier-2 Investigation",
      reason: "No verified past match above the 55% confidence floor.",
    };
  }
  const top = matches[0];
  const high = top.confidence_tier === "HIGH";
  return {
    badge: high ? "AUTO-ASSIST" : "AGENT REVIEW",
    queue: `${top.category || "general"} queue`,
    reason: high
      ? `Strong match to ${top.ticket_id} (${top.confidence_pct}%). Safe to apply guided resolution.`
      : `Moderate match to ${top.ticket_id} (${top.confidence_pct}%). Agent should confirm before resolving.`,
  };
}

export async function search(payload) {
  const data = await request("/api/search", {
    method: "POST",
    body: {
      ticket_id: payload.ticket_id || null,
      subject: payload.subject || "",
      description: payload.description || "",
      category: payload.category || null,
      tags: payload.tags || [],
      search_mode: payload.search_mode || "hybrid",
      top_k: 4,
    },
  });

  const matches = (data?.matches || []).map((m) => ({
    ...m,
    // Backend may omit cosine_sim; derive from confidence_pct as a fallback.
    cosine_sim:
      typeof m.cosine_sim === "number"
        ? m.cosine_sim
        : (m.confidence_pct ?? 0) / 100,
  }));

  const belowThreshold =
    typeof data?.below_threshold === "boolean"
      ? data.below_threshold
      : matches.length === 0;

  return {
    matches,
    latency_ms: data?.latency_ms ?? 0,
    below_threshold: belowThreshold,
    recommended_route:
      data?.recommended_route || deriveRoute(matches, belowThreshold),
  };
}

export async function copilot(
  activeTicket,
  matchedTickets,
  action,
  modifier = null,
) {
  return request("/api/copilot", {
    method: "POST",
    body: {
      active_ticket: activeTicket,
      matched_tickets: matchedTickets,
      action,
      modifier,
    },
  });
}

export async function sendFeedback(matchedTicketId, vote) {
  return request("/api/feedback", {
    method: "POST",
    body: { matched_ticket_id: matchedTicketId, vote },
  });
}

export async function feedbackStats() {
  try {
    return await request("/api/feedback/stats");
  } catch {
    return { up: 0, down: 0, precision_pct: 0 };
  }
}

export async function adminGaps() {
  const data = await authFetch("/api/admin/gaps");
  const gaps = Array.isArray(data) ? data : data?.gaps || [];
  return { gaps, available: true };
}

export async function approveGap(gapId, body) {
  return request(`/api/admin/gaps/${encodeURIComponent(gapId)}/approve`, {
    method: "POST",
    body,
  });
}

export async function runBenchmark() {
  try {
    const data = await request("/api/benchmark");
    return { data, available: true };
  } catch (err) {
    return { data: null, available: false, reason: err.message };
  }
}
