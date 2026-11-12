import { previewCompanies, previewReportPath, type PreviewRun } from "./invest-research-preview";
import { investorProfiles } from "./invest-report-votes";

export const localInvestPreview = ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);
export const reportThemeKey = "tm-invest-report-theme";
export const demoProfileKey = "tm-invest-demo-profile";
const archiveKey = "tm-invest-preview-reports-v1";

export function readPreference(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

export function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch { /* Browser storage is optional in the preview. */ }
}

export function readReportTheme(): "light" | "dark" {
  const saved = readPreference(reportThemeKey);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function readDemoProfile() {
  if (!localInvestPreview) return undefined;
  const saved = readPreference(demoProfileKey);
  return investorProfiles.find(profile => profile === saved);
}

export function readPreviewArchive(): PreviewRun[] {
  if (!localInvestPreview) return [];
  try {
    const saved: Partial<PreviewRun>[] = JSON.parse(readPreference(archiveKey) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return previewCompanies.flatMap(company => {
      const record = saved.find(row => row?.company?.ticker === company.ticker && row.phase === "ready");
      if (!record || typeof record.id !== "string") return [];
      return [{ id: record.id, company, phase: "ready" as const, completedInPhase: 0 }];
    });
  } catch { return []; }
}

export function savePreviewArchive(archive: PreviewRun[]) {
  if (localInvestPreview) writePreference(archiveKey, JSON.stringify(archive));
}

export function archivedReportHref(ticker: string) {
  return `${previewReportPath}?empresa=${encodeURIComponent(ticker)}`;
}
