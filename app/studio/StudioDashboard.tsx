"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ensureMyProfile,
  getStudioUser,
  getMyProfile,
  listAdminProfiles,
  listSubscriptions,
  studioPlans,
  updateAdminProfile,
  updateMyDisplayName,
  type StudioProfile,
  type StudioSubscription,
  type AccessMode,
  type PlanCode,
} from "./studioData";
import { getStoredStudioSession } from "./studioAuth";

function toman(value: number) {
  return `${new Intl.NumberFormat("fa-IR").format(value)} تومان`;
}

export default function StudioDashboard({ onClose, lang = "en" }: { onClose: () => void; lang?: string }) {
  const fa = lang === "fa";
  const [profile, setProfile] = useState<StudioProfile | null>(null);
  const [subscriptions, setSubscriptions] = useState<StudioSubscription[]>([]);
  const [adminUsers, setAdminUsers] = useState<StudioProfile[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const user = getStudioUser();

  const copy = useMemo(() => fa ? {
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
  } : {
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
    noPayment: "The payment gateway is not configured for the online environment yet.",
    adminNote: "Quota changes apply to the user after saving.",
    user: "User",
    access: "Access",
    planLabel: "Plan",
    limit: "Weekly limit",
    saved: "Saved",
  }, [fa]);

  async function load() {
    setBusy(true);
    try {
      const [nextProfile, nextSubscriptions] = await Promise.all([ensureMyProfile(), listSubscriptions()]);
      setProfile(nextProfile);
      setSubscriptions(nextSubscriptions);
      setName(nextProfile?.display_name || "");
      if (nextProfile?.role === "admin") setAdminUsers(await listAdminProfiles());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load account data.");
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function saveName() {
    try {
      const next = await updateMyDisplayName(name);
      setProfile(next);
      setMessage(copy.saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save."); }
  }

  async function buy(code: PlanCode) {
    setMessage("");
    try {
      const token = getStoredStudioSession()?.access_token;
      const response = await fetch("/api/billing/payping/create", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ planCode: code }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || copy.noPayment);
      window.location.assign(payload.checkoutUrl);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.noPayment); }
  }

  async function saveAdmin(userId: string, patch: Partial<StudioProfile>) {
    try {
      const saved = await updateAdminProfile(userId, patch);
      if (saved) setAdminUsers((users) => users.map((item) => item.user_id === userId ? saved : item));
      setMessage(copy.saved);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update user."); }
  }

  return <div className="studio-dashboard-backdrop" role="dialog" aria-modal="true" dir={fa ? "rtl" : "ltr"}>
    <section className="studio-dashboard">
      <header className="studio-dashboard__header">
        <div className="studio-dashboard__title"><img src="/brand/vage-mark-white.png" alt="Vage Media" /><div><span>VAGE MEDIA / STUDIO</span><h2>{copy.dashboard}</h2></div></div>
        <button className="studio-dialog-close" onClick={onClose} aria-label={copy.back}>×</button>
      </header>
      {busy ? <div className="studio-dashboard__loading">Loading account…</div> : <>
        <div className="studio-dashboard__grid">
          <article className="studio-dashboard__card studio-dashboard__card--account">
            <span className="studio-dashboard__eyebrow">{copy.account}</span>
            <h3>{user?.email || "Studio creator"}</h3>
            <label>{copy.name}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
            <button className="studio-dashboard__button" onClick={saveName}>{copy.save}</button>
          </article>
          <article className="studio-dashboard__card studio-dashboard__card--usage">
            <span className="studio-dashboard__eyebrow">{copy.current}</span>
            <strong>{profile?.access_mode === "unlimited" ? copy.unlimited : profile?.access_mode === "free" ? copy.free : profile?.plan_code || "free"}</strong>
            <p>{copy.usage}: {profile?.access_mode === "unlimited" || profile?.access_mode === "free" ? copy.unlimited : `${profile?.renders_used_week || 0} / ${profile?.render_limit || 0} ${copy.renders}`}</p>
          </article>
        </div>
        <section className="studio-dashboard__section">
          <div className="studio-dashboard__section-heading"><div><span className="studio-dashboard__eyebrow">{copy.plan}</span><h3>{fa ? "پلنی را برای تولید انتخاب کن" : "Choose a plan for your production"}</h3></div><span className="studio-dashboard__hint">{subscriptions[0]?.status === "pending" ? copy.pending : ""}</span></div>
          <div className="studio-plan-grid">{studioPlans.map((plan) => <article className={`studio-plan ${profile?.plan_code === plan.code ? "is-current" : ""}`} key={plan.code}><span>{plan.title}</span><strong>{toman(plan.price)}</strong><p>{plan.note}</p><button className="studio-dashboard__button" onClick={() => buy(plan.code)}>{copy.buy}</button></article>)}</div>
        </section>
        {message && <p className="studio-dashboard__message" role="status">{message}</p>}
        {profile?.role === "admin" && <section className="studio-dashboard__section"><div className="studio-dashboard__section-heading"><div><span className="studio-dashboard__eyebrow">{copy.admin}</span><h3>{fa ? "دسترسی هنرمندان و تیم را کنترل کن" : "Control artist and team access"}</h3></div><span className="studio-dashboard__hint">{copy.adminNote}</span></div><div className="studio-users">{adminUsers.map((item) => <AdminRow key={item.user_id} profile={item} copy={copy} onSave={saveAdmin} />)}</div></section>}
      </>}
      <footer className="studio-dashboard__footer"><button className="studio-dashboard__back" onClick={onClose}>← {copy.back}</button></footer>
    </section>
  </div>;
}

function AdminRow({ profile, copy, onSave }: { profile: StudioProfile; copy: Record<string, string>; onSave: (userId: string, patch: Partial<StudioProfile>) => Promise<void> }) {
  const [access, setAccess] = useState<AccessMode>(profile.access_mode);
  const [plan, setPlan] = useState<PlanCode>(profile.plan_code);
  const [limit, setLimit] = useState(String(profile.render_limit));
  return <div className="studio-user-row"><div><strong>{profile.display_name || profile.user_id.slice(0, 8)}</strong><small>{profile.user_id}</small></div><label>{copy.access}<select value={access} onChange={(e) => setAccess(e.target.value as AccessMode)}><option value="limited">Limited</option><option value="free">Free</option><option value="unlimited">Unlimited</option></select></label><label>{copy.planLabel}<select value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)}><option value="free">Free</option><option value="starter">Starter</option><option value="creator">Creator</option><option value="pro">Pro</option><option value="unlimited">Unlimited</option></select></label><label>{copy.limit}<input type="number" min={0} max={100000} value={limit} onChange={(e) => setLimit(e.target.value)} /></label><button className="studio-dashboard__button" onClick={() => onSave(profile.user_id, { access_mode: access, plan_code: plan, render_limit: Math.max(0, Number(limit) || 0) })}>{copy.save}</button></div>;
}
