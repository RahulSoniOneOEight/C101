import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * UI-review harness for the Product Studio workspace.
 *
 * Renders the real component with mocked API responses so layout, section order and collapse
 * behaviour can be reviewed without building or deploying the dashboard image. Dev-only.
 */
export default defineConfig({
  root: "apps/admin",
  plugins: [react()],
  define: {
    __BACKEND_URL__: JSON.stringify(""),
  },
  server: { port: 7050, strictPort: false },
  build: {
    outDir: "dist-preview",
    rollupOptions: { input: "apps/admin/preview.html" },
  },
});
