"use client";

import { useEffect, useRef, useState } from "react";
import Studio from "./Studio";
import {
  getStudioAuthClient,
  getFriendlyAuthError,
  getStoredStudioSession,
  studioAuthConfigured,
  type StudioSession,
} from "./studioAuth";

type Mode = "landing" | "signin" | "signup" | "forgot" | "resend" | "reset";
type StudioAuthClient = NonNullable<ReturnType<typeof getStudioAuthClient>>;

export default function StudioEntry() {
  const [client, setClient] = useState<StudioAuthClient | null>(null);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("landing");
  const [localPreview, setLocalPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [lang, setLang] = useState<"en" | "fa">("en");
  const langRef = useRef<"en" | "fa">("en");
  langRef.current = lang;
  const fa = lang === "fa";

  useEffect(() => {
    try {
      const savedLanguage = localStorage.getItem("vage-studio-language");
      if (savedLanguage === "fa" || savedLanguage === "en") {
        langRef.current = savedLanguage;
        setLang(savedLanguage);
      }
    } catch {
      // Language preference is optional when storage is unavailable.
    }
    const nextClient = getStudioAuthClient();
    setClient(nextClient);
    if (!nextClient) {
      setReady(true);
      return;
    }
    let active = true;
    void nextClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setSession((data.session as StudioSession | null) || getStoredStudioSession());
      if (error) setMessage(getFriendlyAuthError(error, langRef.current));
    }).catch((error: unknown) => {
      if (!active) return;
      setSession(getStoredStudioSession());
      setMessage(getFriendlyAuthError(error, langRef.current));
    }).finally(() => {
      if (active) setReady(true);
    });
    const { data } = nextClient.auth.onAuthStateChange((event, next) => {
      setSession((next as StudioSession | null) || getStoredStudioSession());
      if (event === "PASSWORD_RECOVERY") setMode("reset");
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <div className="studio-entry-loading">Loading Studio…</div>;
  if ((session && mode !== "reset") || localPreview) {
    return (
      <Studio
        storageScope={session?.user.id || "local-preview"}
        onSignOut={
          session && client
            ? async () => {
                const { error } = await client.auth.signOut({ scope: "local" });
                if (error) setMessage(getFriendlyAuthError(error, lang));
                setSession(null);
                setMode("landing");
              }
            : () => setLocalPreview(false)
        }
      />
    );
  }

  return (
    <main className="studio-entry" dir={fa ? "rtl" : "ltr"}>
      <div className="studio-entry__glow studio-entry__glow--one" />
      <div className="studio-entry__glow studio-entry__glow--two" />
      <header className="studio-entry__topbar">
        <a className="studio-entry__brand" href="https://vagemedia.com">
          <img src="/brand/vage-mark-white.png" alt="Vage Media" />
          <span>VAGE <small>MEDIA</small></span>
        </a>
        <div className="studio-entry__topbar-actions"><span className="studio-entry__product">VAGE CONTENT STUDIO</span><button className="studio-entry__language" onClick={() => { const next = fa ? "en" : "fa"; setLang(next); try { localStorage.setItem("vage-studio-language", next); } catch { /* optional preference */ } }}>{fa ? "EN" : "فارسی"}</button></div>
      </header>

      <section className="studio-entry__hero">
        <div className="studio-entry__copy">
          <p className="studio-entry__eyebrow">{fa ? "VAGE MEDIA / CREATIVE TOOL" : "VAGE MEDIA / CREATIVE TOOL"}</p>
          <h1>{fa ? "هر ایده را به یک خروجی حرفه‌ای تبدیل کن." : "Turn every idea into a polished release."}</h1>
          <p className="studio-entry__lede">
            {fa ? "برای شبکه‌های اجتماعی و پلتفرم‌های مختلف طراحی کن، لایه‌ها را کنترل کن، پیش‌نمایش بگیر و خروجی بگیر؛ همه‌چیز در یک استودیوی خلاق و امن." : "Design for social platforms, control every layer, preview motion and export locally in one focused creative studio."}
          </p>
          <div className="studio-entry__actions">
            <button className="studio-entry__primary" onClick={() => setMode("signup")}>
              {fa ? "ساخت حساب استودیو" : "Create Studio account"} <span>↗</span>
            </button>
            <button className="studio-entry__secondary" onClick={() => setMode("signin")}>
              {fa ? "ورود" : "Sign in"}
            </button>
          </div>
          {process.env.NODE_ENV !== "production" && (
            <button className="studio-entry__preview" onClick={() => setLocalPreview(true)}>
              {fa ? "ادامه در پیش‌نمایش محلی" : "Continue local preview"}
            </button>
          )}
          {!studioAuthConfigured && (
            <p className="studio-entry__config-note">
              Studio authentication is not connected in this environment yet. Production access stays locked until the separate Studio auth keys are configured.
            </p>
          )}
          {message && <p className="studio-entry__message">{message}</p>}
        </div>
        <div className="studio-entry__visual" aria-label="Audio reactive visualizer preview">
          <div className="studio-entry__visual-top"><span>VAGE / STUDIO</span><span>LIVE SIGNAL</span></div>
          <div className="studio-entry__album"><div className="studio-entry__album-orb" /><span>YOUR<br />NEXT<br />RELEASE</span></div>
          <div className="studio-entry__spectrum" aria-hidden="true">
            {Array.from({ length: 34 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 23) % 76)}%` }} />)}
          </div>
          <div className="studio-entry__visual-meta"><strong>AUDIO-REACTIVE VISUALS</strong><span>CREATE / PREVIEW / EXPORT</span></div>
        </div>
      </section>

      {mode !== "landing" && (
        <AuthPanel
          mode={mode}
          busy={busy}
          message={message}
          language={lang}
          onClose={() => { setMode("landing"); setMessage(""); }}
          onMode={setMode}
          onSubmit={async (form) => {
            if (!client) {
              setMessage("Connect the separate Studio Supabase project before creating accounts.");
              return;
            }
            setBusy(true);
            setMessage("");
            try {
              if (mode === "signup") {
                const { data, error } = await client.auth.signUp({
                  email: form.email,
                  password: form.password,
                  options: { data: { studio_username: form.username } },
                });
                if (error) throw error;
                if (!data.session) setMessage(fa ? "حساب ساخته شد. برای تأیید، ایمیل خود را بررسی کنید؛ سپس وارد شوید." : "Account created. Check your email to confirm access, then sign in.");
              } else if (mode === "signin") {
                const { error } = await client.auth.signInWithPassword({ email: form.email, password: form.password });
                if (error) throw error;
              } else if (mode === "forgot") {
                const { error } = await client.auth.resetPasswordForEmail(form.email, { redirectTo: window.location.origin });
                if (error) throw error;
                setMessage(fa ? "اگر این ایمیل حساب داشته باشد، پیوند بازیابی برایش ارسال می‌شود." : "If an account exists for this email, a password-reset link is on its way.");
              } else if (mode === "resend") {
                const { error } = await client.auth.resend({ type: "signup", email: form.email });
                if (error) throw error;
                setMessage(fa ? "اگر حساب نیاز به تأیید داشته باشد، ایمیل تازه ارسال شد." : "If the account needs confirmation, a new email has been sent.");
              } else if (mode === "reset") {
                const { error } = await client.auth.updateUser({ password: form.password });
                if (error) throw error;
                setMessage(fa ? "رمز عبور با موفقیت تغییر کرد." : "Your password was updated successfully.");
                setMode("landing");
              }
            } catch (error) {
              setMessage(getFriendlyAuthError(error, lang));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </main>
  );
}

function AuthPanel({
  mode,
  busy,
  message,
  onClose,
  onMode,
  onSubmit,
  language,
}: {
  mode: Exclude<Mode, "landing">;
  busy: boolean;
  message: string;
  onClose: () => void;
  onMode: (mode: Mode) => void;
  onSubmit: (form: { username: string; email: string; password: string }) => Promise<void>;
  language: "en" | "fa";
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const panel = useRef<HTMLFormElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const fa = language === "fa";
  const signup = mode === "signup";
  const needsPassword = mode === "signin" || signup || mode === "reset";
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && mode !== "reset") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, [mode]);
  const title = mode === "signup" ? (fa ? "ساخت حساب استودیو" : "Create your Studio account")
    : mode === "forgot" ? (fa ? "بازیابی رمز عبور" : "Reset your password")
    : mode === "resend" ? (fa ? "ارسال دوباره‌ی تأیید ایمیل" : "Resend confirmation email")
    : mode === "reset" ? (fa ? "انتخاب رمز جدید" : "Choose a new password")
    : (fa ? "خوش برگشتی" : "Welcome back");
  return (
    <div className="studio-auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && mode !== "reset") onClose(); }}>
      <form ref={panel} className="studio-auth-panel" role="dialog" aria-modal="true" aria-labelledby="studio-auth-title" onSubmit={(event) => {
        event.preventDefault();
        if (signup && password !== confirm) return;
        void onSubmit({ username, email, password });
      }}>
        <button type="button" className="studio-auth-close" onClick={onClose} aria-label={fa ? "بستن" : "Close"}>×</button>
        <p className="studio-entry__eyebrow">VAGE CONTENT STUDIO</p>
        <h2 id="studio-auth-title">{title}</h2>
        <p className="studio-auth-subtitle">{fa ? "این حساب مستقل از درگاه کاربران Vage Media است." : "This account is separate from Vage Media Portal."}</p>
        {signup && <label>{fa ? "نام کاربری استودیو" : "Studio username"}<input required maxLength={60} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>}
        {mode !== "reset" && <label>{fa ? "ایمیل" : "Email"}<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>}
        {needsPassword && <label>{mode === "reset" ? (fa ? "رمز جدید" : "New password") : (fa ? "رمز عبور" : "Password")}<span className="studio-auth-password"><input required minLength={8} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "reset" || signup ? "new-password" : "current-password"} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? (fa ? "پنهان کردن رمز" : "Hide password") : (fa ? "نمایش رمز" : "Show password")}>{showPassword ? (fa ? "پنهان" : "Hide") : (fa ? "نمایش" : "Show")}</button></span></label>}
        {signup && <label>{fa ? "تکرار رمز عبور" : "Confirm password"}<input required minLength={8} type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>}
        {signup && confirm && password !== confirm && <p className="studio-auth-error">{fa ? "رمزها یکسان نیستند." : "Passwords do not match."}</p>}
        {message && <p className="studio-auth-error" role="status" aria-live="polite">{message}</p>}
        <button className="studio-entry__primary studio-auth-submit" disabled={busy || (signup && password !== confirm)}>{busy ? (fa ? "در حال انجام…" : "Working…") : signup ? (fa ? "ساخت حساب" : "Create account") : mode === "signin" ? (fa ? "ورود" : "Sign in") : mode === "reset" ? (fa ? "ثبت رمز جدید" : "Save new password") : mode === "resend" ? (fa ? "ارسال دوباره" : "Resend email") : (fa ? "ارسال پیوند" : "Send reset link")}</button>
        {mode === "signin" && <button type="button" className="studio-auth-switch" disabled={busy} onClick={() => onMode("forgot")}>{fa ? "رمز را فراموش کرده‌اید؟" : "Forgot password?"}</button>}
        {mode === "signin" && <button type="button" className="studio-auth-switch" disabled={busy} onClick={() => onMode("resend")}>{fa ? "ایمیل تأیید را دوباره بفرست" : "Resend confirmation email"}</button>}
        {(mode === "signin" || mode === "signup") && <button type="button" className="studio-auth-switch" disabled={busy} onClick={() => onMode(signup ? "signin" : "signup")}>
          {signup ? (fa ? "حساب دارید؟ ورود" : "Already have an account? Sign in") : (fa ? "حساب ندارید؟ ثبت‌نام" : "Need an account? Sign up")}
        </button>}
        {(mode === "forgot" || mode === "resend") && <button type="button" className="studio-auth-switch" disabled={busy} onClick={() => onMode("signin")}>{fa ? "بازگشت به ورود" : "Back to sign in"}</button>}
      </form>
    </div>
  );
}
