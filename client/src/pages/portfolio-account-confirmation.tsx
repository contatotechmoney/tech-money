import { useAuth } from "@clerk/react";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CircleAlert, CircleHelp, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { TechMoneyBrand } from "@/components/tech-money-brand";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import type { PortfolioAccountConfirmation } from "../../../shared/portfolio-pilot-confirmation";
import {
  confirmationResponseSchema,
  ownerBindingAppliedSchema,
  ownerBindingStateSchema,
} from "../../../shared/portfolio-pilot-confirmation";

const PAGE_PATH = "/investments/portfolio/pilot/confirm-account";
const SIGN_IN_REQUIRED_MESSAGE = "Sua sessão não está ativa. Entre novamente e faça uma nova checagem.";
const bindingFailureMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const code = message.toUpperCase();
  if (/REVOKED/.test(code)) return "O vínculo foi revogado e não pode ser confirmado nesta checagem.";
  if (/ALREADY_BOUND|OWNER_BOUND/.test(code)) return "Esta conta já possui um vínculo exclusivo.";
  if (/PRODUCTION|ENVIRONMENT/.test(code)) return "O vínculo só pode ser confirmado no ambiente de produção.";
  if (/IDENTITY|SESSION|EMAIL|OWNER_MATCH/.test(code)) return "A confirmação oficial não está válida. Faça uma nova checagem da conta.";
  if (/CONSENT|CONFIRM/.test(code)) return "A confirmação explícita não foi aceita. Revise a opção e tente novamente.";
  if (/AUDIT/.test(code)) return "Não foi possível registrar a confirmação com segurança. Nenhum vínculo foi aplicado.";
  if (/401/.test(message)) return SIGN_IN_REQUIRED_MESSAGE;
  return "Não foi possível consultar ou confirmar o vínculo agora. Faça uma nova checagem quando estiver pronto.";
};

type OwnerBindingState = ReturnType<typeof ownerBindingStateSchema.parse>;
type OwnerBindingApplied = ReturnType<typeof ownerBindingAppliedSchema.parse>;

type AccountConfirmationViewProps = {
  result: PortfolioAccountConfirmation | null;
  pending: boolean;
  error: string;
  signedIn: boolean;
  loadingAuth?: boolean;
  onCheck: () => void;
  binding?: OwnerBindingState | null;
  bindingPending?: boolean;
  bindingError?: string;
  bindingApplied?: OwnerBindingApplied | null;
  consent?: boolean;
  onConsentChange?: (consent: boolean) => void;
  onBind?: () => void;
  bindingRequestPending?: boolean;
};

const confirmationLabels: Record<PortfolioAccountConfirmation["officialSession"], string> = {
  verified: "Sessão oficial confirmada",
  inactive: "Sessão oficial inativa",
  unavailable: "Não foi possível confirmar a sessão",
  production_required: "Confirmação exige o ambiente de produção",
};

const emailLabels: Record<PortfolioAccountConfirmation["primaryEmail"], string> = {
  verified: "E-mail principal confirmado",
  unverified: "E-mail principal ainda não confirmado",
  unavailable: "Não foi possível confirmar o e-mail",
  production_required: "Confirmação exige o ambiente de produção",
};

const ownerLabels: Record<PortfolioAccountConfirmation["ownerMatch"], string> = {
  matches: "Conta correspondente à referência",
  different: "Conta diferente da referência",
  reference_unavailable: "Referência do titular indisponível",
  unavailable: "Não foi possível comparar a conta",
  production_required: "Confirmação exige o ambiente de produção",
};

