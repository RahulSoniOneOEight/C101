import assert from "node:assert/strict";

export interface PilotSession {
  token: string;
  user: { id: string; email: string; name: string };
}

/** Authenticate a synthetic local pilot user. Hosted tests supply the identifier/code via env. */
export async function createPilotSession(baseUrl: string): Promise<PilotSession> {
  const identifier = process.env.PILOT_TEST_IDENTIFIER ?? "pilot1@buildkart.test";
  const code = process.env.PILOT_OTP_CODE ?? "123456";
  const challengeResponse = await fetch(`${baseUrl}/v1/auth/otp/challenges`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier }),
  });
  const challengeText = await challengeResponse.text();
  assert.equal(challengeResponse.status, 201, `pilot challenge failed: ${challengeText}`);
  const challenge = JSON.parse(challengeText) as { challenge_id: string };

  const verifyResponse = await fetch(`${baseUrl}/v1/auth/otp/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.challenge_id, code }),
  });
  const verifyText = await verifyResponse.text();
  assert.equal(verifyResponse.status, 200, `pilot verification failed: ${verifyText}`);
  const verified = JSON.parse(verifyText) as {
    session_token: string;
    user: { id: string; email: string; name: string };
  };
  assert.ok(verified.session_token);
  return { token: verified.session_token, user: verified.user };
}
