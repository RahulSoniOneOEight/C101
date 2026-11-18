"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "code" | "magic";
type Stage = "identify" | "verify" | "link-sent";

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("code");
  const [stage, setStage] = useState<Stage>("identify");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewCode, setPreviewCode] = useState("");
  const [previewLink, setPreviewLink] = useState("");

  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";
  const signInHref =
    destination === "/orders" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(destination)}`;

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setStage("identify");
    setError("");
    setPreviewCode("");
    setPreviewLink("");
  }

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/email/code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { error?: string; preview_code?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not send a sign-in code.");
      setPreviewCode(data.preview_code ?? "");
      setStage("verify");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/email/magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { error?: string; preview_link?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not send a sign-in link.");
      setPreviewLink(data.preview_link ?? "");
      setStage("link-sent");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: form.get("code") }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not verify the code.");
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tabs = (
    <div className="auth-tabs" role="tablist" aria-label="Sign-in method">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "code"}
        className={mode === "code" ? "auth-tab active" : "auth-tab"}
        onClick={() => switchMode("code")}
      >
        Email code
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "magic"}
        className={mode === "magic" ? "auth-tab active" : "auth-tab"}
        onClick={() => switchMode("magic")}
      >
        Magic link
      </button>
    </div>
  );

  if (stage === "verify") {
    return (
      <div className="auth-card">
        {tabs}
        <form className="stack" onSubmit={verifyCode}>
          <p className="muted auth-intro">
            {previewCode
              ? "Staging preview code for "
              : "We emailed a six-digit code to "}
            <strong>{email}</strong>. It expires in 10 minutes.
          </p>
          {previewCode ? (
            <div className="notice simulation-notice" role="status">
              No email was sent in staging. Your code is <strong>{previewCode}</strong>.
            </div>
          ) : null}
          <label>
            Six-digit code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              autoFocus
              className="otp-input"
            />
          </label>
          {error ? <div className="notice err" role="alert">{error}</div> : null}
          <button className="button" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setStage("identify");
              setError("");
              setPreviewCode("");
            }}
          >
            Use a different email
          </button>
        </form>
      </div>
    );
  }

  if (stage === "link-sent") {
    return (
      <div className="auth-card">
        {tabs}
        <div className="auth-link-sent">
          <span className="auth-icon" aria-hidden="true">✉</span>
          <h2>Check your inbox</h2>
          <p className="muted">
            We sent a single-use sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
          </p>
          {previewLink ? (
            <div className="notice simulation-notice">
              Staging preview only — no email was sent.{" "}
              <a href={previewLink}>Open your sign-in link</a>.
            </div>
          ) : null}
          {error ? <div className="notice err" role="alert">{error}</div> : null}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setStage("identify");
              setPreviewLink("");
              setError("");
            }}
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      {tabs}
      {mode === "code" ? (
        <form className="stack" onSubmit={requestCode}>
          <p className="muted auth-intro">
            Enter your email and we&apos;ll send a six-digit code. No password to remember.
          </p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              maxLength={320}
              required
              autoFocus
            />
          </label>
          {error ? <div className="notice err" role="alert">{error}</div> : null}
          <button className="button" type="submit" disabled={busy || !email.trim()}>
            {busy ? "Sending code…" : "Email me a code"}
          </button>
          <p className="field-hint">
            Only allowlisted staging pilot emails can sign in.{" "}
            <Link href="/">Continue shopping instead</Link>
          </p>
        </form>
      ) : (
        <form className="stack" onSubmit={requestLink}>
          <p className="muted auth-intro">
            We&apos;ll email you a single-use link. Open it on this device and you&apos;re signed in.
          </p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              maxLength={320}
              required
              autoFocus
            />
          </label>
          {error ? <div className="notice err" role="alert">{error}</div> : null}
          <button className="button" type="submit" disabled={busy || !email.trim()}>
            {busy ? "Sending link…" : "Email me a sign-in link"}
          </button>
          <p className="field-hint">
            The link can be used once and expires after 15 minutes.{" "}
            <Link href="/">Continue shopping instead</Link>
          </p>
        </form>
      )}
    </div>
  );
}

export function SignInPrompt({ next }: { next?: string }) {
  return (
    <Link className="button" href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"}>
      Sign in
    </Link>
  );
}