function StatusLine({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="confirm-row">
      <span className={`confirm-status-icon ${positive ? "is-positive" : ""}`} aria-hidden="true">
        {positive ? <Check className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="confirm-row-label">{label}</span>
        <span className="confirm-row-value">{value}</span>
      </span>
    </div>
  );
}

export function AccountConfirmationView({
  result,
  pending,
  error,
  signedIn,
  loadingAuth = false,
  onCheck,
  binding = null,
  bindingPending = false,
  bindingError = "",
  bindingApplied = null,
  consent = false,
  onConsentChange,
  onBind,
  bindingRequestPending = false,
}: AccountConfirmationViewProps) {
  const needsSignIn = !loadingAuth && !signedIn;
  const signInRequired = needsSignIn || error === SIGN_IN_REQUIRED_MESSAGE;
  const isOfficiallyConfirmed = Boolean(
    result?.environment === "production" &&
    result.officialSession === "verified" &&
    result.primaryEmail === "verified" &&
    result.ownerMatch === "matches",
  );
  const canBind = isOfficiallyConfirmed && Boolean(binding?.environment === "production") &&
    Boolean(binding && !binding.ownerBound && !binding.revoked) && !bindingPending &&
    !bindingRequestPending && consent && !bindingApplied;
  return (
    <main className="account-confirmation min-h-[100dvh] px-4 py-6 sm:px-7 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/investments/portfolio/pilot" className="confirm-back">
          <ArrowLeft className="h-4 w-4" /> Voltar à preparação
        </Link>

        <header className="confirm-hero">
          <div className="confirm-orbit confirm-orbit-one" aria-hidden="true" />
          <div className="confirm-orbit confirm-orbit-two" aria-hidden="true" />
          <div className="relative">
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <TechMoneyBrand areaLabel="INVESTIMENTOS" />
              <span className="confirm-kicker">CONTA · VERIFICAÇÃO</span>
            </div>
            <h1>Confirme sua conta.</h1>
            <p className="confirm-hero-copy">
              Uma checagem simples, iniciada por você, para entender se a sessão atual corresponde à conta oficial.
            </p>
            <div className="confirm-scope">
              <LockKeyhole className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p><strong>É apenas uma verificação.</strong> Ela não vincula a conta, não libera acesso e não executa operações.</p>
            </div>
          </div>
          <div className="confirm-index" aria-hidden="true">01<br /><span>CONTA</span></div>
        </header>

        <section className="confirm-content" aria-labelledby="confirm-section-heading">
          <div className="confirm-main">
            <div className="confirm-section-heading">
              <div>
                <p className="confirm-eyebrow">CHECAGEM PRIVADA</p>
                <h2 id="confirm-section-heading">O estado da sua conta</h2>
              </div>
              <ShieldCheck className="confirm-shield h-6 w-6" aria-hidden="true" />
            </div>

            {!result && !pending && !error && (
              <div className="confirm-intro">
                <div className="confirm-empty-mark" aria-hidden="true"><ShieldCheck className="h-6 w-6" /></div>
                <p className="confirm-empty-title">Ainda não foi feita nenhuma checagem.</p>
                <p className="confirm-muted">Quando estiver pronto, escolha o botão abaixo. Nenhuma consulta acontece ao abrir esta página.</p>
              </div>
            )}

            {pending && (
              <div className="confirm-loading" role="status" aria-live="polite">
                <div className="confirm-skeleton w-40" />
                <div className="confirm-skeleton w-full" />
                <div className="confirm-skeleton w-4/5" />
                <span className="sr-only">Verificando sua conta…</span>
              </div>
            )}

            {error && (
              <div className="confirm-error" role="alert">
                <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div><p className="font-semibold">Não foi possível concluir a checagem.</p><p className="mt-1">{error}</p></div>
              </div>
            )}

            {result && (
              <div className="confirm-result" aria-live="polite">
                {result.environment === "development" && (
                  <div className="confirm-environment">
                    <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>Ambiente de desenvolvimento: não é possível confirmar aqui a conta do ambiente de produção.</p>
                  </div>
                )}
                <div className="confirm-result-list">
                  <StatusLine label="Sessão" value={confirmationLabels[result.officialSession]} positive={result.officialSession === "verified"} />
                  <StatusLine label="E-mail principal" value={emailLabels[result.primaryEmail]} positive={result.primaryEmail === "verified"} />
                  <StatusLine label="Correspondência da conta" value={ownerLabels[result.ownerMatch]} positive={result.ownerMatch === "matches"} />
                </div>
                <p className="confirm-checked-at">
                  Verificado em {Number.isNaN(Date.parse(result.checkedAt))
                    ? "horário indisponível"
                    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.checkedAt))}
                </p>
                <div className="confirm-not-granted">
                  <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <p><strong>Acesso de execução não concedido.</strong> A inferência real continua bloqueada; qualquer execução futura exigirá uma aprovação específica de orçamento, separada.</p>
                </div>
              </div>
            )}

            {isOfficiallyConfirmed && (
              <section className="confirm-binding" aria-labelledby="confirm-binding-heading">
                <div className="confirm-binding-heading">
                  <div>
                    <p className="confirm-eyebrow">ETAPA OPCIONAL</p>
                    <h3 id="confirm-binding-heading">Vínculo privado da conta</h3>
                  </div>
                  <LockKeyhole className="h-5 w-5 shrink-0" aria-hidden="true" />
                </div>
                <p className="confirm-binding-copy">
                  Este passo confirma somente o vínculo exclusivo desta conta. Não aprova orçamento, análise ou execução.
                  O servidor fará uma nova validação oficial antes de aplicar qualquer alteração.
                </p>

                {bindingPending && (
                  <div className="confirm-loading confirm-binding-loading" role="status" aria-live="polite">
                    <div className="confirm-skeleton w-40" />
                    <div className="confirm-skeleton w-4/5" />
                    <span className="sr-only">Consultando o estado do vínculo…</span>
                  </div>
                )}
                {!bindingPending && binding && (
                  <div className="confirm-result-list" aria-live="polite">
                    {binding.revoked ? (
                      <div className="confirm-binding-status is-warning" role="status">
                        <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <p><strong>Vínculo revogado.</strong> Nenhuma nova confirmação pode ser feita agora.</p>
                      </div>
                    ) : binding.ownerBound ? (
                      <div className="confirm-binding-status" role="status">
                        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <p><strong>Vínculo exclusivo já confirmado.</strong> Isso não libera análise nem execução.</p>
                      </div>
                    ) : binding.environment === "production" ? (
                      <div className="confirm-binding-status" role="status">
                        <LockKeyhole className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>Sem vínculo exclusivo confirmado. A confirmação ainda não foi aplicada.</p>
                      </div>
                    ) : null}
                  </div>
                )}
                {bindingError && (
                  <div className="confirm-error" role="alert">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div><p className="font-semibold">Estado do vínculo indisponível.</p><p className="mt-1">{bindingError}</p></div>
                  </div>
                )}
                {bindingApplied && (
                  <div className="confirm-binding-status" role="status" aria-live="polite">
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <p><strong>Vínculo exclusivo confirmado.</strong> A inferência permanece bloqueada e execução exige aprovação específica de orçamento.</p>
                  </div>
                )}
                {!bindingApplied && binding && !binding.ownerBound && !binding.revoked && (
                  <>
                    <label className="confirm-consent">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => onConsentChange?.(event.currentTarget.checked)}
                        disabled={!binding || bindingPending || bindingRequestPending || Boolean(bindingError)}
                        aria-describedby="confirm-consent-note"
                      />
                      <span>Confirmo somente o vínculo exclusivo desta conta. Esta confirmação não autoriza orçamento, análise ou execução.</span>
                    </label>
                    <p id="confirm-consent-note" className="confirm-button-note">
                      A opção começa desmarcada e só vale para este vínculo.
                    </p>
                    <Button
                      type="button"
                      onClick={onBind}
                      disabled={!canBind || !signedIn || loadingAuth}
                      className="confirm-action"
                    >
                      {bindingRequestPending ? "Confirmando vínculo…" : "Confirmar vínculo exclusivo"}
                    </Button>
                  </>
                )}
              </section>
            )}

            {signInRequired ? (
              <Link
                href={`/sign-in?redirect=${encodeURIComponent(PAGE_PATH)}`}
                className="confirm-action inline-flex w-full items-center justify-center"
              >
                Entrar para confirmar a conta
              </Link>
            ) : (
              <Button
                type="button"
                onClick={onCheck}
                disabled={loadingAuth || !signedIn || pending || bindingRequestPending}
                className="confirm-action"
              >
                {pending ? "Verificando conta…" : result || error ? "Conferir novamente" : "Conferir minha conta"}
              </Button>
            )}
            <p className="confirm-button-note">A consulta é somente leitura e só começa quando você seleciona este botão.</p>
          </div>

          <aside className="confirm-aside">
            <p className="confirm-eyebrow">O QUE ESTA CHECAGEM FAZ</p>
            <h2>Clareza, sem surpresa.</h2>
            <div className="confirm-aside-rule" />
            <p>O servidor confere a sessão e a referência oficial da conta. A resposta não exibe identificadores, e-mail, sessão ou credenciais.</p>
            <div className="confirm-aside-foot">
              <span className="confirm-aside-number">01</span>
              <span>Sem alteração<br />na sua conta</span>
            </div>
          </aside>
        </section>

        <footer className="confirm-footer">
          <span>TECH MONEY · ÁREA PRIVADA</span>
          <span>Informação de conta, não uma autorização de investimento.</span>
        </footer>
      </div>
      <style>{`
        .account-confirmation{color-scheme:light;--confirm-page:#edf3ef;--confirm-ink:#203b32;--confirm-surface:#fbfcf8;--confirm-subtle:#f1f6f2;--confirm-line:#e0e9e2;--confirm-border:#cbd9d0;--confirm-muted:#587066;--confirm-muted-2:#84978d;--confirm-green:#28684f;--confirm-green-soft:#e2eee7;--confirm-warning:#765b25;--confirm-warning-bg:#fff7e7;--confirm-warning-line:#e3cda2;background:var(--confirm-page);color:var(--confirm-ink)}
        .account-confirmation .confirm-back{display:inline-flex;align-items:center;gap:.5rem;margin:0 0 1.5rem;color:var(--confirm-green);font-size:.875rem;font-weight:700;text-decoration:none;transition:opacity .18s ease}
        .account-confirmation .confirm-back:hover{opacity:.7}
        .account-confirmation .confirm-hero{position:relative;overflow:hidden;border:1px solid var(--confirm-border);border-radius:1.65rem;background:var(--confirm-surface);padding:1.6rem;box-shadow:0 18px 48px rgba(38,73,57,.07)}
        .account-confirmation .confirm-hero h1{max-width:36rem;font-size:clamp(2.2rem,6vw,4.5rem);font-weight:650;letter-spacing:-.055em;line-height:1.02}
        .account-confirmation .confirm-hero-copy{max-width:35rem;margin-top:1.1rem;color:var(--confirm-muted);font-size:.95rem;line-height:1.8}
        .account-confirmation .confirm-kicker,.account-confirmation .confirm-eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.65rem;font-weight:800;letter-spacing:.15em;color:var(--confirm-muted-2)}
        .account-confirmation .confirm-scope{display:flex;align-items:flex-start;gap:.75rem;max-width:39rem;margin-top:1.5rem;border:1px solid var(--confirm-border);border-radius:.9rem;background:var(--confirm-subtle);padding:.9rem 1rem;color:var(--confirm-green)}
        .account-confirmation .confirm-scope p{color:var(--confirm-muted);font-size:.78rem;line-height:1.65}
        .account-confirmation .confirm-scope strong{color:var(--confirm-ink)}
        .account-confirmation .confirm-orbit{position:absolute;right:-4rem;top:-5rem;width:17rem;height:17rem;border:1px solid var(--confirm-line);border-radius:50%}
        .account-confirmation .confirm-orbit-two{right:-1.5rem;top:-2.5rem;width:12rem;height:12rem}
        .account-confirmation .confirm-index{position:absolute;right:2rem;bottom:2rem;color:var(--confirm-green);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.4rem;font-weight:700;line-height:1.25;text-align:right}
        .account-confirmation .confirm-index span{font-size:.55rem;letter-spacing:.16em}
        .account-confirmation .confirm-content{display:grid;grid-template-columns:minmax(0,1fr) 16rem;gap:1.1rem;margin-top:1.1rem}
        .account-confirmation .confirm-main,.account-confirmation .confirm-aside{border:1px solid var(--confirm-border);border-radius:1.35rem;background:var(--confirm-surface);padding:1.35rem}
        .account-confirmation .confirm-section-heading{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--confirm-line);padding-bottom:1.1rem}
        .account-confirmation .confirm-section-heading h2,.account-confirmation .confirm-aside h2{margin-top:.45rem;font-size:1.25rem;font-weight:650;letter-spacing:-.035em}
        .account-confirmation .confirm-shield{color:var(--confirm-green)}
        .account-confirmation .confirm-intro{padding:2rem .5rem 1.4rem;text-align:center}
        .account-confirmation .confirm-empty-mark{display:grid;width:3rem;height:3rem;place-items:center;margin:0 auto .9rem;border-radius:1rem;background:var(--confirm-green-soft);color:var(--confirm-green)}
        .account-confirmation .confirm-empty-title{font-size:.94rem;font-weight:700}
        .account-confirmation .confirm-muted{max-width:25rem;margin:.45rem auto 0;color:var(--confirm-muted);font-size:.78rem;line-height:1.7}
        .account-confirmation .confirm-loading{display:grid;gap:.85rem;padding:1.5rem 0}
        .account-confirmation .confirm-skeleton{height:1rem;border-radius:999px;background:var(--confirm-line);animation:confirm-pulse 1.3s ease-in-out infinite}
        .account-confirmation .confirm-skeleton.w-40{width:40%}
        .account-confirmation .confirm-skeleton.w-4\\/5{width:80%}
        .account-confirmation .confirm-error,.account-confirmation .confirm-environment{display:flex;gap:.65rem;border:1px solid var(--confirm-warning-line);border-radius:.8rem;background:var(--confirm-warning-bg);padding:.85rem;color:var(--confirm-warning);font-size:.78rem;line-height:1.6}
        .account-confirmation .confirm-error{margin:1.2rem 0}
        .account-confirmation .confirm-result{padding-top:1rem}
        .account-confirmation .confirm-result-list{display:grid;gap:.5rem;margin-top:.8rem}
        .account-confirmation .confirm-row{display:flex;align-items:center;gap:.7rem;border:1px solid var(--confirm-line);border-radius:.8rem;background:var(--confirm-subtle);padding:.75rem}
        .account-confirmation .confirm-status-icon{display:grid;width:2rem;height:2rem;flex:none;place-items:center;border-radius:.7rem;background:var(--confirm-warning-bg);color:var(--confirm-warning)}
        .account-confirmation .confirm-status-icon.is-positive{background:var(--confirm-green-soft);color:var(--confirm-green)}
        .account-confirmation .confirm-row-label,.account-confirmation .confirm-row-value{display:block}
        .account-confirmation .confirm-row-label{color:var(--confirm-muted-2);font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
        .account-confirmation .confirm-row-value{margin-top:.2rem;font-size:.78rem;font-weight:650;line-height:1.45}
        .account-confirmation .confirm-environment{margin-bottom:.8rem}
        .account-confirmation .confirm-checked-at{margin:.7rem 0;color:var(--confirm-muted-2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.65rem}
        .account-confirmation .confirm-not-granted{display:flex;gap:.6rem;align-items:flex-start;border:1px solid var(--confirm-border);border-radius:.8rem;background:var(--confirm-subtle);padding:.8rem;color:var(--confirm-green);font-size:.75rem;line-height:1.6}
        .account-confirmation .confirm-not-granted p{color:var(--confirm-muted)}
        .account-confirmation .confirm-not-granted strong{color:var(--confirm-ink)}
        .account-confirmation .confirm-action{display:flex;width:100%;height:2.9rem;align-items:center;justify-content:center;margin-top:1.1rem;border:0;border-radius:.75rem;background:var(--confirm-green);color:#fff;font-size:.85rem;font-weight:750;text-decoration:none;transition:transform .18s ease,opacity .18s ease}
        .account-confirmation .confirm-action:hover:not(:disabled){transform:translateY(-1px);opacity:.9}
        .account-confirmation .confirm-action:disabled{cursor:not-allowed;opacity:.55}
        .account-confirmation .confirm-button-note{margin-top:.65rem;color:var(--confirm-muted-2);font-size:.68rem;line-height:1.6;text-align:center}
        .account-confirmation .confirm-binding{margin-top:1.2rem;border-top:1px solid var(--confirm-line);padding-top:1.2rem}
        .account-confirmation .confirm-binding-heading{display:flex;align-items:center;justify-content:space-between;color:var(--confirm-green)}
        .account-confirmation .confirm-binding-heading h3{margin-top:.4rem;font-size:1rem;font-weight:700;letter-spacing:-.025em;color:var(--confirm-ink)}
        .account-confirmation .confirm-binding-copy{margin:.7rem 0;color:var(--confirm-muted);font-size:.76rem;line-height:1.7}
        .account-confirmation .confirm-binding-loading{padding:.8rem 0}
        .account-confirmation .confirm-binding-status{display:flex;align-items:flex-start;gap:.6rem;margin-top:.75rem;border:1px solid var(--confirm-border);border-radius:.8rem;background:var(--confirm-subtle);padding:.8rem;color:var(--confirm-green);font-size:.76rem;line-height:1.6}
        .account-confirmation .confirm-binding-status p{color:var(--confirm-muted)}
        .account-confirmation .confirm-binding-status strong{color:var(--confirm-ink)}
        .account-confirmation .confirm-binding-status.is-warning{border-color:var(--confirm-warning-line);background:var(--confirm-warning-bg);color:var(--confirm-warning)}
        .account-confirmation .confirm-consent{display:flex;align-items:flex-start;gap:.65rem;margin-top:1rem;border:1px solid var(--confirm-border);border-radius:.8rem;background:var(--confirm-subtle);padding:.8rem;color:var(--confirm-ink);font-size:.76rem;line-height:1.65}
        .account-confirmation .confirm-consent input{width:1rem;height:1rem;flex:none;margin-top:.18rem;accent-color:var(--confirm-green)}
        .account-confirmation .confirm-consent input:focus-visible{outline:2px solid var(--confirm-green);outline-offset:3px}
        .account-confirmation .confirm-aside{display:flex;flex-direction:column}
        .account-confirmation .confirm-aside-rule{width:2.2rem;height:2px;margin:1.2rem 0;background:var(--confirm-green)}
        .account-confirmation .confirm-aside>p:not(.confirm-eyebrow){color:var(--confirm-muted);font-size:.78rem;line-height:1.8}
        .account-confirmation .confirm-aside-foot{display:flex;align-items:center;gap:.7rem;margin-top:auto;padding-top:2.2rem;color:var(--confirm-muted);font-size:.67rem;line-height:1.5}
        .account-confirmation .confirm-aside-number{color:var(--confirm-green);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:1.4rem;font-weight:700}
        .account-confirmation .confirm-footer{display:flex;justify-content:space-between;gap:1rem;margin-top:1.25rem;color:var(--confirm-muted-2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.58rem;letter-spacing:.05em}
        @keyframes confirm-pulse{50%{opacity:.45}}
        .dark .account-confirmation{color-scheme:dark;--confirm-page:#14231d;--confirm-ink:#e2eee7;--confirm-surface:#1b2c24;--confirm-subtle:#20352b;--confirm-line:#354b3e;--confirm-border:#486052;--confirm-muted:#b5c7bb;--confirm-muted-2:#8ea797;--confirm-green:#a5d8b8;--confirm-green-soft:#294638;--confirm-warning:#e5cc8e;--confirm-warning-bg:#3d3524;--confirm-warning-line:#665533}
        @media(prefers-color-scheme:dark){:root:not(.light) .account-confirmation{color-scheme:dark;--confirm-page:#14231d;--confirm-ink:#e2eee7;--confirm-surface:#1b2c24;--confirm-subtle:#20352b;--confirm-line:#354b3e;--confirm-border:#486052;--confirm-muted:#b5c7bb;--confirm-muted-2:#8ea797;--confirm-green:#a5d8b8;--confirm-green-soft:#294638;--confirm-warning:#e5cc8e;--confirm-warning-bg:#3d3524;--confirm-warning-line:#665533}}
        @media(max-width:767px){.account-confirmation .confirm-content{grid-template-columns:1fr}.account-confirmation .confirm-index{right:1.2rem;bottom:1.5rem;font-size:1rem}.account-confirmation .confirm-hero{padding:1.25rem}.account-confirmation .confirm-aside-foot{padding-top:1.2rem}.account-confirmation .confirm-footer{flex-direction:column}}
        @media(prefers-reduced-motion:reduce){.account-confirmation .confirm-skeleton{animation:none}.account-confirmation .confirm-back,.account-confirmation .confirm-action{transition:none}}
      `}</style>
    </main>
  );
}

