const baseUrl = process.env.CMS_BASE_URL ?? "http://127.0.0.1:1337";
const secret = process.env.CMS_OPERATOR_SECRET;

if (!secret) throw new Error("CMS_OPERATOR_SECRET is required for the operator-content smoke test.");

const correlationId = `cms-ci-${Date.now()}`;
const headers = {
  authorization: `Bearer ${secret}`,
  "content-type": "application/json",
  "x-cms-operator-id": "cms-ci-operator",
  "x-correlation-id": correlationId,
};

async function jsonResponse(response, operation) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const listResponse = await fetch(`${baseUrl}/api/operator-content/banner?locale=en-IN`, {
  headers,
});
const list = await jsonResponse(listResponse, "banner list");
const banner = list.documents?.[0];
if (!banner?.documentId) throw new Error("Expected at least one seeded banner draft.");

const data = {};
for (const field of list.definition.fields) {
  // Match the draft editor's parseForm behavior: it submits every editable field and clears an
  // empty optional field with null rather than omitting it from the mutation.
  data[field.name] = banner[field.name] ?? null;
}
if (Object.hasOwn(data, "segments")) data.segments = "";

const updateResponse = await fetch(`${baseUrl}/api/operator-content/banner`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    operation: "update-draft",
    documentId: banner.documentId,
    locale: "en-IN",
    data,
  }),
});
const updated = await jsonResponse(updateResponse, "banner draft update");
if (updated.operation !== "update-draft" || updated.document?.documentId !== banner.documentId) {
  throw new Error("Banner draft update returned an unexpected document.");
}
if (updated.document.segments !== null) {
  throw new Error("Expected an empty optional JSON field to be normalized to null.");
}

const failureCorrelationId = `${correlationId}-failure`;
const failureResponse = await fetch(`${baseUrl}/api/operator-content/banner`, {
  method: "POST",
  headers: { ...headers, "x-correlation-id": failureCorrelationId },
  body: JSON.stringify({
    operation: "update-draft",
    documentId: banner.documentId,
    locale: "en-IN",
    data: { priority: "not-an-integer" },
  }),
});
const failureBody = await failureResponse.json();
if (failureResponse.ok) throw new Error("Expected the invalid integer update to fail.");
const failureMessage = failureBody?.error?.message;
if (typeof failureMessage !== "string" || !failureMessage.includes(failureCorrelationId)) {
  throw new Error(`Expected a safe correlation reference, received: ${JSON.stringify(failureBody)}`);
}

console.log(`operator-content update-draft passed (${correlationId})`);
