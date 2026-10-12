import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAssinarTermo, useConformidade, usePerfil } from "@/lib/suitability-api";

export function ConformidadeGate({ ticker }: { ticker: string }) {
  const perfil = usePerfil();
  const conformidade = useConformidade(ticker);
  const assinar = useAssinarTermo();

  if (perfil.isLoading || conformidade.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando adequação ao seu perfil...
      </div>
    );
  }

  if (perfil.data && !perfil.data.avaliado) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Perfil de investidor não preenchido. Sem essa informação, a adequação não pode ser avaliada; isso não libera uma recomendação.
        </span>
        <Link href="/investments/suitability" className="shrink-0 font-semibold underline">
          Preencher perfil
        </Link>
      </div>
    );
  }

  if (conformidade.data?.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950" role="note">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Compatibilidade preliminar com o perfil {conformidade.data.perfil ? `(${conformidade.data.perfil})` : ""}. Isso não é aprovação do ativo nem recomendação personalizada; a revisão profissional permanece pendente.
        </span>
      </div>
    );
  }

  if (conformidade.data && !conformidade.data.ok) {
    const resultado = conformidade.data;
    return (
      <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          {resultado.motivo}
        </div>
        {resultado.incompativel && (
          <p>Os dados indicam possível incompatibilidade com seu perfil. Esta informação não constitui recomendação personalizada.</p>
        )}
        {resultado.riscoIndisponivel ? (
          <p className="text-amber-800">
            A análise de risco não está disponível. A ausência de dados não confirma adequação nem libera uma recomendação.
          </p>
        ) : !resultado.incompativel && (
          <Link href="/investments/suitability" className="inline-block font-semibold underline">
            Atualizar perfil
          </Link>
        )}
        {resultado.incompativel && !resultado.termoCienciaAssinado ? (
          <Button
            variant="outline"
            size="sm"
            disabled={assinar.isPending}
            onClick={() => assinar.mutate({
              ticker,
            })}
          >
            {assinar.isPending ? "Registrando..." : "Registrar ciência sobre a incompatibilidade"}
          </Button>
        ) : resultado.incompativel ? (
          <p className="text-xs text-amber-700">
            Registro de ciência existente — isso não altera a avaliação de compatibilidade nem equivale a aprovação ou recomendação.
          </p>
        ) : null}
      </div>
    );
  }

  if (perfil.isError || conformidade.isError || !conformidade.data) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Não foi possível confirmar a adequação ao perfil. A recomendação continua pendente de revisão profissional.
      </div>
    );
  }

  return null;
}