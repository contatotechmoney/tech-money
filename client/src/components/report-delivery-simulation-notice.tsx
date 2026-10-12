import * as React from "react";

export function ReportDeliverySimulationNotice() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Envios reais bloqueados nesta fase de simulação, mesmo com revisão aprovada.
      O acompanhamento automático está suspenso; os registros anteriores foram preservados.
    </p>
  );
}

export function DeliveryMonitoringSuspendedNotice() {
  return <p role="status" className="text-sm text-muted-foreground">
    Monitoramento automático de entregas suspenso nesta fase de simulação.
    Nenhum registro anterior foi apagado.
  </p>;
}
