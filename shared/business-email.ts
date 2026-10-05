// Domain ownership / employment is not proved by this filter. Verification is
// supplied by Clerk; known personal and temporary providers are rejected here.
export const PERSONAL_EMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "hotmail.co.uk",
  "outlook.com", "outlook.com.br", "live.com", "live.com.br", "msn.com",
  "yahoo.com", "yahoo.com.br", "yahoo.co.uk", "yahoo.fr", "yahoo.es", "yahoo.de",
  "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com", "proton.me", "protonmail.com", "pm.me", "tuta.com",
  "tutanota.com", "tutanota.de", "mail.com", "email.com", "gmx.com", "gmx.de",
  "gmx.net", "fastmail.com", "fastmail.fm", "hey.com", "zoho.com", "zohomail.com",
  "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "naver.com",
  "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br", "globo.com",
  "globomail.com", "r7.com", "zipmail.com.br", "ibest.com.br", "superig.com.br",
  "oi.com.br", "brturbo.com.br", "click21.com.br", "itelefonica.com.br",
] as const;

export const TEMPORARY_EMAIL_DOMAINS = [
  "mailinator.com", "yopmail.com", "yopmail.fr", "yopmail.net", "guerrillamail.com",
  "guerrillamail.net", "guerrillamail.org", "guerrillamail.de", "sharklasers.com",
  "grr.la", "maildrop.cc", "10minutemail.com", "10minutemail.net", "tempmail.com",
  "temp-mail.org", "temp-mail.io", "dispostable.com", "getnada.com", "throwawaymail.com",
  "trashmail.com", "trashmail.net", "trashmail.de", "fakeinbox.com", "emailondeck.com",
] as const;

export const BUSINESS_EMAIL_MESSAGE = "Use seu e-mail empresarial, com domínio próprio. E-mails pessoais ou temporários não são aceitos.";

export function normalizeBusinessEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(value)) return null;
  const [local, domain] = value.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return null;
  if (!/^[a-z]{2,63}$/.test(labels.at(-1)!)) return null;
  const blocked: readonly string[] = [...PERSONAL_EMAIL_DOMAINS, ...TEMPORARY_EMAIL_DOMAINS];
  if (blocked.some(item => domain === item || domain.endsWith(`.${item}`))) return null;
  if (["example.com", "example.org", "example.net", "localhost", "invalid", "test"].some(item => domain === item || domain.endsWith(`.${item}`))) return null;
  return value;
}
