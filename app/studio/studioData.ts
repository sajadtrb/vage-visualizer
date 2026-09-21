"use client";

import { getStoredStudioSession, refreshStudioSession, type StudioSession } from "./studioAuth";

const baseUrl = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY;

export type AccessMode = "limited" | "free" | "unlimited";
export type PlanCode = "free" | "starter" | "creator" | "pro" | "unlimited";

export type StudioProfile = {
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
  { code: "starter", title: "Starter", price: 500_000, renders: 2, note: "۲ رندر در هفته" },
  { code: "creator", title: "Creator", price: 1_500_000, renders: 5, note: "۵ رندر در هفته" },
  { code: "pro", title: "Pro", price: 3_000_000, renders: 10, note: "۱۰ رندر در هفته" },
];

function authHeaders(session: StudioSession, extra: Record<string, string> = {}) {
  if (!baseUrl || !publishableKey) throw new Error("Studio database is not configured.");
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = getStoredStudioSession();
  if (!session) throw new Error("Sign in to access your Studio account.");
  const request = (current: StudioSession) => fetch(`${baseUrl}/rest/v1${path}`, {
    ...init,
    headers: authHeaders(current, (init.headers || {}) as Record<string, string>),
  });
  let response = await request(session);
  if (response.status === 401 && session.refresh_token) {
    session = await refreshStudioSession();
    if (session) response = await request(session);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.hint || payload?.details || "Studio data request failed.";
    throw new Error(String(message));
  }
  return payload as T;
}

export async function getMyProfile() {
  const session = getStoredStudioSession();
  if (!session) return null;
  const rows = await rest<StudioProfile[]>(`/studio_profiles?user_id=eq.${encodeURIComponent(session.user.id)}&select=*`);
  return rows[0] || null;
}

export async function ensureMyProfile(displayName?: string) {
  const session = getStoredStudioSession();
  if (!session) return null;
  const existing = await getMyProfile();
  if (existing) return existing;
  const rows = await rest<StudioProfile[]>("/studio_profiles", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: session.user.id, display_name: displayName || session.user.email?.split("@")[0] || "Studio creator" }),
  });
  return rows[0] || null;
}

export async function updateMyDisplayName(displayName: string) {
  const session = getStoredStudioSession();
  if (!session) throw new Error("Sign in to update your account.");
  const rows = await rest<StudioProfile[]>(`/studio_profiles?user_id=eq.${encodeURIComponent(session.user.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ display_name: displayName.trim() || null }),
  });
  return rows[0] || null;
}

export async function listSubscriptions() {
  const session = getStoredStudioSession();
  if (!session) return [];
  return rest<StudioSubscription[]>(`/studio_subscriptions?user_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=created_at.desc`);
}

export async function listPaymentEvents() {
  const session = getStoredStudioSession();
  if (!session) return [];
  return rest<StudioPaymentEvent[]>(`/studio_payment_events?user_id=eq.${encodeURIComponent(session.user.id)}&select=*&order=created_at.desc&limit=20`);
}

export async function reserveStudioRender() {
  return rest<{ granted: boolean; remaining: number | null; mode: AccessMode }>("/rpc/reserve_studio_render", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function listAdminProfiles() {
  return rest<StudioProfile[]>("/studio_profiles?select=*&order=created_at.desc");
}

export async function updateAdminProfile(userId: string, patch: Partial<Pick<StudioProfile, "plan_code" | "access_mode" | "render_limit" | "display_name" | "renders_used_week">>) {
  const rows = await rest<StudioProfile[]>(`/studio_profiles?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return rows[0] || null;
}

export function getStudioUser() {
  return getStoredStudioSession()?.user || null;
}
