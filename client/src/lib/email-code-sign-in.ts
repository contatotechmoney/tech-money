/** Narrow Clerk resource contract; tests supply synthetic resources, never provider clients. */
export interface EmailCodeAttempt {
  status: string | null;
  createdSessionId: string | null;
  protectCheck?: unknown;
  supportedFirstFactors?: readonly { strategy: string; emailAddressId?: string }[] | null;
  prepareFirstFactor(params: { strategy: "email_code"; emailAddressId: string }): Promise<EmailCodeAttempt>;
  attemptFirstFactor(params: { strategy: "email_code"; code: string }): Promise<EmailCodeAttempt>;
}

export type EmailCodeStep =
  | { kind: "code" }
  | { kind: "native" }
  | { kind: "complete"; sessionId: string };

function completion(attempt: EmailCodeAttempt): EmailCodeStep {
  // MFA, client trust, CAPTCHA/Protect checks and unknown statuses stay with Clerk's native UI.
  if (!attempt.protectCheck && attempt.status === "complete" && attempt.createdSessionId) {
    return { kind: "complete", sessionId: attempt.createdSessionId };
  }
  return { kind: "native" };
}

export async function beginEmailCode(
  signIn: { create(params: { identifier: string }): Promise<EmailCodeAttempt> },
  email: string,
): Promise<EmailCodeStep> {
  const attempt = await signIn.create({ identifier: email });
  if (attempt.protectCheck || attempt.status !== "needs_first_factor") return completion(attempt);
  const factor = attempt.supportedFirstFactors?.find(item => item.strategy === "email_code" && item.emailAddressId);
  if (!factor?.emailAddressId) return { kind: "native" };
  const prepared = await attempt.prepareFirstFactor({ strategy: "email_code", emailAddressId: factor.emailAddressId });
  return !prepared.protectCheck && prepared.status === "needs_first_factor"
    ? { kind: "code" } : completion(prepared);
}

export async function verifyEmailCode(attempt: EmailCodeAttempt, code: string): Promise<EmailCodeStep> {
  return completion(await attempt.attemptFirstFactor({ strategy: "email_code", code }));
}
