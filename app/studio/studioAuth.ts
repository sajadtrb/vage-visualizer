"use client";

const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY;
const storageKey = "vage-studio-auth";

export const studioAuthConfigured = Boolean(url && key);

export type StudioUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};
export type StudioSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user: StudioUser;
};
type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";
type Listener = (event: AuthEvent, session: StudioSession | null) => void;
const listeners = new Set<Listener>();
let refreshInFlight: Promise<StudioSession | null> | null = null;

function storedSession() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(
      localStorage.getItem(storageKey) || "null",
    ) as StudioSession | null;
  } catch {
    return null;
  }
}

export function getStoredStudioSession() {
  return storedSession();
}

function setStoredSession(session: StudioSession | null, event: AuthEvent) {
  if (typeof window !== "undefined") {
    if (session) localStorage.setItem(storageKey, JSON.stringify(session));
    else localStorage.removeItem(storageKey);
  }
  listeners.forEach((listener) => listener(event, session));
}

class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function refreshStoredSession(force = false) {
  const current = storedSession();
  if (!current?.refresh_token || !url || !key) return current;
  if (
    !force &&
    current.expires_at &&
    current.expires_at > Math.floor(Date.now() / 1000) + 90
  )
    return current;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = authRequest("/token?grant_type=refresh_token", {
    refresh_token: current.refresh_token,
  })
    .then((payload) => {
      const next = sessionFromPayload(payload);
      if (!next)
        throw new Error(
          "The authentication service returned no refreshed session.",
        );
      // Do not revive a session that was signed out while the request was running.
      if (storedSession()?.refresh_token !== current.refresh_token)
        return storedSession();
      setStoredSession(next, "TOKEN_REFRESHED");
      return next;
    })
    .catch((error: unknown) => {
      // Network outages and server failures must not discard the user's session.
      if (
        error instanceof AuthRequestError &&
        [400, 401, 403].includes(error.status) &&
        storedSession()?.refresh_token === current.refresh_token
      ) {
        setStoredSession(null, "SIGNED_OUT");
        return null;
      }
      return storedSession();
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

async function validateStoredSession(session: StudioSession | null) {
  if (!session || !url || !key) return session;
  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    if (response.ok) return session;
    if ([401, 403].includes(response.status)) {
      if (storedSession()?.access_token === session.access_token)
        setStoredSession(null, "SIGNED_OUT");
      return null;
    }
  } catch {
    // Keep the session during transient offline/network failures.
  }
  return session;
}

export async function refreshStudioSession(force = false) {
  return refreshStoredSession(force);
}

async function authRequest(path: string, body: Record<string, unknown>) {
  if (!url || !key) throw new Error("Studio authentication is not configured.");
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error_description || payload.msg || payload.message;
    throw new AuthRequestError(
      typeof detail === "string" ? detail : "Authentication failed.",
      response.status,
    );
  }
  return payload as Record<string, unknown>;
}

function sessionFromPayload(payload: Record<string, unknown>) {
  if (!payload.access_token || !payload.user) return null;
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  return {
    access_token: String(payload.access_token),
    refresh_token:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : undefined,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    user: payload.user as StudioUser,
  } satisfies StudioSession;
}

export function getStudioAuthClient() {
  if (!studioAuthConfigured) return null;
  return {
    auth: {
      async getSession() {
        return {
          data: {
            session: await validateStoredSession(await refreshStoredSession()),
          },
        };
      },
      onAuthStateChange(listener: Listener) {
        listeners.add(listener);
        return {
          data: {
            subscription: { unsubscribe: () => listeners.delete(listener) },
          },
        };
      },
      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const redirect =
          typeof window !== "undefined"
            ? `?redirect_to=${encodeURIComponent(window.location.origin)}`
            : "";
        const payload = await authRequest(`/signup${redirect}`, {
          email,
          password,
          data: options?.data || {},
        });
        const session = sessionFromPayload(payload);
        if (session) setStoredSession(session, "SIGNED_IN");
        return {
          data: {
            session,
            user: (payload.user as StudioUser | undefined) || null,
          },
          error: null,
        };
      },
      async signInWithPassword({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) {
        const payload = await authRequest("/token?grant_type=password", {
          email,
          password,
        });
        const session = sessionFromPayload(payload);
        if (!session)
          throw new Error("The authentication service returned no session.");
        setStoredSession(session, "SIGNED_IN");
        return { data: { session, user: session.user }, error: null };
      },
      async signOut() {
        const session = storedSession();
        setStoredSession(null, "SIGNED_OUT");
        if (url && key && session?.access_token)
          await fetch(`${url}/auth/v1/logout`, {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
              apikey: key,
              Authorization: `Bearer ${session.access_token}`,
            },
          }).catch(() => undefined);
      },
    },
  };
}
