export default {
  routes: [
    {
      method: "GET",
      path: "/buildkart/health",
      handler: "operations.health",
      config: { auth: false, policies: ["global::internal-service"] },
    },
    {
      method: "GET",
      path: "/buildkart/content/:type",
      handler: "operations.list",
      config: { auth: false, policies: ["global::internal-service"] },
    },
    {
      method: "POST",
      path: "/buildkart/content/:type",
      handler: "operations.create",
      config: { auth: false, policies: ["global::internal-service"] },
    },
    {
      method: "POST",
      path: "/buildkart/content/:type/:documentId",
      handler: "operations.update",
      config: { auth: false, policies: ["global::internal-service"] },
    },
    {
      method: "POST",
      path: "/buildkart/content/:type/:documentId/publish",
      handler: "operations.publish",
      config: { auth: false, policies: ["global::internal-service"] },
    },
    {
      method: "POST",
      path: "/buildkart/content/:type/:documentId/unpublish",
      handler: "operations.unpublish",
      config: { auth: false, policies: ["global::internal-service"] },
    },
    {
      method: "GET",
      path: "/buildkart/audit",
      handler: "operations.audit",
      config: { auth: false, policies: ["global::internal-service"] },
    }
  ],
};
