import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/**
 * Local-disk evidence store for the staging pilot.
 *
 * Production must replace this with object storage (S3-compatible) plus malware scanning, retention
 * and lifecycle rules. Files are kept outside any web root and are only served through short-lived
 * signed URLs.
 */

export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type EvidenceContentType = (typeof EVIDENCE_CONTENT_TYPES)[number];

const EXTENSIONS: Record<EvidenceContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isEvidenceContentType(value: string): value is EvidenceContentType {
  return (EVIDENCE_CONTENT_TYPES as readonly string[]).includes(value);
}

export interface StoredEvidence {
  objectKey: string;
  contentType: EvidenceContentType;
  sizeBytes: number;
  sha256: string;
}

export class LocalEvidenceStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private target(objectKey: string): string {
    const target = resolve(this.root, objectKey);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error("Evidence object key escapes the store root.");
    }
    return target;
  }

  async put(input: {
    ownerId: string;
    contentType: EvidenceContentType;
    bytes: Uint8Array;
  }): Promise<StoredEvidence> {
    if (!isEvidenceContentType(input.contentType)) {
      throw new Error("Unsupported evidence content type.");
    }
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > EVIDENCE_MAX_BYTES) {
      throw new Error("Evidence file size is out of range.");
    }
    const owner = input.ownerId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    if (!owner) throw new Error("Evidence owner is required.");
    const objectKey = `${owner}/${randomUUID()}.${EXTENSIONS[input.contentType]}`;
    const target = this.target(objectKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.bytes, { mode: 0o600, flag: "wx" });
    return {
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    };
  }

  async get(objectKey: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.target(objectKey)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
