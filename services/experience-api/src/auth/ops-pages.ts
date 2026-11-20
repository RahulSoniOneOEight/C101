import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-rendered ops identity pages.
 *
 * Every form carries a short-lived HMAC token bound to the Cloudflare-verified email. The pages are
 * intentionally dependency-free so they work behind Access without a separate frontend build.
 */

const FORM_TTL_SECONDS = 10 * 60;

export function issueFormToken(email: string, key: Buffer, nowMs = Date.now()): string {
  const expires = Math.floor(nowMs / 1000) + FORM_TTL_SECONDS;
  const mac = createHmac("sha256", key)
    .update(`ops-form:${email}:${expires}`)
    .digest("base64url");
  return `${expires}.${mac}`;
}

export function verifyFormToken(
  token: string,
  email: string,
  key: Buffer,
  nowMs = Date.now(),
): boolean {
  const [expiresRaw, mac] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isInteger(expires) || expires * 1000 < nowMs || !mac) return false;
  const expected = createHmac("sha256", key)
    .update(`ops-form:${email}:${expires}`)
    .digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(title)} · BazarBee Ops</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #f4f5f7; color: #111827;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: min(440px, calc(100% - 2rem)); margin: 7vh auto 4vh; background: #fff;
         border: 1px solid #e5e7eb; border-radius: 14px; padding: 26px 24px 22px;
         box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.1rem; }
  .brand strong { font-size: .95rem; letter-spacing: .04em; text-transform: uppercase; }
  .badge { font-size: .7rem; color: #6b7280; border: 1px solid #e5e7eb; border-radius: 999px;
           padding: .15rem .5rem; }
  h1 { font-size: 1.2rem; margin: 0 0 .35rem; }
  p { color: #4b5563; font-size: .9rem; line-height: 1.5; margin: .4rem 0 .2rem; }
  label { display: block; font-size: .8rem; font-weight: 600; color: #374151;
          margin: 1.1rem 0 .35rem; }
  input { width: 100%; padding: .72rem .8rem; border: 1px solid #d1d5db; border-radius: 8px;
          font-size: 1rem; font-family: inherit; }
  input:focus { outline: 2px solid #111827; outline-offset: 1px; border-color: #111827; }
  button { width: 100%; margin-top: 1.1rem; padding: .78rem; border: 0; border-radius: 8px;
           background: #111827; color: #fff; font-size: .95rem; font-weight: 600; cursor: pointer; }
  button:hover { background: #1f2937; }
  .error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; border-radius: 8px;
           padding: .6rem .7rem; font-size: .85rem; margin: 1rem 0 0; }
  .notice { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;
            padding: .7rem .8rem; font-size: .85rem; margin: 1rem 0 0; }
  .secret { display: block; margin-top: .5rem; padding: .7rem .8rem; background: #f3f4f6;
            border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: .82rem; word-break: break-all; }
  .codes { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; margin: 1rem 0 0;
           font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85rem; }
  .codes span { background: #f3f4f6; border-radius: 6px; padding: .4rem .5rem; text-align: center; }
  a { color: #111827; font-weight: 600; }
  .footer { margin-top: 1.4rem; font-size: .78rem; color: #6b7280; }
</style>
</head>
<body>
<main>
  <div class="brand"><strong>BazarBee</strong><span class="badge">Ops · staging</span></div>
  ${body}
</main>
</body>
</html>`;
}

export function opsLoginPage(options: {
  email: string;
  csrf: string;
  next: string;
  error?: string;
}): string {
  return layout(
    "Sign in",
    `<h1>Authenticator code</h1>
     <p>Signed in as <strong>${escapeHtml(options.email)}</strong> through Cloudflare Access.
        Enter the six-digit code from your authenticator app.</p>
     ${options.error ? `<div class="error">${escapeHtml(options.error)}</div>` : ""}
     <form method="post" action="/v1/ops/totp/verify">
       <input type="hidden" name="csrf" value="${escapeHtml(options.csrf)}" />
       <input type="hidden" name="next" value="${escapeHtml(options.next)}" />
       <label for="code">Authenticator or recovery code</label>
       <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
              autofocus required />
       <button type="submit">Verify</button>
     </form>
     <div class="footer">Lost your device? Use one of the recovery codes you saved, or ask a
       superadmin to reset your enrolment.</div>`,
  );
}

export function opsEnrollPage(options: {
  email: string;
  csrf: string;
  secret: string;
  uri: string;
  error?: string;
}): string {
  const grouped = options.secret.replace(/(.{4})/g, "$1 ").trim();
  return layout(
    "Set up authenticator",
    `<h1>Set up your authenticator</h1>
     <p>Add this account to Google Authenticator, 1Password, Authy or any TOTP app. Then enter the
        six-digit code to finish.</p>
     ${options.error ? `<div class="error">${escapeHtml(options.error)}</div>` : ""}
     <label>Manual key</label>
     <code class="secret">${escapeHtml(grouped)}</code>
     <p style="margin-top:.7rem"><a href="${escapeHtml(options.uri)}">Open in an authenticator app</a></p>
     <form method="post" action="/v1/ops/totp/enroll">
       <input type="hidden" name="csrf" value="${escapeHtml(options.csrf)}" />
       <label for="code">Six-digit code</label>
       <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
              autofocus required />
       <button type="submit">Finish setup</button>
     </form>
     <div class="footer">Account: ${escapeHtml(options.email)}</div>`,
  );
}

export function opsRecoveryPage(options: { codes: string[] }): string {
  return layout(
    "Recovery codes",
    `<h1>Save your recovery codes</h1>
     <p>These are shown once. Each code works a single time if you lose your authenticator.</p>
     <div class="codes">${options.codes
       .map((code) => `<span>${escapeHtml(code)}</span>`)
       .join("")}</div>
     <p style="margin-top:1rem">Store them offline, then continue to sign in.</p>
     <p><a href="/ops/login">Continue to sign in</a></p>`,
  );
}

export function opsNoticePage(options: {
  title: string;
  message: string;
  link?: { href: string; label: string };
}): string {
  return layout(
    options.title,
    `<h1>${escapeHtml(options.title)}</h1>
     <p>${escapeHtml(options.message)}</p>
     ${options.link ? `<p style="margin-top:1rem"><a href="${escapeHtml(options.link.href)}">${escapeHtml(options.link.label)}</a></p>` : ""}`,
  );
}
