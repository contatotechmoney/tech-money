import { Clock3, Settings } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

type PlaceholderKind = "settings";

export default function InvestmentPlaceholder({ kind }: { kind: PlaceholderKind }) {
  const { t } = useLanguage();
  const content = { title: t("settingsTitle"), description: t("settingsDescription"), icon: Settings };
  const Icon = content.icon;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-2 text-muted-foreground">{content.description}</p>
      </div>
      <Card>
        <CardContent className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-8 w-8" />
          </div>
          <Badge variant="outline" className="mt-6 gap-2 border-primary/20 bg-primary/5 text-primary">
            <Clock3 className="h-3.5 w-3.5" />
            {t("comingSoon")}
          </Badge>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">{content.description}</p>
        </CardContent>
      </Card>
    </div>
  );
}