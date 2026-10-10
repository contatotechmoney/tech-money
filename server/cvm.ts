import AdmZip from "adm-zip";
import { createHash } from "crypto";

const CVM_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA/DOC";

export const TICKER_TO_CNPJ: Record<string, string> = {
  BBAS3: "00.000.000/0001-91",
  BBDC3: "60.746.948/0001-12",
  BBDC4: "60.746.948/0001-12",
  ITUB4: "60.872.504/0001-23",
  ITSA4: "61.532.644/0001-15",
  BRSR6: "92.702.067/0001-96",
  BBSE3: "17.344.597/0001-94",
  PETR4: "33.000.167/0001-01",
  PETR3: "33.000.167/0001-01",
  CSAN3: "50.746.577/0001-15",
  LEVE3: "60.476.884/0001-87",
  VALE3: "33.592.510/0001-54",
  TAEE11: "07.859.971/0001-30",
  VIVT3: "02.558.157/0001-62",
  SAPR11: "76.484.013/0001-45",
};

export const SUPPORTED_TICKERS = Object.keys(TICKER_TO_CNPJ);

export interface CvmFundamentals {
  ticker: string;
  cnpj: string;
  companyName: string;
  demonstrativo: "ITR" | "DFP";
  ano: number;
  periodoReferencia: string;
  dataRecebimento: string;
  receitaLiquida: number;
  ebit: number;
  ebt: number;
  lucroLiquido: number;
  ativoTotal: number;
  patrimonioLiquido: number;
  fonte: string;
}

const zipCache = new Map<string, Buffer>();

function cacheKey(tipo: string, ano: number) {
  return `${tipo}-${ano}`;
}

async function baixarZip(tipo: "ITR" | "DFP", ano: number): Promise<Buffer> {
  const key = cacheKey(tipo, ano);
  if (zipCache.has(key)) return zipCache.get(key)!;

  const t = tipo.toLowerCase();
  const url = `${CVM_BASE}/${tipo}/DADOS/${t}_cia_aberta_${ano}.zip`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`CVM_UNAVAILABLE (HTTP ${res.status})`);

  const buf = Buffer.from(await res.arrayBuffer());
  zipCache.set(key, buf);
  return buf;
}

interface CsvRow {
  [key: string]: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const header = lines[0].split(";").map((h) => h.replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    const row: CsvRow = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ? cols[i].replace(/^"|"$/g, "") : "";
    });
    return row;
  });
}

function readCsvFromZip(zipBuf: Buffer, name: string): CsvRow[] {
  const zip = new AdmZip(zipBuf);
  const entry = zip.getEntry(name);
  if (!entry) return [];
  return parseCsv(entry.getData().toString("latin1"));
}

function contaPorRotulo(rows: CsvRow[], palavras: string[], excluir: string[] = []): number {
  const sub = rows.filter((r) => /^3\.\d\d$/.test(r.CD_CONTA || ""));
  for (const r of sub) {
    const ds = (r.DS_CONTA || "").toUpperCase();
    const ok = palavras.every((p) => ds.includes(p.toUpperCase()));
    const notExcl = excluir.every((e) => !ds.includes(e.toUpperCase()));
    if (ok && notExcl) return parseFloat(r.VL_CONTA || "0");
  }
  return 0;
}

function soma(rows: CsvRow[], contas: string[]): number {
  const filtrados = rows.filter((r) => {
    const c = r.CD_CONTA || "";
    return contas.some((cc) => (cc.length <= 4 ? c === cc : c === cc || c.startsWith(cc + ".")));
  });
  return filtrados.reduce((acc, r) => acc + parseFloat(r.VL_CONTA || "0"), 0);
}

export async function extrairFundamentos(
  ticker: string,
  ano: number,
  tipo: "ITR" | "DFP" = "ITR",
): Promise<CvmFundamentals> {
  const cnpj = TICKER_TO_CNPJ[ticker.toUpperCase()];
  if (!cnpj) throw new Error("TICKER_UNSUPPORTED");

  const zipBuf = await baixarZip(tipo, ano);
  const t = tipo.toLowerCase();

  const info = readCsvFromZip(zipBuf, `${t}_cia_aberta_${ano}.csv`)
    .filter((r) => r.CNPJ_CIA === cnpj);
  if (info.length === 0) throw new Error("CNPJ_NOT_FOUND");

  info.sort((a, b) => (b.DT_REFER || "").localeCompare(a.DT_REFER || ""));
  const refer = info[0].DT_REFER;
  const dtIni = `${ano}-01-01`;
  const denom = info[0].DENOM_CIA || ticker;
  const dtReceb = info[0].DT_RECEB || "";

  const carregar = (base: string): CsvRow[] => {
    let rows = readCsvFromZip(zipBuf, `${base}_con_${ano}.csv`).filter((r) => r.CNPJ_CIA === cnpj);
    if (rows.length === 0) {
      rows = readCsvFromZip(zipBuf, `${base}_ind_${ano}.csv`).filter((r) => r.CNPJ_CIA === cnpj);
    }
    return rows;
  };

  const dre = carregar(`${t}_cia_aberta_DRE`)
    .filter((r) => r.DT_REFER === refer && r.DT_INI_EXERC === dtIni);
  const bpa = carregar(`${t}_cia_aberta_BPA`).filter((r) => r.DT_REFER === refer);
  const bpp = carregar(`${t}_cia_aberta_BPP`).filter((r) => r.DT_REFER === refer);

  const escala = (dre[0]?.ESCALA_MOEDA || "MIL").toUpperCase() === "MIL" ? 1000 : 1;

  const receita = contaPorRotulo(dre, ["RECEITA"]) * escala;
  const ebit =
    (contaPorRotulo(dre, ["ANTES", "RESULTADO FINANCEIRO"]) ||
      contaPorRotulo(dre, ["ANTES DOS TRIBUTOS"])) * escala;
  const ebt = contaPorRotulo(dre, ["ANTES DOS TRIBUTOS"]) * escala;
  let lucro = contaPorRotulo(dre, ["LUCRO", "PERÍODO"]) * escala;
  if (lucro === 0) lucro = contaPorRotulo(dre, ["PREJUÍZO", "PERÍODO"]) * escala;
  if (lucro === 0) lucro = contaPorRotulo(dre, ["LUCRO", "EXERCÍCIO"]) * escala;

  const ativo = soma(bpa, ["1"]) * 1000;
  const pl = soma(bpp, ["2.03"]) * 1000;

  return {
    ticker: ticker.toUpperCase(),
    cnpj,
    companyName: denom,
    demonstrativo: tipo,
    ano,
    periodoReferencia: refer,
    dataRecebimento: dtReceb,
    receitaLiquida: receita,
    ebit,
    ebt,
    lucroLiquido: lucro,
    ativoTotal: ativo,
    patrimonioLiquido: pl,
    fonte: `CVM ${tipo} ${ano} (dados.cvm.gov.br)`,
  };
}

export function hashFundamentos(f: CvmFundamentals): string {
  const payload = `${f.ticker}|${f.periodoReferencia}|${f.lucroLiquido}|${f.receitaLiquida}|${f.ativoTotal}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}