import * as React from "react";

export function ReportDeliverySimulationNotice() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Envios reais bloqueados nesta fase de simulação, mesmo com revisão aprovada.
      O histórico de entregas anteriores continua disponível.
    </p>
  );
}
