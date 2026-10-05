import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Separate local entries; the optional loopback proxy reaches only the offline fixture.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "client"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "client/src") } },
  server: { host: "127.0.0.1", port: 19622, strictPort: true, open: false, proxy: {"/local-committee": {target:"http://127.0.0.1:19623",rewrite:p=>p.replace(/^\/local-committee/,"")}}, fs: { strict: true, deny: ["**/.*"] } },
  build: { outDir: path.resolve(import.meta.dirname, "dist/committee-demo"), emptyOutDir: true, rollupOptions: { input: [path.resolve(import.meta.dirname, "client/committee-demo.html"),path.resolve(import.meta.dirname, "client/committee-executor-demo.html")] } },
});
