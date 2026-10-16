import { CmsOperatorClient } from "../cms-operator-client";

describe("CmsOperatorClient", () => {
  it("keeps the operator secret in the server-to-server authorization header", async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      kind: "banner",
      locale: "en-IN",
      definition: {},
      documents: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
    const client = new CmsOperatorClient("http://cms:1337/", "operator-secret", fetchImpl);

    await client.list("banner", "en-IN", {
      actorId: "user_01",
      correlationId: "request_01",
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("http://cms:1337/api/operator-content/banner?locale=en-IN");
    expect(init.headers).toMatchObject({
      authorization: "Bearer operator-secret",
      "x-cms-operator-id": "user_01",
      "x-correlation-id": "request_01",
    });
  });

  it("sends only the allowlisted mutation envelope to the private CMS", async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      kind: "banner",
      operation: "update-draft",
      document: null,
    }), { status: 200 })) as unknown as typeof fetch;
    const client = new CmsOperatorClient("http://cms:1337", "operator-secret", fetchImpl);

    await client.mutate("banner", {
      operation: "update-draft",
      documentId: "banner-doc",
      locale: "en-IN",
      data: { title: "Reviewed title" },
    }, {
      actorId: "user_01",
      correlationId: "request_02",
    });

    const [, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      operation: "update-draft",
      documentId: "banner-doc",
      locale: "en-IN",
      data: { title: "Reviewed title" },
    });
  });

  it("does not echo an upstream HTML error body", async () => {
    const fetchImpl = jest.fn(async () => new Response("<html>private failure</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
    const client = new CmsOperatorClient("http://cms:1337", "operator-secret", fetchImpl);

    await expect(client.list("banner", "en-IN", {
      actorId: "user_01",
      correlationId: "request_03",
    })).rejects.toThrow("CMS operator service returned HTTP 502.");
  });

  it("surfaces the CMS safe correlation reference without exposing an internal error", async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      error: {
        message: "CMS content operation failed. Retry once; if it fails again, provide reference request_04.",
      },
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
    const client = new CmsOperatorClient("http://cms:1337", "operator-secret", fetchImpl);

    await expect(client.mutate("banner", {
      operation: "update-draft",
      documentId: "banner-doc",
      locale: "en-IN",
      data: { title: "Reviewed title" },
    }, {
      actorId: "user_01",
      correlationId: "request_04",
    })).rejects.toThrow(
      "CMS content operation failed. Retry once; if it fails again, provide reference request_04.",
    );
  });
});
