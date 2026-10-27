import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'node:module'

// createRequire (not a static import): the plugin's ESM build can't dynamic-require
// medusa-config.ts, so it silently falls back to base "/" and 404s panel assets.
const require = createRequire(import.meta.url)
const { mercurDashboardPlugin } = require('@mercurjs/dashboard-sdk/vite')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Baked into the panel at build time. For a backend-served production build
  // (e.g. Medusa Cloud) set it to the deployed backend origin so API calls are
  // same-origin; it defaults to http://localhost:9000 for development.
  const backendUrl = env.VITE_MERCUR_BACKEND_URL || env.MERCUR_BACKEND_URL


  // Optional: run the dashboard with HMR against a deployed staging environment.
  //   BUILDKART_PROXY_TARGET=https://ops-staging.pinakaplay.cloud \
  //   MERCUR_BACKEND_URL=http://localhost:7001 bunx vite
  // Same-origin calls keep the staging session cookie valid while API paths are proxied.
  const proxyTarget = env.BUILDKART_PROXY_TARGET?.trim();
  const stagingProxy = proxyTarget
    ? {
        server: {
          port: 7001,
          proxy: Object.fromEntries(
            ["/vendor","/admin","/auth","/store","/static","/uploads","/health"].map((path) => [
              path,
              { target: proxyTarget, changeOrigin: true, secure: true },
            ]),
          ),
        },
      }
    : {};

  return {
    ...stagingProxy,
    plugins: [
      react(),
      mercurDashboardPlugin({
        medusaConfigPath: '../../packages/api/medusa-config.ts',
        ...(backendUrl ? { backendUrl } : {}),
      }),
    ],
  }
})
