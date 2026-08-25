import { Settings as SettingsIcon, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Settings() {
  const { t } = useLanguage();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("settingsTitle")}</h1>
        <p className="mt-2 text-muted-foreground">{t("settingsDescription")}</p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            {t("settingsTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <UserRound className="h-4 w-4 text-primary" />
          {t("comingSoon")}
        </CardContent>
      </Card>
    </div>
  );
}