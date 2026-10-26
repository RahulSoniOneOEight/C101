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
};

export default nextConfig;
