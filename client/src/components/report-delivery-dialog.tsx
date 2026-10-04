import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
          <DialogTitle>Revisão profissional pendente</DialogTitle>
          <DialogDescription>
            {report?.ticker} · {report?.companyName}. Este relatório contém informações gerais e ainda não foi aprovado para envio.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-5 text-amber-950" role="status">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>O envio permanece indisponível enquanto a recomendação aguarda revisão profissional. Compatibilidade com um perfil não representa aprovação.</p>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}