export default function PortfolioAccountConfirmationPage() {
  const { userId, sessionId, isLoaded, isSignedIn } = useAuth();
  const [result, setResult] = useState<PortfolioAccountConfirmation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [binding, setBinding] = useState<OwnerBindingState | null>(null);
  const [bindingPending, setBindingPending] = useState(false);
  const [bindingRequestPending, setBindingRequestPending] = useState(false);
  const [bindingError, setBindingError] = useState("");
  const [bindingApplied, setBindingApplied] = useState<OwnerBindingApplied | null>(null);
  const [consent, setConsent] = useState(false);
  const pendingRef = useRef(false);
  const bindingPendingRef = useRef(false);
  const authIdentity = `${userId ?? ""}:${sessionId ?? ""}:${isSignedIn ? "in" : "out"}`;
  const currentIdentity = useRef(authIdentity);
  const requestNumber = useRef(0);

  useEffect(() => {
    if (currentIdentity.current === authIdentity) return;
    currentIdentity.current = authIdentity;
    requestNumber.current += 1;
    pendingRef.current = false;
    bindingPendingRef.current = false;
    setPending(false);
    setResult(null);
    setError("");
    setBinding(null);
    setBindingPending(false);
    setBindingRequestPending(false);
    setBindingError("");
    setBindingApplied(null);
    setConsent(false);
  }, [authIdentity]);

  const checkAccount = async () => {
    if (!isLoaded || !isSignedIn || !userId || pendingRef.current || bindingPendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setResult(null);
    setError("");
    setBinding(null);
    setBindingPending(false);
    setBindingError("");
    setBindingApplied(null);
    setConsent(false);
    const identity = authIdentity;
    const requestId = ++requestNumber.current;
    try {
      const response = await apiRequest("GET", "/api/investments/portfolio-pilot/account-confirmation");
      const data = confirmationResponseSchema.parse(await response.json());
      if (requestNumber.current !== requestId || currentIdentity.current !== identity) return;
      setResult(data);
      const officiallyConfirmed = data.environment === "production" &&
        data.officialSession === "verified" && data.primaryEmail === "verified" && data.ownerMatch === "matches";
      if (officiallyConfirmed) {
        setBindingPending(true);
        try {
          const bindingResponse = await apiRequest("GET", "/api/investments/portfolio-pilot/account-binding");
          const bindingData = ownerBindingStateSchema.parse(await bindingResponse.json());
          if (requestNumber.current !== requestId || currentIdentity.current !== identity) return;
          setBinding(bindingData);
        } catch (bindingRequestError) {
          if (requestNumber.current !== requestId || currentIdentity.current !== identity) return;
          setBindingError(bindingFailureMessage(bindingRequestError));
        } finally {
          if (requestNumber.current === requestId && currentIdentity.current === identity) setBindingPending(false);
        }
      }
    } catch (requestError) {
      if (requestNumber.current !== requestId || currentIdentity.current !== identity) return;
      const status = requestError instanceof Error ? requestError.message.match(/^(\d+):/)?.[1] : undefined;
      setError(status === "401"
        ? SIGN_IN_REQUIRED_MESSAGE
        : "O serviço não conseguiu confirmar a conta agora. Você pode iniciar uma nova checagem.");
    } finally {
      if (requestNumber.current === requestId) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  const confirmBinding = async () => {
    if (!isLoaded || !isSignedIn || !userId || !consent || !result || !binding ||
      result.environment !== "production" || result.officialSession !== "verified" ||
      result.primaryEmail !== "verified" || result.ownerMatch !== "matches" ||
      binding.environment !== "production" || binding.ownerBound || binding.revoked ||
      pendingRef.current || bindingPendingRef.current || bindingRequestPending) return;
    bindingPendingRef.current = true;
    setBindingRequestPending(true);
    setBindingError("");
    const identity = authIdentity;
    const requestId = requestNumber.current;
    try {
      const response = await apiRequest("POST", "/api/investments/portfolio-pilot/account-binding", {
        confirmExclusiveOwner: true,
      });
      const applied = ownerBindingAppliedSchema.parse(await response.json());
      if (requestNumber.current !== requestId || currentIdentity.current !== identity) return;
      setBindingApplied(applied);
      setBinding({ ...binding, ownerBound: applied.ownerBound, revoked: applied.revoked, auditRecorded: applied.auditRecorded, executable: applied.executable });
      setConsent(false);
    } catch (bindingRequestError) {
      if (requestNumber.current !== requestId || currentIdentity.current !== identity) return;
      setBindingError(bindingFailureMessage(bindingRequestError));
    } finally {
      if (requestNumber.current === requestId && currentIdentity.current === identity) {
        bindingPendingRef.current = false;
        setBindingRequestPending(false);
      }
    }
  };

  const responseBelongsToSession = currentIdentity.current === authIdentity;
  return (
    <AccountConfirmationView
      result={responseBelongsToSession ? result : null}
      pending={responseBelongsToSession && pending}
      error={responseBelongsToSession ? error : ""}
      signedIn={Boolean(isSignedIn && userId)}
      loadingAuth={!isLoaded}
      onCheck={() => void checkAccount()}
      binding={responseBelongsToSession ? binding : null}
      bindingPending={responseBelongsToSession && bindingPending}
      bindingError={responseBelongsToSession ? bindingError : ""}
      bindingApplied={responseBelongsToSession ? bindingApplied : null}
      consent={responseBelongsToSession && consent}
      onConsentChange={setConsent}
      onBind={() => void confirmBinding()}
      bindingRequestPending={responseBelongsToSession && bindingRequestPending}
    />
  );
}
