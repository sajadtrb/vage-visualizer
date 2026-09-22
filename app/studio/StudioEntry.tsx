"use client";

import { useEffect, useState } from "react";
import Studio from "./Studio";
import {
  getStudioAuthClient,
  studioAuthConfigured,
  type StudioSession,
} from "./studioAuth";

type Mode = "landing" | "signin" | "signup";
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
  const fa = lang === "fa";

  useEffect(() => {
    const nextClient = getStudioAuthClient();
    setClient(nextClient);
    if (!nextClient) {
      setReady(true);
      return;
    }
    let active = true;
    void nextClient.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const refreshTimer = window.setInterval(() => {
      void nextClient.auth.getSession();
    }, 60_000);
    const { data } = nextClient.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      data.subscription.unsubscribe();
    };
  }, []);

  if (!ready) return <div className="studio-entry-loading">Loading Studio…</div>;
  if (session || localPreview) {
    return (
      <Studio
        storageScope={session?.user.id || "local-preview"}
        onSignOut={
          session && client
            ? async () => {
                await client.auth.signOut();
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
        <div className="studio-entry__topbar-actions"><span className="studio-entry__product">VAGE CONTENT STUDIO</span><button className="studio-entry__language" onClick={() => setLang(fa ? "en" : "fa")}>{fa ? "EN" : "فارسی"}</button></div>
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
          {!studioAuthConfigured && process.env.NODE_ENV !== "production" && (
            <button className="studio-entry__preview" onClick={() => setLocalPreview(true)}>
              Continue local preview
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
                if (!data.session) setMessage("Account created. Check your email to confirm access, then sign in.");
              } else {
                const { error } = await client.auth.signInWithPassword({ email: form.email, password: form.password });
                if (error) throw error;
              }
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Authentication failed.");
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
}: {
  mode: Mode;
  busy: boolean;
  message: string;
  onClose: () => void;
  onMode: (mode: Mode) => void;
  onSubmit: (form: { username: string; email: string; password: string }) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const signup = mode === "signup";
  return (
    <div className="studio-auth-backdrop" role="dialog" aria-modal="true" aria-label={signup ? "Create Studio account" : "Sign in to Studio"}>
      <form className="studio-auth-panel" onSubmit={(event) => {
        event.preventDefault();
        if (signup && password !== confirm) return;
        void onSubmit({ username, email, password });
      }}>
        <button type="button" className="studio-auth-close" onClick={onClose}>×</button>
        <p className="studio-entry__eyebrow">VAGE CONTENT STUDIO</p>
        <h2>{signup ? "Create your Studio account" : "Welcome back"}</h2>
        <p className="studio-auth-subtitle">This account is separate from Vage Media Portal.</p>
        {signup && <label>Studio username<input required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></label>}
        <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label>Password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} /></label>
        {signup && <label>Confirm password<input required minLength={8} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></label>}
        {signup && confirm && password !== confirm && <p className="studio-auth-error">Passwords do not match.</p>}
        {message && <p className="studio-auth-error">{message}</p>}
        <button className="studio-entry__primary studio-auth-submit" disabled={busy || (signup && password !== confirm)}>{busy ? "Working…" : signup ? "Create account" : "Sign in"}</button>
        <button type="button" className="studio-auth-switch" onClick={() => onMode(signup ? "signin" : "signup")}>
          {signup ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </form>
    </div>
  );
}
