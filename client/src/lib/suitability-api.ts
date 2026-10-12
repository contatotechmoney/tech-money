import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "./analytics";
import { apiRequest } from "./queryClient";

export type Perfil = "CONSERVADOR" | "MODERADO" | "AGRESSIVO";

export interface SuitabilityQuestion {
  id: string;
  pergunta: string;
  opcoes: string[];
}

export interface SuitabilityProfile {
  id: string;
  userId: string;
  perfil: Perfil;
  pontuacaoMedia: number;
  dataAvaliacao: string;
  dataProximaReavaliacao: string;
}

export interface ConformidadeResult {
  ok: boolean;
  perfil?: Perfil;
  perfilExigido?: Perfil;
  risco?: number | null;
  incompativel?: boolean;
  termoCienciaAssinado?: boolean;
  riscoIndisponivel?: boolean;
  motivo?: string;
}

export function useQuestionario() {
  return useQuery<{ questoes: SuitabilityQuestion[] }>({
    queryKey: ["/api/suitability/questionario"],
  });
}

export function usePerfil() {
  return useQuery<{ perfil: SuitabilityProfile | null; avaliado: boolean }>({
    queryKey: ["/api/suitability/perfil"],
  });
}

export function useSalvarPerfil() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (respostas: Record<string, number>) =>
      apiRequest("POST", "/api/suitability/perfil", { respostas })
        .then((response) => response.json() as Promise<{ perfil: SuitabilityProfile }>),
    onSuccess: async (data, respostas) => {
      trackEvent("suitability_profile_saved", {
        profile: data.perfil.perfil.toLowerCase(),
        question_count: Object.keys(respostas).length,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/suitability/perfil"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/suitability/conformidade"] });
    },
  });
}

export function useConformidade(ticker: string) {
  return useQuery<ConformidadeResult>({
    queryKey: ["/api/suitability/conformidade", ticker],
    queryFn: async () => {
      const response = await fetch(`/api/suitability/conformidade/${encodeURIComponent(ticker)}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "Não foi possível verificar a conformidade.");
      }
      return response.json() as Promise<ConformidadeResult>;
    },
    enabled: Boolean(ticker),
  });
}

export function useAssinarTermo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { ticker: string }) =>
      apiRequest("POST", "/api/suitability/termo", input).then((response) => response.json()),
    onSuccess: async (_data, input) => {
      trackEvent("suitability_term_signed", {
        ticker: input.ticker,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/suitability/conformidade"] });
    },
  });
}