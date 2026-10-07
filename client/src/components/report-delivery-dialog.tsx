import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportDeliverySimulationNotice } from "./report-delivery-simulation-notice";

type ReportForDelivery = {
  ticker: string;
  companyName: string;
};

export function ReportDeliveryDialog({
  report,
  open,
  onOpenChange,
}: {
  report: ReportForDelivery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envios reais bloqueados — simulação</DialogTitle>
          <DialogDescription>
            {report?.ticker} · {report?.companyName}. Nesta fase de simulação não há envio real de relatórios.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-950" role="status">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <ReportDeliverySimulationNotice />
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}