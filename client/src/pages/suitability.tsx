import { useState } from "react";
import { AlertCircle, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  usePerfil,
  useQuestionario,
  useSalvarPerfil,
  type SuitabilityProfile,
} from "@/lib/suitability-api";

const PERFIL_LABEL: Record<string, string> = {
  CONSERVADOR: "Conservador",
  MODERADO: "Moderado",
  AGRESSIVO: "Agressivo",
};

const PERFIL_COLOR: Record<string, string> = {
  CONSERVADOR: "border-emerald-200 text-emerald-700",
  MODERADO: "border-amber-200 text-amber-700",
  AGRESSIVO: "border-red-200 text-red-700",
};

export default function Suitability() {
  const questionario = useQuestionario();
  const perfil = usePerfil();
  const salvar = useSalvarPerfil();
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  const [refazendo, setRefazendo] = useState(false);

  if (perfil.isLoading || questionario.isLoading) {
    return <LoadingState text="Carregando seu perfil..." />;
  }

  if (perfil.isError || questionario.isError) {
    return (
      <Card className="mx-auto max-w-3xl">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-destructive">
          <AlertCircle className="h-5 w-5" />
          Não foi possível carregar o questionário de suitability. Tente novamente.
        </CardContent>
      </Card>
    );
  }

  const perfilExpirado = Boolean(
    perfil.data?.perfil
    && new Date(perfil.data.perfil.dataProximaReavaliacao).getTime() <= Date.now(),
  );

  if (perfil.data?.avaliado && perfil.data.perfil && !refazendo && !perfilExpirado) {
    return <PerfilAtual perfil={perfil.data.perfil} onRefazer={() => setRefazendo(true)} />;
  }

  const questoes = questionario.data?.questoes ?? [];
  const completo = questoes.length > 0 && questoes.every((questao) => respostas[questao.id] !== undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeading
        title={perfilExpirado ? "Atualize seu perfil de risco" : "Conheça seu perfil de risco"}
        description={perfilExpirado
          ? "Seu perfil precisa ser reavaliado para que as recomendações continuem adequadas, conforme a Resolução CVM 30/2021."
          : "Responda às seis perguntas para classificar seu perfil e adequar as recomendações ao seu momento, conforme a Resolução CVM 30/2021."}
      />

      {perfilExpirado && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Seu perfil anterior venceu e não pode mais ser usado para validar recomendações.
        </div>
      )}

      {salvar.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          Não foi possível salvar seu perfil. Revise as respostas e tente novamente.
        </div>
      )}

      <div className="space-y-4">
        {questoes.map((questao, index) => (
          <Card key={questao.id}>
            <CardHeader>
              <CardTitle className="text-base">{index + 1}. {questao.pergunta}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {questao.opcoes.map((opcao, optionIndex) => (
                <label
                  key={opcao}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors ${
                    respostas[questao.id] === optionIndex
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name={questao.id}
                    className="h-4 w-4 accent-[#2a9d8f]"
                    checked={respostas[questao.id] === optionIndex}
                    onChange={() => setRespostas((previous) => ({ ...previous, [questao.id]: optionIndex }))}
                  />
                  {opcao}
                </label>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Button className="w-full" disabled={!completo || salvar.isPending} onClick={() => salvar.mutate(respostas)}>
        {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar meu perfil
      </Button>
    </div>
  );
}

function PerfilAtual({ perfil, onRefazer }: { perfil: SuitabilityProfile; onRefazer: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeading
        title="Seu perfil de risco"
        description="Usamos este perfil para verificar a adequação das recomendações, conforme a Resolução CVM 30/2021."
      />
      <Card>
        <CardContent className="space-y-4 p-6">
          <ProfileRow label="Classificação">
            <Badge variant="outline" className={PERFIL_COLOR[perfil.perfil]}>
              {PERFIL_LABEL[perfil.perfil]}
            </Badge>
          </ProfileRow>
          <ProfileRow label="Pontuação">
            <span className="font-semibold">{perfil.pontuacaoMedia.toFixed(2).replace(".", ",")} / 5</span>
          </ProfileRow>
          <ProfileRow label="Próxima reavaliação" bordered>
            <span className="text-sm">{new Date(perfil.dataProximaReavaliacao).toLocaleDateString("pt-BR")}</span>
          </ProfileRow>
          <Button variant="outline" className="w-full" onClick={onRefazer}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Refazer questionário
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
        <ShieldCheck className="h-3.5 w-3.5" />
        Perfil do investidor
      </div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted-foreground">{description}</p>
    </div>
  );
}

function ProfileRow({ label, children, bordered = false }: { label: string; children: React.ReactNode; bordered?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bordered ? "border-t pt-4" : ""}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}