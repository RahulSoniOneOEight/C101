/**
 * Creates a Medusa/Mercur admin invite for an ops staff email.
 *
 * The invite token is returned to the caller so the superadmin can copy a set-password link when
 * Medusa email delivery is unavailable (staging). Production should use a dedicated service admin
 * account with the minimum role, never the shared bootstrap admin.
 */

export interface MedusaInvite {
  id: string;
  email: string;
  token: string;
  url: string;
}

export interface MedusaAdminInvitesOptions {
  baseUrl: string;
  email: string;
  password: string;
  /** Public ops base, for example https://ops-staging.pinakaplay.cloud */
  adminBaseUrl: string;
  fetchImpl?: typeof fetch;
}

interface LoginResponse {
  token?: string;
}

interface InviteResponse {
  invite?: {
    id?: string;
    email?: string;
    token?: string;
  };
}

export class MedusaAdminInvites {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly adminBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(options: MedusaAdminInvitesOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.email = options.email;
    this.password = options.password;
    this.adminBaseUrl = options.adminBaseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private tokenExpiry(token: string): number {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
      ) as { exp?: number };
      if (typeof payload.exp === "number") return payload.exp * 1000 - 30_000;
    } catch {
      // fall through
    }
    return Date.now() + 15 * 60 * 1000;
  }

  private async login(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const response = await this.fetchImpl(`${this.baseUrl}/auth/user/emailpass`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!response.ok) {
      throw new Error(`Medusa admin login failed (${response.status}).`);
    }
    const body = (await response.json()) as LoginResponse;
    if (!body.token) throw new Error("Medusa admin login returned no token.");
    this.cachedToken = { value: body.token, expiresAt: this.tokenExpiry(body.token) };
    return body.token;
  }

  private async create(email: string, token: string): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}/admin/invites`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    });
  }

  async createInvite(email: string): Promise<MedusaInvite> {
    let token = await this.login();
    let response = await this.create(email, token);
    if (response.status === 401) {
      this.cachedToken = null;
      token = await this.login();
      response = await this.create(email, token);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Medusa invite failed (${response.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}`,
      );
    }
    let body: InviteResponse;
    try {
      body = JSON.parse(text) as InviteResponse;
    } catch {
      throw new Error("Medusa invite returned invalid JSON.");
    }
    const invite = body.invite;
    if (!invite?.id || !invite.token) {
      throw new Error("Medusa invite returned no token.");
    }
    return {
      id: invite.id,
      email: invite.email ?? email,
      token: invite.token,
      url: `${this.adminBaseUrl}/dashboard/invite?token=${encodeURIComponent(invite.token)}`,
    };
  }

  async revokeInvite(id: string): Promise<void> {
    let token = await this.login();
    let response = await this.fetchImpl(`${this.baseUrl}/admin/invites/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      this.cachedToken = null;
      token = await this.login();
      response = await this.fetchImpl(`${this.baseUrl}/admin/invites/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Medusa invite revoke failed (${response.status}): ${text.replace(/\s+/g, " ").slice(0, 200)}`,
      );
    }
  }
}
