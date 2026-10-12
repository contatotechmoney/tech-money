// Deterministic artwork from existing portraits; no image/AI provider calls.
import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import path from "node:path";

const publicDir = "client/public";
const archive = "docs/history/brand-before-three-bars";
await mkdir(archive, { recursive: true });
for (const file of ["logo.svg", "favicon.png", "opengraph.jpg", "comites/tech_money_logo.png", "comites/comite_rv.jpg", "comites/comite_rf.jpg"]) {
  const destination = path.join(archive, file.replaceAll("/", "-"));
  try { await access(destination); } catch { await copyFile(path.join(publicDir, file), destination); }
}
function svg(area, width = 280) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width * 80 / 280}" viewBox="0 0 280 80" role="img" aria-labelledby="title"><title id="title">Tech Money ${area}</title><rect width="280" height="80" rx="8" fill="#fff"/><g fill="#087d61"><rect x="16" y="38" width="12" height="22" rx="3"/><rect x="33" y="29" width="12" height="31" rx="3"/><rect x="50" y="24" width="12" height="36" rx="3"/></g><g font-family="Arial,sans-serif"><text x="80" y="40" font-size="21" font-weight="700" letter-spacing="2" fill="#172b29">TECH MONEY</text><text x="80" y="59" font-size="10" font-weight="700" letter-spacing="1.5" fill="#087d61">${area}</text></g></svg>`;
}
for (const [name, area] of [["logo.svg", "ACESSO"], ["logo-investments.svg", "INVESTIMENTOS"], ["logo-finance.svg", "FINANCE"]]) {
  await writeFile(`${publicDir}/${name}`, svg(area));
}
const browser = await chromium.launch({ executablePath: process.env.SYNTHETIC_CHROMIUM || "/repl/tools/bin/chromium", args: ["--no-sandbox", "--disable-background-networking"] });
try {
  const page = await browser.newPage();
  await page.route("**/*", route => route.abort());
  async function render(html, filename, width, height, type = "png") {
    await page.setViewportSize({ width, height });
    await page.setContent(`<html><body style="margin:0">${html}</body></html>`);
    await page.locator("img").evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.screenshot({ path: filename, type, ...(type === "jpeg" ? { quality: 92 } : {}) });
  }
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#fff"/><g fill="#087d61"><rect x="10" y="32" width="11" height="22" rx="3"/><rect x="27" y="23" width="11" height="31" rx="3"/><rect x="44" y="16" width="11" height="38" rx="3"/></g></svg>`;
  await render(mark, `${publicDir}/favicon.png`, 64, 64);
  await render(svg("INVESTIMENTOS"), `${publicDir}/comites/tech_money_logo.png`, 280, 80);
  for (const [file, area] of [["opengraph.jpg", "ACESSO"], ["opengraph-investments.jpg", "INVESTIMENTOS"], ["opengraph-finance.jpg", "FINANCE"]]) {
    await render(`<main style="height:630px;box-sizing:border-box;background:#f4f7f6;display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:Arial;color:#172b29"><div style="width:840px">${svg(area, 840)}</div><p style="font-size:28px">Ambiente de simulação · Tech Money</p></main>`, `${publicDir}/${file}`, 1200, 630, "jpeg");
  }
  for (const [folder, names, file, title] of [
    ["personas_fotos", ["andre","carlos","helena","fernanda","juliana","marcos","marina","otavio","rafael","rodrigo"], "comite_rv.jpg", "Renda Variável"],
    ["personas_fotos_rf", ["beatriz","camila","eduardo","henrique","patricia","ricardo"], "comite_rf.jpg", "Renda Fixa"],
  ]) {
    const portraits = await Promise.all(names.map(async name => {
      const data = await readFile(`${publicDir}/comites/${folder}/${name}.png`);
      return `<figure style="margin:0;text-align:center"><img src="data:image/png;base64,${data.toString("base64")}" style="width:150px;height:190px;object-fit:cover;object-position:top;border-radius:8px"><figcaption style="margin-top:6px;text-transform:capitalize">${name}</figcaption></figure>`;
    }));
    await render(`<main style="height:720px;padding:30px;box-sizing:border-box;background:#f4f7f6;font-family:Arial;color:#172b29"><header style="display:flex;align-items:center;justify-content:space-between">${svg("INVESTIMENTOS")}<h1>${title}</h1></header><p>Agentes de IA · Personas simuladas, não profissionais reais</p><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:20px">${portraits.join("")}</div></main>`, `${publicDir}/comites/${file}`, 1000, 720, "jpeg");
  }
} finally { await browser.close(); }
