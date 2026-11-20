import { webcrypto } from "node:crypto";

/**
 * Verifies the Cloudflare Access assertion that the edge adds to every allowed ops request.
 *
 * The plain `Cf-Access-Authenticated-User-Email` header is never trusted; only the signed JWT is.
 * Keys are cached for an hour and refreshed once when an unknown `kid` appears.
 */

export interface AccessJwtClaims {
  email: string;
  sub: string | null;
  aud: string | string[];
  iss: string;
  exp: number;
  iat: number | null;
  nbf: number | null;
}

export type AccessJwtFailureReason =
  | "missing"
  | "malformed"
  | "unsupported-alg"
  | "unknown-key"
  | "bad-signature"
  | "expired"
  | "not-yet-valid"
  | "wrong-issuer"
  | "wrong-audience"
  | "no-email"
  | "jwks-unavailable";

export type AccessJwtResult =
  | { ok: true; claims: AccessJwtClaims }
  | { ok: false; reason: AccessJwtFailureReason; detail?: string };

interface Jwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

interface Jwks {
  keys?: Jwk[];
}

export interface AccessJwtVerifierOptions {
  teamDomain: string;
  audience: string;
  /** Test hook: bypass the network fetch. */
  jwks?: Jwks;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const KEY_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Bun's runtime exposes WebCrypto, but the Node typings in this workspace do not declare
 * `subtle`. Keep the surface narrow and typed locally.
 */
type SubtleLike = {
  importKey: (...args: unknown[]) => Promise<unknown>;
  verify: (...args: unknown[]) => Promise<boolean>;
};
const subtle = (webcrypto as unknown as { subtle: SubtleLike }).subtle;

function decodeJsonPart(part: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export class AccessJwtVerifier {
  private readonly teamDomain: string;
  private readonly audience: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly injectedJwks?: Jwks;
  private cache: { keys: Map<string, unknown>; expiresAt: number } | null = null;

  constructor(options: AccessJwtVerifierOptions) {
    this.teamDomain = options.teamDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    this.audience = options.audience;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.cacheTtlMs = options.cacheTtlMs ?? KEY_CACHE_TTL_MS;
    this.injectedJwks = options.jwks;
  }

  private async fetchJwks(): Promise<Jwks> {
    const response = await this.fetchImpl(`https://${this.teamDomain}/cdn-cgi/access/certs`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`JWKS request failed with ${response.status}`);
    return (await response.json()) as Jwks;
  }

  private async loadKeys(): Promise<Map<string, unknown>> {
    const source = this.injectedJwks ?? (await this.fetchJwks());
    const keys = new Map<string, unknown>();
    for (const jwk of source.keys ?? []) {
      if (!jwk.kid || jwk.kty !== "RSA" || !jwk.n || !jwk.e) continue;
      const key = await subtle.importKey(
        "jwk",
        { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    }
    if (keys.size === 0) throw new Error("JWKS contained no usable RSA keys");
    return keys;
  }

  private async keys(forceRefresh = false): Promise<Map<string, unknown>> {
    if (!forceRefresh && this.cache && this.cache.expiresAt > this.now()) {
      return this.cache.keys;
    }
    const keys = await this.loadKeys();
    this.cache = { keys, expiresAt: this.now() + this.cacheTtlMs };
    return keys;
  }

  async verify(token: string | null): Promise<AccessJwtResult> {
    if (!token?.trim()) return { ok: false, reason: "missing" };
    const parts = token.trim().split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed" };
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = decodeJsonPart(headerPart);
    const payload = decodeJsonPart(payloadPart);
    if (!header || !payload) return { ok: false, reason: "malformed" };
    if (header.alg !== "RS256" || typeof header.kid !== "string") {
      return { ok: false, reason: "unsupported-alg" };
    }

    let keys: Map<string, unknown>;
    try {
      keys = await this.keys();
    } catch (error) {
      return { ok: false, reason: "jwks-unavailable", detail: (error as Error).message };
    }
    let key = keys.get(header.kid);
    if (!key) {
      try {
        key = (await this.keys(true)).get(header.kid);
      } catch (error) {
        return { ok: false, reason: "jwks-unavailable", detail: (error as Error).message };
      }
    }
    if (!key) return { ok: false, reason: "unknown-key", detail: header.kid };

    let signatureValid = false;
    try {
      signatureValid = await subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        Buffer.from(signaturePart, "base64url"),
        Buffer.from(`${headerPart}.${payloadPart}`),
      );
    } catch (error) {
      return { ok: false, reason: "malformed", detail: (error as Error).message };
    }
    if (!signatureValid) return { ok: false, reason: "bad-signature" };

    const nowSeconds = Math.floor(this.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) {
      return { ok: false, reason: "expired" };
    }
    if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 60) {
      return { ok: false, reason: "not-yet-valid" };
    }
    if (payload.iss !== `https://${this.teamDomain}`) {
      return { ok: false, reason: "wrong-issuer", detail: String(payload.iss ?? "") };
    }
    const audience = payload.aud;
    const audienceMatches =
      audience === this.audience ||
      (Array.isArray(audience) && audience.some((value) => value === this.audience));
    if (!audienceMatches) {
      return { ok: false, reason: "wrong-audience" };
    }
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email) return { ok: false, reason: "no-email" };

    return {
      ok: true,
      claims: {
        email,
        sub: typeof payload.sub === "string" ? payload.sub : null,
        aud: audience as string | string[],
        iss: String(payload.iss),
        exp: payload.exp,
        iat: typeof payload.iat === "number" ? payload.iat : null,
        nbf: typeof payload.nbf === "number" ? payload.nbf : null,
      },
    };
  }
}
