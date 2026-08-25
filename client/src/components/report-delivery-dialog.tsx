import { useEffect, useState } from "react";
import { Check, Mail, MessageCircle, Send } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest } from "@/lib/queryClient";

type ReportForDelivery = {
  ticker: string;
  companyName: string;
};

type DeliveryChannel = "email" | "whatsapp";

export function ReportDeliveryDialog({
  report,
  open,
  onOpenChange,
}: {
  report: ReportForDelivery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const { user } = useUser();
  const registeredEmail = user?.primaryEmailAddress?.emailAddress || "";
  const registeredPhone = user?.primaryPhoneNumber?.phoneNumber || "";
  const [channel, setChannel] = useState<DeliveryChannel>("email");
  const [contact, setContact] = useState("");
  const [useRegisteredPhone, setUseRegisteredPhone] = useState(Boolean(registeredPhone));
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (open) {
      setChannel("email");
      setContact(registeredEmail);
      setUseRegisteredPhone(Boolean(registeredPhone));
      setSubmitted(false);
    }
  }, [open, registeredEmail, registeredPhone]);

  const deliveryMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/investments/reports/${report?.ticker}/delivery`, {
        channel,
        contact: channel === "whatsapp" && useRegisteredPhone ? "registered" : contact.trim(),
        useRegisteredContact: channel === "whatsapp" && useRegisteredPhone,
      }),
    onSuccess: () => setSubmitted(true),
  });

  const isValid = channel === "email"
    ? contact.trim().length > 0
    : (useRegisteredPhone ? Boolean(registeredPhone) : contact.trim().length > 0);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isValid && report) deliveryMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("freeDelivery")}</DialogTitle>
          <DialogDescription>
            {report?.ticker} · {report?.companyName}. {t("freeDeliveryDescription")}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-800">
            <Check className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-3 font-semibold">{t("deliverySuccess")}</p>
            <p className="mt-1 text-sm">{t("deliverySuccessDescription")}</p>
            <Button className="mt-5" onClick={() => onOpenChange(false)}>{t("close")}</Button>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("deliveryChannel")}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${channel === "email" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                  onClick={() => {
                    setChannel("email");
                    setContact(registeredEmail);
                  }}
                  aria-pressed={channel === "email"}
                >
                  <Mail className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{t("emailChannel")}</span>
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${channel === "whatsapp" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}
                  onClick={() => {
                    setChannel("whatsapp");
                    setUseRegisteredPhone(Boolean(registeredPhone));
                    setContact("");
                  }}
                  aria-pressed={channel === "whatsapp"}
                >
                  <MessageCircle className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{t("whatsappChannel")}</span>
                </button>
              </div>
            </fieldset>

            {channel === "email" ? (
              <div className="space-y-2">
                <Label htmlFor="delivery-email">{t("deliveryEmailLabel")}</Label>
                <Input
                  id="delivery-email"
                  type="email"
                  autoComplete="email"
                  value={contact}
                  onChange={(event) => setContact(event.target.value)}
                  required
                />
              </div>
            ) : (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">{t("whatsappContactQuestion")}</legend>
                {registeredPhone && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                    <input
                      type="radio"
                      name="whatsapp-contact"
                      checked={useRegisteredPhone}
                      onChange={() => {
                        setUseRegisteredPhone(true);
                        setContact("");
                      }}
                      className="mt-1 accent-primary"
                    />
                    <span className="text-sm">{t("registeredWhatsApp")} <strong className="block font-medium text-foreground">{registeredPhone}</strong></span>
                  </label>
                )}
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                  <input
                    type="radio"
                    name="whatsapp-contact"
                    checked={!useRegisteredPhone}
                    onChange={() => setUseRegisteredPhone(false)}
                    className="mt-1 accent-primary"
                  />
                  <span className="text-sm">{t("otherWhatsApp")}</span>
                </label>
                {!registeredPhone && <p className="text-xs text-muted-foreground">{t("noRegisteredWhatsApp")}</p>}
                {!useRegisteredPhone && (
                  <div className="space-y-2">
                    <Label htmlFor="delivery-whatsapp">{t("whatsappNumberLabel")}</Label>
                    <Input
                      id="delivery-whatsapp"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+55 (11) 99999-9999"
                      value={contact}
                      onChange={(event) => setContact(event.target.value)}
                      required
                    />
                  </div>
                )}
              </fieldset>
            )}

            {deliveryMutation.isError && <p className="text-sm text-destructive">{t("deliveryError")}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={!isValid || deliveryMutation.isPending}>
                <Send className="mr-2 h-4 w-4" />
                {deliveryMutation.isPending ? t("loading") : t("requestFreeAnalysis")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}