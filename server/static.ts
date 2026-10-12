import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { applyBrandMetadata } from "../shared/brand-metadata";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath, { index: false }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    const html = fs.readFileSync(path.resolve(distPath, "index.html"), "utf8");
    const host = req.hostname.toLowerCase().replace(/\.$/, "");
    const origin = /^(?:invest|finance)\.techmoney\.com\.br$/.test(host) ? `https://${host}` : undefined;
    res.type("html").send(applyBrandMetadata(html, host, req.originalUrl, origin));
  });
}
