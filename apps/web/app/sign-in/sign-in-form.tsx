"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Stage = "identify" | "verify";

export function SignInForm({ next }: { next?: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("identify");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const destination =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/orders";

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not request a code.");
      setStage("verify");
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
      const response = await fetch("/api/auth/verify", {
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

  if (stage === "verify") {
    return (
      <form className="stack auth-card" onSubmit={verifyCode}>
        <p className="muted">
          A simulated challenge was created for <strong>{identifier}</strong>. Enter the configured
          pilot code; no SMS or email was sent.
        </p>
        <label>
          Simulated OTP
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{4,8}"
            minLength={4}
            maxLength={8}
            required
            autoFocus
          />
        </label>
        {error ? <div className="notice err" role="alert">{error}</div> : null}
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Sign in securely"}
        </button>
        <button
          className="text-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setStage("identify");
            setError("");
          }}
        >
          Use a different identity
        </button>
      </form>
    );
  }

  return (
    <form className="stack auth-card" onSubmit={requestCode}>
      <label>
        Pilot email or phone
        <input
          name="identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="pilot1@buildkart.test"
          maxLength={320}
          required
          autoFocus
        />
      </label>
      {error ? <div className="notice err" role="alert">{error}</div> : null}
      <button className="button" type="submit" disabled={busy || !identifier.trim()}>
        {busy ? "Creating challenge…" : "Continue with simulated OTP"}
      </button>
    </form>
  );
}
