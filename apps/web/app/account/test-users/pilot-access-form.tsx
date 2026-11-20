"use client";

import { useState } from "react";
import type { PilotAccessDirectory, PilotAccessUser } from "@/lib/experience-api";

const CHANNEL_ROLES = new Set(["customer", "b2b_buyer"]);

function roleLabel(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function otherRoles(user: PilotAccessUser): string[] {
  return user.roles.filter((role) => !CHANNEL_ROLES.has(role));
}

function Row({
  user,
  onSaved,
}: {
  user: PilotAccessUser;
  onSaved: (user: PilotAccessUser) => void;
}) {
  const [customer, setCustomer] = useState(user.roles.includes("customer"));
  const [trade, setTrade] = useState(user.roles.includes("b2b_buyer"));
  const [business, setBusiness] = useState(user.business_account_id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const save = async () => {
    if (busy) return;
    if (!customer && !trade) {
      setError("Keep at least one channel.");
      return;
    }
    if (trade && !business.trim()) {
      setError("B2B Trade needs a business account.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const roles = [
        ...otherRoles(user),
        ...(customer ? ["customer"] : []),
        ...(trade ? ["b2b_buyer"] : []),
      ];
      const response = await fetch(`/api/admin/pilot-access/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roles,
          businessAccountId: trade ? business.trim() : user.business_account_id ?? "",
          sellerId: user.seller_id ?? "",
        }),
      });
      const payload = (await response.json()) as { user?: PilotAccessUser; error?: string };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error ?? "The tester could not be updated.");
      }
      setMessage("Saved");
      onSaved(payload.user);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td>
        <strong>{user.name}</strong>
        <small>{user.email}</small>
        <small>
          {user.id} · {user.source}
        </small>
      </td>
      <td>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={customer}
            onChange={(event) => {
              setCustomer(event.target.checked);
              setMessage("");
            }}
          />
          <span>Consumer</span>
        </label>
      </td>
      <td>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={trade}
            onChange={(event) => {
              setTrade(event.target.checked);
              setMessage("");
            }}
          />
          <span>B2B Trade</span>
        </label>
      </td>
      <td>
        <input
          className="admin-access-input"
          value={business}
          onChange={(event) => {
            setBusiness(event.target.value);
            setMessage("");
          }}
          placeholder="business_account_id"
          disabled={!trade}
        />
        {user.seller_id ? <small>Seller {user.seller_id}</small> : null}
      </td>
      <td>
        <div className="admin-role-list">
          {otherRoles(user).length ? (
            otherRoles(user).map((role) => (
              <span className="admin-role" key={role}>
                {roleLabel(role)}
              </span>
            ))
          ) : (
            <span className="muted">Channel access only</span>
          )}
        </div>
        {user.updated_by ? <small>Last by {user.updated_by}</small> : null}
      </td>
      <td>
        <button className="button" type="button" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {message ? <small className="admin-ok">{message}</small> : null}
        {error ? <small className="admin-error">{error}</small> : null}
      </td>
    </tr>
  );
}

export function PilotAccessForm({ initial }: { initial: PilotAccessDirectory }) {
  const [users, setUsers] = useState(initial.users);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const both = users.filter(
    (user) => user.roles.includes("customer") && user.roles.includes("b2b_buyer"),
  ).length;

  const refresh = async () => {
    const response = await fetch("/api/admin/pilot-access", { cache: "no-store" });
    const payload = (await response.json()) as PilotAccessDirectory & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "The directory could not be refreshed.");
    setUsers(payload.users);
  };

  const grantAll = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/pilot-access/grant-all", { method: "POST" });
      const payload = (await response.json()) as { updated?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "The access update failed.");
      await refresh();
      setMessage(`Both channels granted to ${payload.updated ?? 0} testers.`);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-access">
      <div className="admin-access-head">
        <div>
          <span className="eyebrow">Pilot directory</span>
          <h2>
            {both} of {users.length} testers have both channels
          </h2>
          <p className="muted">
            Grant both channels in one action, then fine-tune a single tester below. Existing
            seller and operator roles are preserved.
          </p>
        </div>
        <button className="button" type="button" onClick={() => void grantAll()} disabled={busy}>
          {busy ? "Granting…" : "Grant both channels to all"}
        </button>
      </div>
      {message ? <p className="admin-ok">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="admin-access-table-wrap">
        <table className="admin-access-table">
          <thead>
            <tr>
              <th>Tester</th>
              <th>Consumer</th>
              <th>B2B Trade</th>
              <th>Business account</th>
              <th>Other roles</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <Row
                key={`${user.id}:${user.updated_at ?? user.source}`}
                user={user}
                onSaved={(saved) =>
                  setUsers((current) =>
                    current.map((candidate) => (candidate.id === saved.id ? saved : candidate)),
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">
        Roles: {initial.roles.map(roleLabel).join(", ")}. A B2B role requires a business account.
        The shared staging account is <code>business_bazarbee_pilot</code>.
      </p>
    </section>
  );
}
