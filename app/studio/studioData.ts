"use client";

import {
  getStoredStudioSession,
  getStudioAuthClient,
  refreshStudioSession,
  type StudioSession,
} from "./studioAuth";

const baseUrl = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY;

export type AccessMode = "limited" | "free" | "unlimited";
export type PlanCode = "free" | "starter" | "creator" | "pro" | "unlimited";

export type StudioProfile = {
  email?: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  is_suspended?: boolean;
  billing_exempt?: boolean;
  access_expires_at?: string | null;
  user_id: string;
  display_name: string | null;
  role: "user" | "admin";
  plan_code: PlanCode;
  access_mode: AccessMode;
  render_limit: number;
  renders_used_week: number;
  week_started_at: string;
  created_at: string;
  updated_at: string;
};

export type StudioSubscription = {
  id: string;
  user_id: string;
  plan_code: Exclude<PlanCode, "free" | "unlimited">;
  status: "pending" | "active" | "failed" | "cancelled" | "expired";
  amount_toman: number;
  started_at: string | null;
  ends_at: string | null;
  payping_code: string | null;
  payping_ref_id: string | null;
  client_ref_id: string | null;
  created_at: string;
};

export type StudioPaymentEvent = {
  id: string;
  user_id: string | null;
  subscription_id: string | null;
  gateway: string;
  status: "created" | "redirected" | "verified" | "failed";
  amount_toman: number;
  client_ref_id: string;
  gateway_ref_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StudioPlan = {
  code: Exclude<PlanCode, "free" | "unlimited">;
  title: string;
  price: number;
  renders: number;
  note: string;
};

export const studioPlans: StudioPlan[] = [
  {
    code: "starter",
    title: "Starter",
    price: 500_000,
    renders: 2,
    note: "۲ رندر در هفته",
  },
  {
    code: "creator",
    title: "Creator",
    price: 1_500_000,
    renders: 5,
    note: "۵ رندر در هفته",
  },
  {
    code: "pro",
    title: "Pro",
    price: 3_000_000,
    renders: 10,
    note: "۱۰ رندر در هفته",
  },
];

function authHeaders(
  session: StudioSession,
  extra: Record<string, string> = {},
) {
  if (!baseUrl || !publishableKey)
    throw new Error("Studio database is not configured.");
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = await refreshStudioSession();
  if (!session) throw new Error("Sign in to access your Studio account.");
  const request = (current: StudioSession) =>
    fetch(`${baseUrl}/rest/v1${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000),
      headers: authHeaders(
        current,
        (init.headers || {}) as Record<string, string>,
      ),
    });
  let response = await request(session);
  if (response.status === 401 && session.refresh_token) {
    session = await refreshStudioSession(true);
    if (session) response = await request(session);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.hint ||
      payload?.details ||
      "Studio data request failed.";
    throw new Error(String(message));
  }
  return payload as T;
}

export async function getMyProfile() {
  const session = getStoredStudioSession();
  if (!session) return null;
  const rows = await rest<StudioProfile[]>(
    `/studio_profiles?user_id=eq.${encodeURIComponent(session.user.id)}&select=*`,
  );
  return rows[0] || null;
}

/** Use Supabase Auth's server-verified identity for account and admin views. */
export async function getVerifiedStudioUser() {
  const auth = getStudioAuthClient()?.auth;
  if (!auth) throw new Error("Studio sign-in is not configured in this environment.");
  const { data, error } = await auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function ensureMyProfile(displayName?: string) {
  const session = getStoredStudioSession();
  if (!session) return null;
  const existing = await getMyProfile();
  if (existing) return existing;
  const rows = await rest<StudioProfile[]>("/studio_profiles", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: session.user.id,
      display_name:
        displayName || session.user.email?.split("@")[0] || "Studio creator",
    }),
  });
  return rows[0] || null;
}

export async function updateMyDisplayName(displayName: string) {
  const session = getStoredStudioSession();
  if (!session) throw new Error("Sign in to update your account.");
  const rows = await rest<StudioProfile[]>(
    `/studio_profiles?user_id=eq.${encodeURIComponent(session.user.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ display_name: displayName.trim() || null }),
    },
  );
  if (!rows[0])
    throw new Error(
      "Your account was not updated. Please reload and try again.",
    );
  return rows[0];
}

export async function listSubscriptions() {
  const session = getStoredStudioSession();
  if (!session) return [];
  return rest<StudioSubscription[]>(
    `/studio_subscriptions?user_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=created_at.desc`,
  );
}

export async function listPaymentEvents() {
  const session = getStoredStudioSession();
  if (!session) return [];
  return rest<StudioPaymentEvent[]>(
    `/studio_payment_events?user_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=created_at.desc&limit=20`,
  );
}

export async function reserveStudioRender() {
  return rest<{ granted: boolean; remaining: number | null; mode: AccessMode }>(
    "/rpc/reserve_studio_render",
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export type StudioAdminFilters = {
  role?: "user" | "admin";
  plan?: PlanCode;
  accessMode?: AccessMode;
  suspended?: boolean;
};

export async function listAdminProfiles(query = "", limit = 50, offset = 0, filters: StudioAdminFilters = {}) {
  return rest<{ items: StudioProfile[]; total: number }>(
    "/rpc/studio_admin_search_users",
    {
      method: "POST",
      body: JSON.stringify({
        p_query: query.trim() || null, p_limit: limit, p_offset: offset,
        p_role: filters.role || null, p_plan: filters.plan || null,
        p_access_mode: filters.accessMode || null,
        p_suspended: filters.suspended ?? null,
      }),
    },
  );
}

export async function updateAdminProfile(
  userId: string,
  patch: Partial<
    Pick<
      StudioProfile,
      | "plan_code"
      | "access_mode"
      | "render_limit"
      | "display_name"
      | "renders_used_week"
        | "is_suspended"
        | "billing_exempt"
        | "access_expires_at"
    >
  >,
  reason: string,
) {
  if (
    patch.render_limit !== undefined &&
    (!Number.isInteger(patch.render_limit) ||
      patch.render_limit < 0 ||
      patch.render_limit > 100000)
  )
    throw new Error(
      "Weekly limit must be a whole number between 0 and 100000.",
    );
  if (reason.trim().length < 3 || reason.trim().length > 500)
    throw new Error("Add a short reason (3–500 characters) for the admin change.");
  const saved = await rest<StudioProfile>(
    "/rpc/studio_admin_update_profile",
    {
      method: "POST",
      body: JSON.stringify({ p_user_id: userId, p_patch: patch, p_reason: reason.trim() }),
    },
  );
  if (!saved?.user_id)
    throw new Error(
      "No user was updated. Refresh your administrator access and try again.",
    );
  return saved;
}

export type StudioAdminAudit = {
  id: number;
  actor_user_id: string;
  target_user_id: string;
  reason: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  created_at: string;
};

export async function listStudioAdminAudit(limit = 20) {
  return rest<StudioAdminAudit[]>("/rpc/studio_admin_list_audit", {
    method: "POST",
    body: JSON.stringify({ p_user_id: null, p_limit: limit, p_offset: 0 }),
  });
}

export function getStudioUser() {
  return getStoredStudioSession()?.user || null;
}
