import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, CreditCard, Sparkles, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCountryRate } from "@/hooks/useCountryRate";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Credits() {
  const { t, formatCurrency } = useLanguage();
  const countryRate = useCountryRate();
  const [isAnnual, setIsAnnual] = useState(false);

  // Prices in BRL (Base)
  const prices = {
    standalone: 49,
    pro: 149,
    enterprise: 399
  };

  const getPrice = (basePrice: number) => {
    let finalPrice = basePrice;
    if (isAnnual) {
      finalPrice = basePrice * 0.6; // 40% discount
    }
    return formatCurrency(finalPrice);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-8 animate-in fade-in duration-500">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold font-heading">{t("plansCredits")}</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t("acquireCredits")}
        </p>
        
        <div className="flex items-center justify-center gap-4 mt-8">
          <Label htmlFor="billing-switch" className={`text-sm font-medium ${!isAnnual ? 'text-primary' : 'text-muted-foreground'}`}>
            Mensal
          </Label>
          <Switch 
            id="billing-switch" 
            checked={isAnnual} 
            onCheckedChange={setIsAnnual}
          />
          <Label htmlFor="billing-switch" className={`text-sm font-medium ${isAnnual ? 'text-primary' : 'text-muted-foreground'}`}>
            Anual <span className="text-xs text-green-600 font-bold ml-1">({t("save40")})</span>
          </Label>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Basic Pack */}
        <Card className="flex flex-col shadow-sm hover:shadow-lg transition-shadow border-t-4 border-t-slate-200">
          <CardHeader>
            <CardTitle className="text-xl">{t("standalone")}</CardTitle>
            <CardDescription>{t("forPointAnalysis")}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">{formatCurrency(prices.standalone)}</span>
              <span className="text-muted-foreground text-sm">{t("credits5")}</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                {formatCurrency(prices.standalone / 5)} {t("perReport")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                {t("validityDays")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                {t("allReportTypes")}
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline">{t("buyPackage")}</Button>
          </CardFooter>
        </Card>

        {/* Pro Plan */}
        <Card className="flex flex-col relative border-primary shadow-xl scale-105 z-10 border-t-4 border-t-primary bg-white">
          <div className="absolute top-0 right-0 -mt-3 -mr-3">
            <span className="bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-md flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Popular
            </span>
          </div>
          <CardHeader>
            <CardTitle className="text-xl text-primary">{t("professional")}</CardTitle>
            <CardDescription>{t("forAccountants")}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">{getPrice(prices.pro)}</span>
              <span className="text-muted-foreground text-sm">{isAnnual ? t("perYear") : t("perMonth")}</span>
            </div>
            {isAnnual && (
              <p className="text-xs text-green-600 font-medium mt-1">
                {t("billedAnnually")}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3 text-sm font-medium">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                20 {t("monthlyCredits")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                {t("accumulateCredits")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                {t("whitelabelReports")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                {t("prioritySupport")}
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full h-11 shadow-lg shadow-primary/20">{t("subscribeNow")}</Button>
          </CardFooter>
        </Card>

        {/* Enterprise */}
        <Card className="flex flex-col shadow-sm hover:shadow-lg transition-shadow border-t-4 border-t-slate-800">
          <CardHeader>
            <CardTitle className="text-xl">{t("enterprise")}</CardTitle>
            <CardDescription>{t("largeCaps")}</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">{getPrice(prices.enterprise)}</span>
              <span className="text-muted-foreground text-sm">{isAnnual ? t("perYear") : t("perMonth")}</span>
            </div>
            {isAnnual && (
              <p className="text-xs text-green-600 font-medium mt-1">
                {t("billedAnnually")}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-slate-800" />
                {t("unlimitedCredits")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-slate-800" />
                {t("apiIntegration")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-slate-800" />
                {t("multipleUsers")}
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-slate-800" />
                {t("accountManager")}
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button className="w-full" variant="outline">{t("talkSales")}</Button>
          </CardFooter>
        </Card>
      </div>

      <div className="bg-muted/50 rounded-lg p-8 mt-12">
        <h3 className="text-lg font-bold mb-4">{t("consumptionTable")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-background p-4 rounded border border-border">
            <div className="font-semibold text-primary">Mensal</div>
            <div className="text-2xl font-bold">1 Crédito</div>
          </div>
          <div className="bg-background p-4 rounded border border-border">
            <div className="font-semibold text-primary">Trimestral</div>
            <div className="text-2xl font-bold">2 Créditos</div>
          </div>
          <div className="bg-background p-4 rounded border border-border">
            <div className="font-semibold text-primary">Semestral</div>
            <div className="text-2xl font-bold">3 Créditos</div>
          </div>
          <div className="bg-background p-4 rounded border border-border">
            <div className="font-semibold text-primary">Anual</div>
            <div className="text-2xl font-bold">5 Créditos</div>
          </div>
        </div>
      </div>
    </div>
  );
}
