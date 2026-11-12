import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
export default defineConfig({
  plugins: [{name:"migration-entry",transformIndexHtml:{order:"pre",handler(html){return html.replace("/src/main.tsx","/src/main.cloudflare.tsx")}}},react(), tailwindcss({ optimize: false })],
  resolve: { alias: {
    "@clerk/react": path.resolve(import.meta.dirname,"client/src/migration/auth.tsx"),
    "@": path.resolve(import.meta.dirname, "client/src"),
    "@shared": path.resolve(import.meta.dirname, "shared"),
    "@assets": path.resolve(import.meta.dirname, "attached_assets")
  } },
  css: { postcss: { plugins: [] } },
  root: path.resolve(import.meta.dirname, "client"),
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true }
});
