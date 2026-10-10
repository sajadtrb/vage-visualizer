"use client";
import "./account.css";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureMyProfile,
  getVerifiedStudioUser,
  listAdminProfiles,
  listStudioAdminAudit,
  listPaymentEvents,
  listSubscriptions,
  studioPlans,
  updateAdminProfile,
  updateMyDisplayName,
  type StudioProfile,
  type StudioPaymentEvent,
  type StudioSubscription,
  type AccessMode,
  type PlanCode,
  type StudioAdminAudit,
} from "./studioData";
import { getStudioAuthClient, getFriendlyAuthError, refreshStudioSession } from "./studioAuth";

function toman(value: number, fa = true) {
  return `${new Intl.NumberFormat(fa ? "fa-IR" : "en-US").format(value)} ${fa ? "تومان" : "toman"}`;
}

export default function StudioDashboard({
  onClose,
  lang = "en",
}: {
  onClose: () => void;
  lang?: string;
}) {
  const fa = lang === "fa";
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [subscriptions, setSubscriptions] = useState<StudioSubscription[]>([]);
  const [paymentEvents, setPaymentEvents] = useState<StudioPaymentEvent[]>([]);
  const [adminUsers, setAdminUsers] = useState<StudioProfile[]>([]);
  const [adminTotal, setAdminTotal] = useState(0);
  const [adminPage, setAdminPage] = useState(0);
  const [adminAudit, setAdminAudit] = useState<StudioAdminAudit[]>([]);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [sectionLoad, setSectionLoad] = useState({ subscriptions: "loading", payments: "loading", admin: "idle" });
  const [adminQuery, setAdminQuery] = useState("");
  const [adminRoleFilter, setAdminRoleFilter] = useState("");
  const [adminPlanFilter, setAdminPlanFilter] = useState("");
  const [adminAccessFilter, setAdminAccessFilter] = useState("");
  const [adminSuspendedFilter, setAdminSuspendedFilter] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [buying, setBuying] = useState<PlanCode | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [billingReady, setBillingReady] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const actionLock = useRef(false);
  const adminRequest = useRef(0);

  const copy = useMemo(
    () =>
      fa
        ? {
            dashboard: "داشبورد حساب",
            back: "بازگشت به استودیو",
            account: "حساب کاربری",
            plan: "اشتراک و دسترسی",
            admin: "مدیریت کاربران",
            save: "ذخیره تغییرات",
            name: "نام نمایشی",
            current: "وضعیت فعلی",
            usage: "مصرف این هفته",
            renders: "رندر",
            unlimited: "نامحدود",
            free: "دسترسی رایگان هنرمند",
            buy: "خرید اشتراک",
            pending: "در انتظار پرداخت",
            noPayment: "درگاه پرداخت هنوز برای محیط آنلاین تنظیم نشده است.",
            adminNote: "تغییرات سهمیه برای کاربر بعد از ذخیره اعمال می‌شود.",
            user: "کاربر",
            access: "دسترسی",
            planLabel: "پلن",
            limit: "سقف هفتگی",
            saved: "ذخیره شد",
            search: "جست‌وجوی کاربر",
            allUsers: "همه کاربران",
            resetUsage: "صفر کردن مصرف",
            payments: "سوابق پرداخت",
            noPayments: "هنوز سابقه پرداختی ثبت نشده است.",
            usersCount: "کاربر",
            freeCount: "دسترسی رایگان",
            limitedCount: "محدود / پولی",
            confirmed: "ایمیل تأییدشده",
            unconfirmed: "ایمیل تأییدنشده",
            retry: "تلاش دوباره",
            suspended: "حساب تعلیق شده",
            active: "حساب فعال",
            security: "امنیت حساب",
            reason: "دلیل تغییر (الزامی)",
            billingExempt: "معاف از پرداخت",
            suspend: "تعلیق حساب",
            reactivate: "فعال‌سازی حساب",
            audit: "تاریخچه اقدامات مدیر",
            previous: "قبلی",
            next: "بعدی",
            page: "صفحه",
            retryAdmin: "بارگذاری دوباره فهرست کاربران",
            roleFilter: "نقش",
            planFilter: "پلن",
            accessFilter: "نوع دسترسی",
            statusFilter: "وضعیت حساب",
            allFilter: "همه",
            adminsOnly: "مدیران",
            usersOnly: "کاربران",
            suspendedOnly: "تعلیق‌شده",
            activeOnly: "فعال",
            joined: "عضویت",
            lastSignIn: "آخرین ورود",
            accessExpiry: "پایان دسترسی (اختیاری)",
            limited: "محدود",
            freeLegacy: "رایگان قدیمی",
            unlimitedAccess: "نامحدود",
            starter: "استارتر",
            creator: "کریتور",
            pro: "پرو",
          }
        : {
            dashboard: "Account dashboard",
            back: "Back to Studio",
            account: "Account",
            plan: "Subscription & access",
            admin: "User management",
            save: "Save changes",
            name: "Display name",
            current: "Current access",
            usage: "This week",
            renders: "renders",
            unlimited: "Unlimited",
            free: "Free artist access",
            buy: "Buy plan",
            pending: "Payment pending",
            noPayment:
              "The payment gateway is not configured for the online environment yet.",
            adminNote: "Quota changes apply to the user after saving.",
            user: "User",
            access: "Access",
            planLabel: "Plan",
            limit: "Weekly limit",
            saved: "Saved",
            search: "Search users",
            allUsers: "All users",
            resetUsage: "Reset usage",
            payments: "Payment history",
            noPayments: "No payment activity yet.",
            usersCount: "Users",
            freeCount: "Free access",
            limitedCount: "Paid / limited",
            confirmed: "Email confirmed",
            unconfirmed: "Email not confirmed",
            retry: "Retry",
            suspended: "Account suspended",
            active: "Account active",
            security: "Account security",
            reason: "Reason for change (required)",
            billingExempt: "Exempt from billing",
            suspend: "Suspend account",
            reactivate: "Reactivate account",
            audit: "Administrator activity history",
            previous: "Previous",
            next: "Next",
            page: "Page",
            retryAdmin: "Reload user list",
            roleFilter: "Role",
            planFilter: "Plan",
            accessFilter: "Access mode",
            statusFilter: "Account status",
            allFilter: "All",
            adminsOnly: "Admins",
            usersOnly: "Users",
            suspendedOnly: "Suspended",
            activeOnly: "Active",
            joined: "Joined",
            lastSignIn: "Last sign-in",
            accessExpiry: "Access ends (optional)",
            limited: "Limited",
            freeLegacy: "Legacy free",
            unlimitedAccess: "Unlimited",
            starter: "Starter",
            creator: "Creator",
            pro: "Pro",
          },
    [fa],
  );

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const verifiedUser = await getVerifiedStudioUser();
      setUser({ id: verifiedUser.id, email: verifiedUser.email });
      const nextProfile = await ensureMyProfile(
        typeof verifiedUser.user_metadata?.studio_username === "string"
          ? verifiedUser.user_metadata.studio_username
          : verifiedUser.email?.split("@")[0],
      );
      if (!nextProfile)
        throw new Error(
          fa
            ? "برای نمایش حساب دوباره وارد شوید."
            : "Please sign in again to load your account.",
        );
      setProfile({
        ...nextProfile,
        email: verifiedUser.email,
        email_confirmed_at: verifiedUser.email_confirmed_at || null,
      });
      setName(nextProfile?.display_name || "");
      const results = await Promise.allSettled([
        listSubscriptions(),
        listPaymentEvents(),
      ]);
      setSectionLoad({
        subscriptions: results[0].status,
        payments: results[1].status,
        admin: nextProfile.role === "admin" ? "loading" : "idle",
      });
      if (results[0].status === "fulfilled") setSubscriptions(results[0].value);
      if (results[1].status === "fulfilled") setPaymentEvents(results[1].value);
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected")
        setMessage(fa ? "بخشی از اطلاعات حساب بارگذاری نشد؛ همان بخش را دوباره بارگذاری کنید." : "Some account data could not load. Retry the affected section.");
    } catch (error) {
      setMessage(getFriendlyAuthError(error, fa ? "fa" : "en"));
    } finally {
      setBusy(false);
    }
  }
  async function loadAdminUsers() {
    if (profile?.role !== "admin") return;
    const requestId = ++adminRequest.current;
    setSectionLoad((current) => ({ ...current, admin: "loading" }));
    try {
      const pageData = await listAdminProfiles(adminQuery, 50, adminPage * 50, {
        role: (adminRoleFilter || undefined) as "user" | "admin" | undefined,
        plan: (adminPlanFilter || undefined) as PlanCode | undefined,
        accessMode: (adminAccessFilter || undefined) as AccessMode | undefined,
        suspended: adminSuspendedFilter === "" ? undefined : adminSuspendedFilter === "suspended",
      });
      if (requestId !== adminRequest.current) return;
      setAdminUsers(pageData.items);
      setAdminTotal(pageData.total);
      const audit = await listStudioAdminAudit(20);
      if (requestId !== adminRequest.current) return;
      setAdminAudit(audit);
      setSectionLoad((current) => ({ ...current, admin: "fulfilled" }));
    } catch (error) {
      if (requestId !== adminRequest.current) return;
      setSectionLoad((current) => ({ ...current, admin: "rejected" }));
      setMessage(getFriendlyAuthError(error, fa ? "fa" : "en"));
    }
  }
  useEffect(() => {
    dialog.current?.showModal();
    void load();
    void fetch("/api/billing/status", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((data) => setBillingReady(data.available === true))
      .catch(() => setBillingReady(false));
  }, []);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    const timer = window.setTimeout(() => void loadAdminUsers(), 200);
    return () => window.clearTimeout(timer);
  }, [profile?.role, adminQuery, adminPage, adminRoleFilter, adminPlanFilter, adminAccessFilter, adminSuspendedFilter]);

  async function saveName() {
    if (actionLock.current) return;
    actionLock.current = true;
    setSaving(true);
    setMessage("");
    try {
      const next = await updateMyDisplayName(name);
      setProfile(next);
      setMessage(copy.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save.");
    } finally {
      actionLock.current = false;
      setSaving(false);
    }
  }

  async function updateAccountSecurity(kind: "password" | "email") {
    if (actionLock.current) return;
    actionLock.current = true;
    setSecurityBusy(true);
    setSecurityMessage("");
    try {
      if (!user?.email || !currentPassword) throw new Error(fa ? "برای تأیید هویت، رمز فعلی را وارد کنید." : "Enter your current password to verify your identity.");
      const auth = getStudioAuthClient()?.auth;
      if (!auth) throw new Error(fa ? "سرویس ورود تنظیم نشده است." : "Studio authentication is not configured.");
      const { error: signInError } = await auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (signInError) throw signInError;
      if (kind === "password") {
        if (newPassword.length < 8) throw new Error(fa ? "رمز جدید باید دست‌کم ۸ نویسه باشد." : "The new password must be at least 8 characters.");
        const { error } = await auth.updateUser({ password: newPassword });
        if (error) throw error;
        setCurrentPassword(""); setNewPassword("");
        setSecurityMessage(fa ? "رمز عبور با موفقیت تغییر کرد." : "Password changed successfully.");
      } else {
        if (!newEmail.includes("@")) throw new Error(fa ? "ایمیل جدید معتبر نیست." : "Enter a valid new email address.");
        const { error } = await auth.updateUser({ email: newEmail.trim() });
        if (error) throw error;
        setNewEmail(""); setCurrentPassword("");
        setSecurityMessage(fa ? "پیوند تأیید به ایمیل جدید ارسال شد؛ تا تأیید، ایمیل قبلی فعال می‌ماند." : "A confirmation link was sent to the new email. Your current email remains active until confirmation.");
      }
    } catch (error) {
      setSecurityMessage(getFriendlyAuthError(error, fa ? "fa" : "en"));
    } finally {
      actionLock.current = false;
      setSecurityBusy(false);
    }
  }

  async function buy(code: PlanCode) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBuying(code);
    setMessage("");
    try {
      const token = (await refreshStudioSession())?.access_token;
      const response = await fetch("/api/billing/payping/create", {
        method: "POST",
        signal: AbortSignal.timeout(30000),
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ planCode: code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || copy.noPayment);
      window.location.assign(payload.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy.noPayment);
    } finally {
      actionLock.current = false;
      setBuying(null);
    }
  }

  async function saveAdmin(userId: string, patch: Partial<StudioProfile>, reason: string) {
    try {
      const saved = await updateAdminProfile(userId, patch, reason);
      if (saved) setAdminUsers((users) => users.map((item) => (item.user_id === userId ? { ...item, ...saved } : item)));
      if (saved?.user_id === user?.id) setProfile((current) => current ? { ...current, ...saved } : current);
      setAdminAudit(await listStudioAdminAudit(20));
      setMessage(copy.saved);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not update user.",
      );
      throw error;
    }
  }

  const freeUsers = adminUsers.filter(
    (item) => item.billing_exempt,
  ).length;
  const limitedUsers = adminUsers.filter(
    (item) => item.access_mode === "limited",
  ).length;
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(fa ? "fa-IR" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(value));

  return (
    <dialog
      ref={dialog}
      className="studio-account-dialog"
      onCancel={onClose}
      aria-labelledby="account-heading"
      dir={fa ? "rtl" : "ltr"}
    >
      <section className="studio-dashboard">
        <header className="studio-dashboard__header">
          <div className="studio-dashboard__title">
            <img src="/brand/vage-mark-white.png" alt="Vage Media" />
            <div>
              <span>VAGE MEDIA / STUDIO</span>
              <h2 id="account-heading">{copy.dashboard}</h2>
            </div>
          </div>
          <button
            className="studio-dialog-close"
            onClick={onClose}
            aria-label={copy.back}
          >
            ×
          </button>
        </header>
        <nav className="studio-account-nav" aria-label={copy.dashboard}>
          <a href="#studio-account">{copy.account}</a>
          <a href="#studio-plans">{copy.plan}</a>
          <a href="#studio-payments">{copy.payments}</a>
          <a href="#studio-security">{copy.security}</a>
          {profile?.role === "admin" && (
            <a href="#studio-admin">{copy.admin}</a>
          )}
          <button disabled={busy} onClick={() => void load()}>
            {fa ? "بازخوانی اطلاعات" : "Refresh account"}
          </button>
        </nav>
        {message && (
          <p className="studio-dashboard__message" role="status">
            {message}
          </p>
        )}
        {busy ? (
          <div className="studio-dashboard__loading">
            {fa ? "در حال بارگذاری حساب…" : "Loading account…"}
          </div>
        ) : !profile ? (
          <p role="alert">
            {fa
              ? "اطلاعات حساب در دسترس نیست؛ بازخوانی را بزنید."
              : "Account information is unavailable. Use Refresh account to retry."}
          </p>
        ) : (
          <>
            <div className="studio-dashboard__grid">
              <article
                id="studio-account"
                className="studio-dashboard__card studio-dashboard__card--account"
              >
                <span className="studio-dashboard__eyebrow">
                  {copy.account}
                </span>
                <h3>{user?.email || "Studio creator"}</h3>
                <small className={profile.email_confirmed_at ? "studio-account-status is-active" : "studio-account-status is-pending"}>
                  {profile.email_confirmed_at ? copy.confirmed : copy.unconfirmed}
                </small>
                <label>
                  {copy.name}
                  <input
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <button
                  className="studio-dashboard__button"
                  disabled={
                    saving || name.trim() === (profile.display_name || "")
                  }
                  onClick={saveName}
                >
                  {saving ? (fa ? "در حال ذخیره…" : "Saving…") : copy.save}
                </button>
                <small>
                  {fa ? "نوع حساب: " : "Account role: "}
                  {profile.role === "admin"
                    ? fa
                      ? "مدیر"
                      : "Administrator"
                    : copy.user}
                </small>
                <small className="studio-account-status">
                  {profile.is_suspended ? copy.suspended : copy.active}
                </small>
              </article>
              <article className="studio-dashboard__card studio-dashboard__card--usage">
                <span className="studio-dashboard__eyebrow">
                  {copy.current}
                </span>
                <strong>
                  {profile?.access_mode === "unlimited"
                    ? copy.unlimited
                    : profile?.access_mode === "free"
                      ? copy.free
                      : profile?.plan_code || "free"}
                </strong>
                <p>
                  {copy.usage}:{" "}
                  {profile?.access_mode === "unlimited" ||
                  profile?.access_mode === "free"
                    ? copy.unlimited
                    : `${profile?.renders_used_week || 0} / ${profile?.render_limit || 0} ${copy.renders}`}
                </p>
                {profile.access_mode === "limited" && profile.week_started_at && (
                  <small className="studio-dashboard__hint">
                    {fa ? "بازنشانی سهمیه: " : "Quota resets: "}
                    {dateLabel(new Date(new Date(profile.week_started_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())}
                  </small>
                )}
              </article>
            </div>
            <section id="studio-plans" className="studio-dashboard__section">
              <div className="studio-dashboard__section-heading">
                <div>
                  <span className="studio-dashboard__eyebrow">{copy.plan}</span>
                  <h3>
                    {fa
                      ? "پلنی را برای تولید انتخاب کن"
                      : "Choose a plan for your production"}
                  </h3>
                </div>
                <span className="studio-dashboard__hint">
              {sectionLoad.subscriptions === "rejected" ? <button type="button" onClick={() => void load()}>{copy.retry}</button> : subscriptions[0]?.status === "pending" ? copy.pending : ""}
                </span>
              </div>
              {!billingReady && (
                <p className="studio-dashboard__hint">{copy.noPayment}</p>
              )}
              <div className="studio-plan-grid">
                {studioPlans.map((plan) => (
                  <article
                    className={`studio-plan ${profile?.plan_code === plan.code ? "is-current" : ""}`}
                    key={plan.code}
                  >
                    <span>{plan.title}</span>
                    <strong>{toman(plan.price, fa)}</strong>
                    <small>{fa ? "ماهیانه" : "per month"}</small>
                    <p>{fa ? plan.note : `${plan.renders} renders per week`}</p>
                    <button
                      className="studio-dashboard__button"
                      disabled={!billingReady || buying !== null}
                      onClick={() => buy(plan.code)}
                    >
                      {buying === plan.code
                        ? fa
                          ? "اتصال به درگاه…"
                          : "Opening checkout…"
                        : copy.buy}
                    </button>
                  </article>
                ))}
              </div>
              {subscriptions
                .filter((s) => s.status === "active" && s.ends_at)
                .map((s) => (
                  <p key={s.id}>
                    {s.plan_code} ·{" "}
                    {fa ? "پایان اشتراک: " : "Subscription ends: "}
                    {dateLabel(s.ends_at!)}
                  </p>
                ))}
            </section>
            <section id="studio-payments" className="studio-dashboard__section">
              <div className="studio-dashboard__section-heading">
                <div>
                  <span className="studio-dashboard__eyebrow">
                    {copy.payments}
                  </span>
                  <h3>
                    {fa ? "سوابق پرداخت و اشتراک" : "Subscription activity"}
                  </h3>
                </div>
              </div>
              {sectionLoad.payments === "rejected" ? (
                <p className="studio-dashboard__empty" role="alert">{fa ? "سوابق پرداخت دریافت نشد." : "Payment history could not be loaded."} <button type="button" onClick={() => void load()}>{copy.retry}</button></p>
              ) : paymentEvents.length === 0 ? (
                <p className="studio-dashboard__empty">{copy.noPayments}</p>
              ) : (
                <div className="studio-payment-list">
                  {paymentEvents.map((event) => (
                    <div className="studio-payment-row" key={event.id}>
                      <div>
                        <strong>{event.gateway.toUpperCase()}</strong>
                        <small>
                          {dateLabel(event.created_at)} · {event.client_ref_id}
                        </small>
                      </div>
                      <span>{event.status}</span>
                      <b>{toman(event.amount_toman)}</b>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section id="studio-security" className="studio-dashboard__section">
              <div className="studio-dashboard__section-heading">
                <div>
                  <span className="studio-dashboard__eyebrow">{copy.security}</span>
                  <h3>{fa ? "تغییر رمز یا ایمیل" : "Change password or email"}</h3>
                </div>
              </div>
              <div className="studio-security-grid">
                <label>{fa ? "رمز فعلی برای تأیید" : "Current password (verification)"}<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
                <label>{fa ? "رمز جدید" : "New password"}<input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
                <button type="button" disabled={securityBusy || currentPassword.length === 0 || newPassword.length < 8} onClick={() => void updateAccountSecurity("password")}>{fa ? "تغییر رمز" : "Update password"}</button>
                <label>{fa ? "ایمیل جدید" : "New email"}<input type="email" autoComplete="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} /></label>
                <button type="button" disabled={securityBusy || currentPassword.length === 0 || !newEmail.includes("@")} onClick={() => void updateAccountSecurity("email")}>{fa ? "درخواست تغییر ایمیل" : "Request email change"}</button>
              </div>
              {securityMessage && <p role="status" aria-live="polite">{securityMessage}</p>}
            </section>
            {profile?.role === "admin" && (
              <section id="studio-admin" className="studio-dashboard__section studio-dashboard__section--admin">
                <div className="studio-dashboard__section-heading">
                  <div>
                    <span className="studio-dashboard__eyebrow">
                      {copy.admin}
                    </span>
                    <h3>
                      {fa
                        ? "مرکز مدیریت دسترسی و سهمیه"
                        : "Access and quota control"}
                    </h3>
                  </div>
                  <span className="studio-dashboard__hint">
                    {copy.adminNote}
                  </span>
                </div>
              <div className="studio-admin-stats">
                  <div>
                  <b>{adminTotal}</b>
                    <span>{copy.usersCount}</span>
                  </div>
                  <div>
                    <b>{freeUsers}</b>
                    <span>{copy.freeCount}</span>
                  </div>
                  <div>
                    <b>{limitedUsers}</b>
                    <span>{copy.limitedCount}</span>
                  </div>
                </div>
                <label className="studio-admin-search">
                  {copy.search}
                  <input
                    value={adminQuery}
                    onChange={(event) => { setAdminPage(0); setAdminQuery(event.target.value); }}
                    placeholder={copy.allUsers}
                  />
                </label>
                <div className="studio-admin-filters">
                  <label>{copy.roleFilter}<select value={adminRoleFilter} onChange={(event) => { setAdminPage(0); setAdminRoleFilter(event.target.value); }}><option value="">{copy.allFilter}</option><option value="user">{copy.usersOnly}</option><option value="admin">{copy.adminsOnly}</option></select></label>
                  <label>{copy.planFilter}<select value={adminPlanFilter} onChange={(event) => { setAdminPage(0); setAdminPlanFilter(event.target.value); }}><option value="">{copy.allFilter}</option>{(["free", "starter", "creator", "pro", "unlimited"] as PlanCode[]).map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
                  <label>{copy.accessFilter}<select value={adminAccessFilter} onChange={(event) => { setAdminPage(0); setAdminAccessFilter(event.target.value); }}><option value="">{copy.allFilter}</option>{(["limited", "free", "unlimited"] as AccessMode[]).map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
                  <label>{copy.statusFilter}<select value={adminSuspendedFilter} onChange={(event) => { setAdminPage(0); setAdminSuspendedFilter(event.target.value); }}><option value="">{copy.allFilter}</option><option value="active">{copy.activeOnly}</option><option value="suspended">{copy.suspendedOnly}</option></select></label>
                </div>
                <div className="studio-users">
                  {sectionLoad.admin === "loading" ? (
                    <p className="studio-dashboard__empty">{fa ? "در حال دریافت کاربران…" : "Loading users…"}</p>
                  ) : sectionLoad.admin === "rejected" ? (
                    <p className="studio-dashboard__empty" role="alert">{fa ? "فهرست کاربران دریافت نشد." : "Could not load users."} <button type="button" onClick={() => void loadAdminUsers()}>{copy.retryAdmin}</button></p>
                  ) : adminUsers.length ? (
                    adminUsers.map((item) => (
                      <AdminRow
                        key={item.user_id}
                        profile={item}
                        copy={copy}
                        onSave={saveAdmin}
                        fa={fa}
                        joinedLabel={copy.joined}
                        lastSignInLabel={copy.lastSignIn}
                        dateLabel={dateLabel}
                        labels={{limited: copy.limited, freeLegacy: copy.freeLegacy, unlimited: copy.unlimitedAccess, starter: copy.starter, creator: copy.creator, pro: copy.pro, expiry: copy.accessExpiry}}
                      />
                    ))
                  ) : (
                    <p className="studio-dashboard__empty">{copy.allUsers}</p>
                  )}
                </div>
                <div className="studio-admin-pagination">
                  <button type="button" disabled={adminPage === 0 || sectionLoad.admin === "loading"} onClick={() => setAdminPage((page) => Math.max(0, page - 1))}>{copy.previous}</button>
                  <span>{copy.page} {adminPage + 1} / {Math.max(1, Math.ceil(adminTotal / 50))}</span>
                  <button type="button" disabled={(adminPage + 1) * 50 >= adminTotal || sectionLoad.admin === "loading"} onClick={() => setAdminPage((page) => page + 1)}>{copy.next}</button>
                </div>
                <div className="studio-admin-audit">
                  <h4>{copy.audit}</h4>
                  {adminAudit.length ? adminAudit.map((entry) => (
                    <article key={entry.id}>
                      <time dateTime={entry.created_at}>{dateLabel(entry.created_at)}</time>
                      <span>{entry.reason}</span>
                      <small>{entry.target_user_id}</small>
                    </article>
                  )) : <p className="studio-dashboard__empty">{fa ? "هنوز اقدامی ثبت نشده است." : "No administrator actions recorded yet."}</p>}
                </div>
              </section>
            )}
          </>
        )}
        <footer className="studio-dashboard__footer">
          <button className="studio-dashboard__back" onClick={onClose}>
            ← {copy.back}
          </button>
        </footer>
      </section>
    </dialog>
  );
}

function AdminRow({
  profile,
  copy,
  onSave,
  fa,
  joinedLabel,
  lastSignInLabel,
  dateLabel,
  labels,
}: {
  profile: StudioProfile;
  copy: Record<string, string>;
  fa: boolean;
  joinedLabel: string;
  lastSignInLabel: string;
  dateLabel: (value: string) => string;
  labels: { limited: string; freeLegacy: string; unlimited: string; starter: string; creator: string; pro: string; expiry: string };
  onSave: (userId: string, patch: Partial<StudioProfile>, reason: string) => Promise<void>;
}) {
  const [access, setAccess] = useState<AccessMode>(profile.access_mode);
  const [plan, setPlan] = useState<PlanCode>(profile.plan_code);
  const [limit, setLimit] = useState(String(profile.render_limit));
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [billingExempt, setBillingExempt] = useState(Boolean(profile.billing_exempt));
  const [suspended, setSuspended] = useState(Boolean(profile.is_suspended));
  const [expiryDate, setExpiryDate] = useState(profile.access_expires_at?.slice(0, 10) || "");
  useEffect(() => {
    setAccess(profile.access_mode); setPlan(profile.plan_code); setLimit(String(profile.render_limit));
    setBillingExempt(Boolean(profile.billing_exempt)); setSuspended(Boolean(profile.is_suspended));
    setExpiryDate(profile.access_expires_at?.slice(0, 10) || "");
  }, [profile]);
  async function submit(reset = false) {
    if (lock.current) return;
    if (reason.trim().length < 3) { setError(fa ? "برای ثبت تغییر، دلیل کوتاهی بنویسید." : "Add a short reason before saving."); return; }
    if (reset && !window.confirm(fa ? "مصرف هفتگی این کاربر صفر شود؟" : "Reset this user's weekly usage?")) return;
    lock.current = true; setPending(true); setError("");
    try {
      await onSave(profile.user_id, reset ? { renders_used_week: 0 } : {
        access_mode: access, plan_code: plan, render_limit: Number(limit),
        billing_exempt: billingExempt, is_suspended: suspended,
        access_expires_at: expiryDate ? new Date(`${expiryDate}T23:59:59.999Z`).toISOString() : null,
      }, reason.trim());
      setReason("");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Update failed"); }
    finally { lock.current = false; setPending(false); }
  }
  return (
    <fieldset className="studio-user-row" disabled={pending}>
      <div>
        <strong>{profile.display_name || profile.user_id.slice(0, 8)}</strong>
        <small>{profile.user_id}</small>
        <small dir="ltr">{profile.email}</small>
        <small>{joinedLabel}: {dateLabel(profile.created_at)}</small>
        {profile.last_sign_in_at && <small>{lastSignInLabel}: {dateLabel(profile.last_sign_in_at)}</small>}
      </div>
      <label>
        {copy.access}
        <select
          value={access}
          onChange={(e) => setAccess(e.target.value as AccessMode)}
        >
          <option value="limited">{labels.limited}</option>
          {access === "free" && <option value="free">{labels.freeLegacy}</option>}
          <option value="unlimited">{labels.unlimited}</option>
        </select>
      </label>
      <label>
        {copy.planLabel}
        <select
          value={plan}
          onChange={(e) => {
            const code = e.target.value as PlanCode;
            setPlan(code); if (code === "unlimited") setAccess("unlimited"); else if (access === "unlimited") setAccess("limited");
            setLimit(String(studioPlans.find(p => p.code === code)?.renders ?? (code === "unlimited" ? 100000 : 2)));
          }}
        >
          <option value="free">{labels.freeLegacy}</option>
          <option value="starter">{labels.starter}</option>
          <option value="creator">{labels.creator}</option>
          <option value="pro">{labels.pro}</option>
          <option value="unlimited">{labels.unlimited}</option>
        </select>
      </label>
      <label className="studio-admin-check"><input type="checkbox" checked={billingExempt} onChange={(event) => setBillingExempt(event.target.checked)} />{copy.billingExempt}</label>
      <label className="studio-admin-check"><input type="checkbox" checked={suspended} onChange={(event) => setSuspended(event.target.checked)} />{suspended ? copy.reactivate : copy.suspend}</label>
      <label>{labels.expiry}<input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></label>
      <label>
        {copy.limit}
        <input
          type="number"
          min={0}
          max={100000}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </label>
      <label className="studio-admin-reason">{copy.reason}<input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="studio-user-actions">
        <button
          className="studio-dashboard__button"
          disabled={!Number.isInteger(Number(limit)) || Number(limit) < 0 || Number(limit) > 100000 || limit === "" || reason.trim().length < 3}
          onClick={() => void submit()}
        >
          {pending ? "…" : copy.save}
        </button>
        <button
          className="studio-dashboard__button studio-dashboard__button--quiet"
          disabled={reason.trim().length < 3}
          onClick={() => void submit(true)}
        >
          {copy.resetUsage}
        </button>
      </div>
      <small className="studio-user-usage">
        {profile.access_mode === "limited" ? `${profile.renders_used_week} / ${profile.render_limit}` : copy.unlimited}
      </small>
      {error && <small role="alert">{error}</small>}
    </fieldset>
  );
}
