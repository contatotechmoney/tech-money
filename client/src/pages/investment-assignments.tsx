import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import {
  AlertCircle,
  Clock3,
  History,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserRoundX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";

type ReviewAccess = {
  assignments: { clientId: string }[];
  canManageAssignments: boolean;
};

type Professional = {
  reviewerId: string;
  credentialReference: string;
  verifiedAt: string;
  validUntil: string;
  revokedAt: string | null;
  eligible: boolean;
};

type Assignment = {
  reviewerId: string;
  clientId: string;
  grantId: string;
  grantedBy: string;
  reason: string;
  grantedAt: string;
  revokedAt: string | null;
};

type Management = { professional: Professional | null; assignments: Assignment[] };
type HistoryEvent = {
  id: string;
  actorId: string;
  reviewerId: string;
  clientId: string;
  action: "grant" | "revoke";
  reason: string;
  grantId: string;
  occurredAt: string;
  grantedAt: string | null;
  revokedAt: string | null;
  credentialReference: string | null;
  credentialValidUntil: string | null;
};

const accessKey = (userId: string) => ["/api/investments/review-access", userId] as const;
const managementKey = (userId: string) => ["/api/investments/assignment-management", userId] as const;
const historyKey = (userId: string, clientId: string) =>
  ["/api/investments/assignment-management/clients", userId, clientId, "history"] as const;

export default function InvestmentAssignments() {
  const { user } = useUser();
  if (!user?.id) return <LoadingState />;
  return <AssignmentManagementPage key={user.id} userId={user.id} />;
}

export function AssignmentManagementPage({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [reason, setReason] = useState("");
  const [historyClient, setHistoryClient] = useState("");
  const [revokeTarget, setRevokeTarget] = useState<Assignment | null>(null);
  const [notice, setNotice] = useState("");

  const access = useQuery<ReviewAccess>({
    queryKey: accessKey(userId),
    enabled: !!userId,
    queryFn: async () => (await apiRequest("GET", "/api/investments/review-access")).json(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const authorized = access.data?.canManageAssignments === true;
  const management = useQuery<Management>({
    queryKey: managementKey(userId),
    enabled: !!userId && authorized,
    queryFn: async () => (await apiRequest("GET", "/api/investments/assignment-management")).json(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const history = useQuery<{ events: HistoryEvent[] }>({
    queryKey: historyKey(userId, historyClient),
    enabled: !!userId && authorized && !!historyClient,
    queryFn: async () =>
      (await apiRequest(
        "GET",
        `/api/investments/assignment-management/clients/${encodeURIComponent(historyClient)}/history`,
      )).json(),
    staleTime: 0,
  });

  const normalizedClientId = clientId.trim();
  const normalizedReason = reason.trim();
  const currentAssignment = management.data?.assignments.find(
    (item) => item.clientId === normalizedClientId && item.reviewerId === management.data?.professional?.reviewerId,
  );
  const canSubmit = /^[A-Za-z0-9_-]{1,200}$/.test(normalizedClientId) &&
    normalizedReason.length >= 10 &&
    normalizedReason.length <= 4000 &&
    (!currentAssignment || !!currentAssignment.revokedAt) &&
    !revokeTarget &&
    management.data?.professional?.eligible === true &&
    management.data?.professional?.reviewerId !== normalizedClientId;

  const refreshRelated = async (changedClientId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/investments/review-access"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/investments/assignment-management"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/investments/assignment-management/clients", userId, changedClientId, "history"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/investments/assignment-management/clients", userId, changedClientId] }),
       queryClient.invalidateQueries({ queryKey: [`/api/investments/review-clients/${changedClientId}/reports`] }),
      queryClient.invalidateQueries({ queryKey: ["/api/investments/overview"] }),
    ]);
  };

  const grant = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/investments/assignment-management/grant", {
        clientId: normalizedClientId,
        reason: normalizedReason,
        expectedGrantId: currentAssignment?.grantId ?? null,
      });
      return response.json() as Promise<{ assignment: Assignment }>;
    },
    onSuccess: async (result) => {
      setNotice(currentAssignment?.revokedAt
        ? "A nova atribuição foi registrada. Aprovações anteriores não foram restauradas; qualquer nova análise exige revisão profissional."
        : "A atribuição foi registrada e vinculada ao consultor verificado.");
      setReason("");
      setHistoryClient(result.assignment.clientId);
      setRevokeTarget(null);
      await refreshRelated(result.assignment.clientId);
    },
  });

  const revoke = useMutation({
    mutationFn: async (assignment: Assignment) => {
      const response = await apiRequest("POST", "/api/investments/assignment-management/revoke", {
        clientId: assignment.clientId,
        reason: normalizedReason,
        expectedGrantId: assignment.grantId,
      });
      return response.json() as Promise<{ assignment: Assignment }>;
    },
    onSuccess: async (_result, assignment) => {
      setNotice("A atribuição foi revogada. O acesso de revisão foi removido; o histórico permanece disponível.");
      setHistoryClient(assignment.clientId);
      setReason("");
      setRevokeTarget(null);
      await refreshRelated(assignment.clientId);
    },
  });

  const mutationError = grant.error ?? revoke.error;
  const errorMessage = mutationError ? describeError(mutationError) : "";
  const conflict = mutationError instanceof Error && mutationError.message.includes("409");

  if (!userId || access.isLoading || access.isFetching) {
    return <LoadingState />;
  }
  if (access.isError) {
    return <StatusPanel
      title={describeQueryError(access.error)}
      description="O acesso à gestão permanece bloqueado até que a autorização possa ser verificada."
      action={<Button variant="outline" onClick={() => void access.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Verificar novamente</Button>}
    />;
  }
  if (!authorized) {
    return <StatusPanel
      title="Acesso não autorizado"
      description="A gestão de atribuições está disponível somente para contas administrativas autorizadas."
    />;
  }
  if (management.isLoading || (!management.data && !management.isError)) {
    return <main className="space-y-5" aria-label="Carregando gestão de atribuições">
      <div className="h-28 animate-pulse rounded-lg bg-muted/60" />
      <div className="h-64 animate-pulse rounded-lg bg-muted/60" />
    </main>;
  }
  if (management.isError) {
    return <StatusPanel
      title={describeQueryError(management.error)}
      description="Nenhuma alteração foi feita. Tente carregar os dados novamente."
      action={<Button variant="outline" onClick={() => void management.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>}
    />;
  }

  const professional = management.data!.professional;
  const assignments = management.data!.assignments;
  const activeCount = assignments.filter((item) => !item.revokedAt).length;

  return (
    <main className="space-y-6" aria-labelledby="assignments-heading">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <ShieldCheck className="h-4 w-4" /> Responsabilidade profissional
          </p>
          <h1 id="assignments-heading" className="text-3xl font-bold tracking-tight">Atribuições de clientes</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Cada vínculo identifica quem responde pela revisão profissional. Registre o motivo e preserve o histórico de cada decisão.
          </p>
        </div>
        <Button variant="outline" onClick={() => { void management.refetch(); void access.refetch(); }}>
          <RefreshCw className="mr-2 h-4 w-4" />Atualizar dados
        </Button>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <Card className="overflow-hidden border-primary/20">
          <CardHeader className="border-b bg-primary/[0.035]">
            <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />Consultor responsável</CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {!professional ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Nenhum consultor verificado está configurado. Atribuições não podem ser concedidas até que a qualificação esteja disponível.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Detail label="Identidade do consultor" value={professional.reviewerId} />
                <Detail label="Referência de credencial" value={professional.credentialReference} />
                <Detail label="Verificação" value={formatDate(professional.verifiedAt)} />
                <Detail label="Validade" value={formatDate(professional.validUntil)} />
                <div className="sm:col-span-2">
                  <Badge variant={professional.eligible && !professional.revokedAt ? "default" : "destructive"}>
                    {professional.revokedAt ? "Credencial revogada" : professional.eligible ? "Qualificação apta" : "Qualificação não apta"}
                  </Badge>
                  {professional.revokedAt && <span className="ml-2 text-xs text-muted-foreground">Revogada em {formatDate(professional.revokedAt)}</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-[#f2f7f4]">
          <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visão operacional</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-[#1b4d3e]">{activeCount}</p>
              <p className="text-sm text-muted-foreground">clientes com vínculo ativo</p>
            </div>
            <p className="border-t border-[#d6e4dc] pt-4 text-xs leading-5 text-muted-foreground">
              Revogações e novos vínculos são registrados com responsável, horário e justificativa.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-lg"><UserPlus className="h-5 w-5 text-primary" />Registrar atribuição</CardTitle>
            <p className="text-sm text-muted-foreground">Informe o ID Clerk conhecido do cliente. Não há busca ou diretório de clientes.</p>
          </CardHeader>
          <CardContent className="p-5">
             <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (canSubmit && !grant.isPending && !revoke.isPending) grant.mutate(); }}>
              <label htmlFor="assignment-client" className="block text-sm font-medium">ID do cliente</label>
              <input
                id="assignment-client"
                value={clientId}
                onChange={(event) => { setClientId(event.target.value); setNotice(""); }}
                required
                 maxLength={200}
                 pattern="[A-Za-z0-9_-]+"
                 disabled={grant.isPending || revoke.isPending}
                autoComplete="off"
                spellCheck={false}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="user_..."
              />
              {normalizedClientId && professional?.reviewerId === normalizedClientId && (
                <p role="alert" className="text-sm text-destructive">O consultor não pode ser atribuído como cliente de si próprio.</p>
              )}
              <label htmlFor="assignment-reason" className="block text-sm font-medium">Motivo da atribuição <span className="text-destructive">*</span></label>
               <Textarea id="assignment-reason" value={reason} onChange={(event) => { setReason(event.target.value); setNotice(""); }} disabled={grant.isPending || revoke.isPending || !!revokeTarget} required minLength={10} maxLength={4000} rows={4} placeholder="Registre o contexto e a responsabilidade deste vínculo." />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Mínimo de 10 caracteres</span><span>{normalizedReason.length}/4000</span>
              </div>
              {professional && !professional.eligible && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">A qualificação não está apta. A concessão está bloqueada; revogações continuam disponíveis.</p>}
              {professional?.eligible && professional.revokedAt && <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">A credencial foi revogada. Não é possível conceder uma nova atribuição.</p>}
              {currentAssignment && <p className="text-xs text-muted-foreground">{currentAssignment.revokedAt ? "Este cliente possui atribuição anterior revogada; uma nova concessão será registrada como reatribuição." : "Este cliente já possui atribuição ativa. Uma nova concessão será rejeitada pelo servidor."}</p>}
               <p className="text-xs text-muted-foreground">Uma nova concessão nunca restaura aprovações anteriores; os relatórios precisarão de nova revisão.</p>
              {mutationError && <MutationAlert message={errorMessage} conflict={conflict} onRefresh={() => { void management.refetch(); void access.refetch(); if (historyClient) void history.refetch(); }} />}
              {notice && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
              <Button type="submit" className="w-full" disabled={!canSubmit || grant.isPending || revoke.isPending}>
                {grant.isPending ? "Registrando vínculo..." : currentAssignment?.revokedAt ? "Registrar reatribuição" : "Conceder atribuição"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-lg"><UserRoundX className="h-5 w-5 text-primary" />Vínculos registrados</CardTitle>
            <p className="text-sm text-muted-foreground">Vínculos ativos e revogados; dados operacionais mínimos para prestação de contas.</p>
          </CardHeader>
          <CardContent className="p-5">
            {assignments.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center">
                <UserRound className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Nenhuma atribuição registrada</p>
                <p className="mt-1 text-xs text-muted-foreground">O histórico será criado quando um vínculo for concedido.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {assignments.map((item) => (
                  <li key={item.grantId} className="rounded-md border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <button type="button" onClick={() => setHistoryClient(item.clientId)} className="break-all text-left font-mono text-sm font-medium text-primary underline-offset-4 hover:underline">
                        {item.clientId}
                      </button>
                      <Badge variant={item.revokedAt ? "outline" : "default"}>{item.revokedAt ? "Revogada" : "Ativa"}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Concedida em {formatDate(item.grantedAt)} · por {item.grantedBy}</p>
                    {item.revokedAt && <p className="mt-1 text-xs text-muted-foreground">Revogada em {formatDate(item.revokedAt)}</p>}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-5">{item.reason}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => setHistoryClient(item.clientId)}><History className="mr-2 h-4 w-4" />Ver histórico</Button>
                       {!item.revokedAt && <Button type="button" size="sm" variant="destructive" disabled={revoke.isPending || grant.isPending} onClick={() => { setRevokeTarget(item); setClientId(item.clientId); setReason(""); setNotice(""); }}>
                        Revogar vínculo
                      </Button>}
                    </div>
                    {revokeTarget?.grantId === item.grantId && !item.revokedAt && (
                      <div className="mt-4 space-y-3 rounded-md border border-destructive/30 bg-destructive/[0.035] p-4">
                        <p className="text-sm font-semibold">Confirme a revogação</p>
                        <p className="text-xs leading-5 text-muted-foreground">O consultor perderá a autorização para revisar este cliente. O evento ficará no histórico.</p>
                        <label htmlFor={`revoke-reason-${item.grantId}`} className="block text-sm font-medium">Motivo da revogação</label>
                         <Textarea id={`revoke-reason-${item.grantId}`} value={reason} onChange={(event) => setReason(event.target.value)} disabled={revoke.isPending} required minLength={10} maxLength={4000} rows={3} placeholder="Explique o motivo da revogação." />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" disabled={revoke.isPending} onClick={() => setRevokeTarget(null)}>Cancelar</Button>
                           <Button type="button" variant="destructive" size="sm" disabled={normalizedReason.length < 10 || normalizedReason.length > 4000 || revoke.isPending || grant.isPending} onClick={() => revoke.mutate(item)}>
                            {revoke.isPending ? "Revogando..." : "Confirmar revogação"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg"><Clock3 className="h-5 w-5 text-primary" />Histórico de atribuições</CardTitle>
           <p className="text-sm text-muted-foreground">Últimos 200 eventos imutáveis para o cliente selecionado. Atribuições antigas feitas no banco podem não ter eventos anteriores.</p>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="history-client" className="sr-only">ID do cliente para consultar histórico</label>
            <input id="history-client" value={historyClient} onChange={(event) => setHistoryClient(event.target.value.trim())} placeholder="Digite o ID Clerk do cliente" autoComplete="off" spellCheck={false} className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <Button type="button" variant="outline" disabled={!historyClient || history.isFetching} onClick={() => void history.refetch()}><History className="mr-2 h-4 w-4" />Carregar histórico</Button>
          </div>
          {!historyClient ? (
            <p className="mt-4 rounded-md border border-dashed p-5 text-sm text-muted-foreground">Selecione um cliente na lista ou informe seu ID para consultar a trilha de auditoria.</p>
          ) : history.isLoading ? (
            <div className="mt-4 h-28 animate-pulse rounded-md bg-muted/60" aria-label="Carregando histórico" />
          ) : history.isError ? (
            <div className="mt-4"><StatusPanel title={describeQueryError(history.error)} description="O histórico não foi carregado." action={<Button variant="outline" onClick={() => void history.refetch()}>Tentar novamente</Button>} /></div>
          ) : (history.data?.events.length ?? 0) === 0 ? (
            <p className="mt-4 rounded-md border border-dashed p-5 text-sm text-muted-foreground">Nenhum evento de atribuição encontrado para este ID.</p>
          ) : (
            <ol className="mt-5 space-y-4">
              {history.data!.events.map((event) => (
                <li key={event.id} className="border-l-2 border-primary/30 pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={event.action === "grant" ? "default" : "destructive"}>{event.action === "grant" ? "Atribuição concedida" : "Atribuição revogada"}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(event.occurredAt)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Cliente {event.clientId} · consultor {event.reviewerId} · responsável {event.actorId}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-5">{event.reason}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Credencial {event.credentialReference || "não informada"} · válida até {formatDate(event.credentialValidUntil || undefined)}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function LoadingState() {
  return <main className="space-y-4" aria-label="Verificando acesso"><div className="h-24 animate-pulse rounded-lg bg-muted/60" /><div className="h-52 animate-pulse rounded-lg bg-muted/60" /></main>;
}

function StatusPanel({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <Card><CardContent className="flex flex-col items-start gap-3 p-6" role="alert">
    <AlertCircle className="h-5 w-5 text-primary" /><h1 className="text-lg font-semibold">{title}</h1>
    <p className="max-w-xl text-sm text-muted-foreground">{description}</p>{action}
  </CardContent></Card>;
}

function MutationAlert({ message, conflict, onRefresh }: { message: string; conflict: boolean; onRefresh: () => void }) {
  return <div role="alert" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
    <p>{message}</p>
    {conflict && <Button type="button" size="sm" variant="outline" onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" />Atualizar estado antes de tentar novamente</Button>}
  </div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-all text-sm font-medium">{value}</p></div>;
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("PROFESSIONAL_NOT_ELIGIBLE")) return "A habilitação profissional está ausente, vencida ou revogada. Não foi concedida atribuição; revogações continuam disponíveis.";
  if (message.includes("ASSIGNMENT_ALREADY_ACTIVE")) return "Já existe um vínculo ativo. Nenhuma nova concessão foi registrada.";
  if (message.includes("ASSIGNMENT_ALREADY_REVOKED")) return "Este vínculo já está revogado. Nenhuma nova revogação foi registrada.";
  if (message.includes("SELF_ASSIGNMENT_FORBIDDEN")) return "O consultor não pode ser atribuído como cliente de si próprio.";
  if (message.includes("409")) return "O vínculo mudou desde a última leitura. Nenhuma alteração foi aplicada; atualize o estado e confira novamente antes de tentar.";
  if (message.includes("403")) return "A operação não está autorizada. Atualize suas permissões; nenhuma alteração foi aplicada.";
   if (message.includes("503")) return "O serviço de atribuições está temporariamente indisponível. Atualize os dados e confira o histórico antes de repetir a operação.";
  return "Não foi possível concluir a operação. Nenhuma alteração foi confirmada; verifique os dados e tente novamente.";
}

function describeQueryError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("403")) return "Acesso não autorizado";
  if (message.includes("503")) return "Serviço temporariamente indisponível";
  return "Não foi possível carregar os dados de atribuições";
}

function formatDate(value?: string) {
  if (!value) return "Não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
