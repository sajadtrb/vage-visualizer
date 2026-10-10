"use client";

import { createClient, type Session } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_STUDIO_SUPABASE_ANON_KEY;
const storageKey = "vage-studio-auth";

export const studioAuthConfigured = Boolean(url && key);

export type StudioUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
  user_metadata?: Record<string, unknown>;
};

export type StudioSession = Session & { user: StudioUser };

type AuthLanguage = "fa" | "en";

let client: ReturnType<typeof createClient> | null = null;

/**
 * Keep the existing storage key so existing Studio sessions survive the SDK
 * migration. supabase-js serializes the same access/refresh token fields and
 * coordinates refreshes across tabs with its supported storage locking.
 */
export function getStudioAuthClient() {
  if (!studioAuthConfigured || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(url!, key!, {
      auth: {
        storageKey,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return client;
}

export function getStoredStudioSession(): StudioSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { currentSession?: StudioSession } & StudioSession;
    // Accept both the old hand-written shape and the SDK's persisted shape.
    const session = (parsed.currentSession || parsed) as StudioSession;
    return session?.access_token && session?.user?.id ? session : null;
  } catch {
    return null;
  }
}

export async function refreshStudioSession(force = false) {
  const auth = getStudioAuthClient()?.auth;
  if (!auth) return null;
  try {
    const result = force ? await auth.refreshSession() : await auth.getSession();
    if (result.error) return getStoredStudioSession();
    return (result.data.session as StudioSession | null) || null;
  } catch {
    // A temporary outage must not erase local work. Online APIs still validate
    // the bearer token independently and will refuse an expired session.
    return getStoredStudioSession();
  }
}

export function getFriendlyAuthError(error: unknown, language: AuthLanguage) {
  const fa = language === "fa";
  const value = error as { message?: unknown; code?: unknown; status?: unknown };
  const code = String(value?.code || "").toLowerCase();
  const message = String(value?.message || error || "").toLowerCase();
  const status = Number(value?.status || 0);

  if (/fetch|network|timeout|failed to connect|load failed/.test(message))
    return fa
      ? "اتصال به سرویس ورود برقرار نشد. اینترنت و دسترسی به Supabase را بررسی کنید و دوباره تلاش کنید. پروژه‌ی محلی شما پاک نشده است."
      : "Could not reach the sign-in service. Check your connection and try again. Your local project is still saved.";
  if (code.includes("email_not_confirmed") || message.includes("email not confirmed"))
    return fa
      ? "ایمیل شما هنوز تأیید نشده است. ایمیل تأیید را باز کنید یا درخواست ارسال دوباره بدهید."
      : "Your email is not confirmed yet. Open the confirmation email or request another one.";
  if (["invalid_credentials", "invalid_grant"].includes(code) || /invalid login credentials|invalid password/.test(message))
    return fa ? "ایمیل یا رمز عبور درست نیست." : "The email or password is incorrect.";
  if (status === 429 || /rate.?limit|too many requests|over_request_rate_limit/.test(message))
    return fa
      ? "تعداد درخواست‌ها زیاد بوده است. چند دقیقه صبر کنید و دوباره تلاش کنید."
      : "Too many attempts. Wait a few minutes and try again.";
  if (status === 401 || /jwt expired|refresh token.*(invalid|not found)|session.*expired/.test(message))
    return fa
      ? "نشست ورود منقضی شده است. دوباره وارد شوید؛ پروژه‌های محلی شما باقی می‌مانند."
      : "Your sign-in session expired. Sign in again; your local projects remain saved.";
  if (/user already registered|already been registered/.test(message))
    return fa ? "برای این ایمیل قبلاً حساب ساخته شده است؛ وارد شوید." : "An account already exists for this email. Sign in instead.";
  if (/password should be|password.*(weak|short)/.test(message))
    return fa ? "رمز عبور باید دست‌کم ۸ نویسه داشته باشد و به‌اندازه‌ی کافی قوی باشد." : "Choose a stronger password with at least 8 characters.";
  if (status >= 500)
    return fa
      ? "سرویس ورود موقتاً پاسخ‌گو نیست. کمی بعد دوباره تلاش کنید."
      : "The sign-in service is temporarily unavailable. Please try again shortly.";
  return fa ? "درخواست انجام نشد. اطلاعات را بررسی و دوباره تلاش کنید." : "The request could not be completed. Check the details and try again.";
}
