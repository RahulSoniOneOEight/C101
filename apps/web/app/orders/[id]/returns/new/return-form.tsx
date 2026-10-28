"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

interface ReturnableLine {
  lineKey: string;
  sku: string;
  title: string;
  returnableQty: number;
  allowedReasons: string[];
}

interface Props {
  orderId: string;
  lines: ReturnableLine[];
}

const REASON_LABELS: Record<string, string> = {
  damaged: "Arrived damaged",
  wrong_item: "Wrong item",
  not_as_described: "Not as described",
};

const reasonLabel = (value: string) =>
  REASON_LABELS[value] ?? value.replaceAll("_", " ");

export function ReturnForm({ orderId, lines }: Props) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((line) => [line.lineKey, 0])),
  );
  const [resolution, setResolution] = useState<"refund" | "replacement">("refund");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "uploading" | "creating">("idle");
  const [error, setError] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const reasonOptions = useMemo(() => {
    const shared = lines
      .map((line) => new Set(line.allowedReasons))
      .reduce<string[] | null>((current, next) => {
        if (current === null) return [...next];
        return current.filter((reason) => next.has(reason));
      }, null);
    return shared && shared.length > 0 ? shared : (lines[0]?.allowedReasons ?? []);
  }, [lines]);
  const [reason, setReason] = useState<string>(reasonOptions[0] ?? "damaged");

  const chosen = lines
    .map((line) => ({
      lineKey: line.lineKey,
      requestedQty: Math.min(
        line.returnableQty,
        Math.max(0, Math.trunc(quantities[line.lineKey] ?? 0)),
      ),
    }))
    .filter((line) => line.requestedQty > 0);
  const totalUnits = chosen.reduce((total, line) => total + line.requestedQty, 0);

  function setQuantity(line: ReturnableLine, value: string) {
    const parsed = Number.parseInt(value, 10);
    const quantity = Number.isFinite(parsed)
      ? Math.min(line.returnableQty, Math.max(0, parsed))
      : 0;
    setQuantities((current) => ({ ...current, [line.lineKey]: quantity }));
  }

  const MAX_FILES = 3;
  const MAX_BYTES = 5 * 1024 * 1024;
  const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

  function addFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return;
    const incoming = Array.from(selected);
    for (const file of incoming) {
      if (!ALLOWED.includes(file.type)) {
        setError("Evidence must be a JPEG, PNG or WebP image.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 5 MB.`);
        return;
      }
    }
    if (files.length + incoming.length > MAX_FILES) {
      setError(`Attach at most ${MAX_FILES} photos.`);
      return;
    }
    setError("");
    setFiles((current) => [...current, ...incoming]);
  }

  async function uploadEvidence(): Promise<
    Array<{ objectKey: string; contentType: string; sizeBytes: number; sha256: string }>
  > {
    const stored: Array<{
      objectKey: string;
      contentType: string;
      sizeBytes: number;
      sha256: string;
    }> = [];
    for (const file of files) {
      const body = new FormData();
      body.append("file", file, file.name);
      const response = await fetch(
        `/api/returns/evidence?orderId=${encodeURIComponent(orderId)}`,
        { method: "POST", body },
      );
      const data = (await response.json()) as {
        error?: string;
        evidence?: {
          objectKey?: string;
          contentType?: string;
          sizeBytes?: number;
          sha256?: string;
        };
      };
      if (
        !response.ok ||
        !data.evidence?.objectKey ||
        !data.evidence.contentType ||
        typeof data.evidence.sizeBytes !== "number" ||
        !data.evidence.sha256
      ) {
        throw new Error(data.error ?? `Could not upload ${file.name}.`);
      }
      stored.push({
        objectKey: data.evidence.objectKey,
        contentType: data.evidence.contentType,
        sizeBytes: data.evidence.sizeBytes,
        sha256: data.evidence.sha256,
      });
    }
    return stored;
  }

  const idempotencyKey = () => {
    const fingerprint = JSON.stringify({ resolution, reason, comment, chosen });
    if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    return attempt.current.key;
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (chosen.length === 0) {
      setError("Choose at least one item and quantity to return.");
      return;
    }
    if (!reasonOptions.includes(reason)) {
      setError("Choose an allowed return reason.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setStage("uploading");
      const evidence = files.length > 0 ? await uploadEvidence() : [];
      setStage("creating");
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId,
          idempotencyKey: idempotencyKey(),
          resolution,
          reasonCode: reason,
          comment,
          lines: chosen,
          evidence,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        return?: { id?: string };
      };
      if (!response.ok || !data.return?.id) {
        throw new Error(data.error ?? "The return request was not accepted.");
      }
      router.push(`/returns/${encodeURIComponent(data.return.id)}`);
      router.refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
      setStage("idle");
    }
  }

  return (
    <form className="stack return-form" onSubmit={submit}>
      <fieldset className="return-lines">
        <legend>Items</legend>
        {lines.map((line) => {
          const quantity = quantities[line.lineKey] ?? 0;
          return (
            <div className="return-line" key={line.lineKey}>
              <div>
                <strong>{line.title}</strong>
                <span className="muted">
                  SKU {line.sku} · {line.returnableQty} returnable
                </span>
              </div>
              <label className="qty-field">
                Qty
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={line.returnableQty}
                  step={1}
                  value={quantity}
                  onChange={(event) => setQuantity(line, event.target.value)}
                  aria-label={`Return quantity for ${line.title}`}
                />
              </label>
            </div>
          );
        })}
      </fieldset>

      <label>
        Reason
        <select value={reason} onChange={(event) => setReason(event.target.value)} required>
          {reasonOptions.map((option) => (
            <option key={option} value={option}>
              {reasonLabel(option)}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="resolution-field">
        <legend>Resolution</legend>
        <label className="inline-option">
          <input
            type="radio"
            name="resolution"
            checked={resolution === "refund"}
            onChange={() => setResolution("refund")}
          />
          Refund (simulated)
        </label>
        <label className="inline-option">
          <input
            type="radio"
            name="resolution"
            checked={resolution === "replacement"}
            onChange={() => setResolution("replacement")}
          />
          Replacement
        </label>
      </fieldset>

      <label>
        Notes (optional)
        <textarea
          rows={3}
          maxLength={1000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What went wrong with these items?"
        />
      </label>

      <fieldset className="evidence-picker">
        <legend>Photos (optional)</legend>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(event) => {
            addFiles(event.target.files);
            event.currentTarget.value = "";
          }}
          aria-label="Attach photos of the items"
        />
        <span className="field-hint">
          Up to 3 photos, 5 MB each. JPEG, PNG or WebP. Stored privately and shown to the marketplace
          team reviewing the request.
        </span>
        {files.length > 0 ? (
          <ul className="file-list">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </fieldset>

      {error ? (
        <div className="notice err" role="alert">
          {error}
        </div>
      ) : null}

      <div className="form-actions">
        <button className="button" type="submit" disabled={busy || totalUnits === 0}>
          {busy
            ? stage === "uploading"
              ? "Uploading photos…"
              : "Requesting…"
            : `Request return${totalUnits > 0 ? ` (${totalUnits})` : ""}`}
        </button>
        <span className="field-hint">
          {totalUnits === 0
            ? "Set a quantity on at least one item."
            : "The marketplace reviews the request; no money moves yet."}
        </span>
      </div>
    </form>
  );
}
