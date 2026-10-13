import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: { alias: {
    "@": path.resolve(import.meta.dirname, "client/src"),
    "@shared": path.resolve(import.meta.dirname, "shared"),
    "@assets": path.resolve(import.meta.dirname, "attached_assets")
  } },
  css: { postcss: { plugins: [] } },
  root: path.resolve(import.meta.dirname, "client"),
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true }
});
