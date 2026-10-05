// Personal and corporate email accepted; ownership verified by Clerk.
export const EMAIL_MESSAGE = "Informe um e-mail válido para continuar.";
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase();
  if (value.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(value)) return null;
  const [local, domain] = value.split("@");
  if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(part => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return null;
  if (!/^[a-z]{2,63}$/.test(labels.at(-1)!)) return null;
  if (["example.com", "example.org", "example.net", "localhost", "invalid", "test"].some(item => domain === item || domain.endsWith(`.${item}`))) return null;
  return value;
}
