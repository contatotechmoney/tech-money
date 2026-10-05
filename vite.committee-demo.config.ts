import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Separate local entry: no Express, database, Clerk configuration or provider keys.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "client"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "client/src") } },
  server: { host: "127.0.0.1", port: 19622, strictPort: true, open: false, fs: { strict: true, deny: ["**/.*"] } },
  build: { outDir: path.resolve(import.meta.dirname, "dist/committee-demo"), emptyOutDir: true, rollupOptions: { input: path.resolve(import.meta.dirname, "client/committee-demo.html") } },
});
