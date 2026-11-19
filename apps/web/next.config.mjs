import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle so the hosted image only needs node + .next/standalone.
  output: "standalone",
  // Pin the file-tracing root to this app so an unrelated lockfile in a parent directory is ignored.
  outputFileTracingRoot: projectRoot,
  // This deployment is the staging preview: keep it out of search indexes.
  async headers() {
    return [
      {
        source: "/branding/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=3600" },
        ],
      },
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  // Policy pages read their Markdown at build time. Include the source in the standalone trace
  // so a future non-static render still has the files available.
  outputFileTracingIncludes: {
    "/terms": ["./content/policies/**/*.md"],
    "/refunds": ["./content/policies/**/*.md"],
    "/shipping": ["./content/policies/**/*.md"],
    "/privacy": ["./content/policies/**/*.md"],
    "/contact": ["./content/policies/**/*.md"],
    "/about": ["./content/policies/**/*.md"],
    "/policies": ["./content/policies/**/*.md"],
  },
};

export default nextConfig;
