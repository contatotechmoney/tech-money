import { Link } from "wouter";
import { ArrowRight, BarChart3, Building2, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";

function BrandMark({ slogan }: { slogan: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" aria-hidden="true">
        <div className="flex flex-col gap-1">
          <div className="h-7 w-7 bg-[#2a9d8f] flex items-center justify-center text-xs font-bold text-white">T</div>
          <div className="h-7 w-7 bg-[#2a9d8f] flex items-center justify-center text-xs font-bold text-white">T</div>
        </div>
        <div className="flex flex-col gap-1 mt-3.5">
          <div className="h-7 w-7 bg-[#264653] flex items-center justify-center text-xs font-bold text-white">M</div>
          <div className="h-7 w-7 bg-[#2a9d8f] flex items-center justify-center text-xs font-bold text-white">R</div>
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold tracking-tight text-foreground">Tech Money®</div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-primary font-medium">{slogan}</div>
      </div>
    </div>
  );
}

export default function AreaSelection() {
  const { t } = useLanguage();

  const areas = [
    {
      href: "/dashboard",
      icon: Building2,
      eyebrow: t("financialArea"),
      title: t("companyManagementTitle"),
      description: t("companyManagementDescription"),
      features: t("companyManagementFeatures"),
      accent: "bg-primary",
      iconBackground: "bg-primary/10 text-primary",
    },
    {
      href: "/investments/agents",
      icon: TrendingUp,
      eyebrow: t("investmentArea"),
      title: t("investmentManagementTitle"),
      description: t("investmentManagementDescription"),
      features: t("investmentManagementFeatures"),
      accent: "bg-[#1b4d3e]",
      iconBackground: "bg-[#1b4d3e]/10 text-[#1b4d3e]",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 md:px-10 md:py-12">
        <header className="flex items-center justify-between">
          <BrandMark slogan={t("transformingResults")} />
          <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("areasTitle")}
          </div>
        </header>

        <section className="flex flex-1 flex-col justify-center py-14">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-primary">
              Tech Money®
            </p>
            <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{t("areasTitle")}</h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
              {t("areasDescription")}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {areas.map((area) => (
              <Link key={area.href} href={area.href} className="group">
                <Card className="relative h-full overflow-hidden border-border/80 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl">
                  <div className={`absolute inset-x-0 top-0 h-1.5 ${area.accent}`} />
                  <CardContent className="flex h-full min-h-[290px] flex-col p-7 md:p-9">
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${area.iconBackground}`}>
                        <area.icon className="h-7 w-7" />
                      </div>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-all group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                    <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{area.eyebrow}</p>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{area.title}</h2>
                    <p className="mt-3 flex-1 text-muted-foreground">{area.description}</p>
                    <div className="mt-6 flex items-center gap-2 border-t border-border pt-5 text-sm font-medium text-foreground">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      {area.features}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <footer className="text-center text-xs text-muted-foreground">
          © 2025 Tech Money. {t("allRightsReserved")}
        </footer>
      </div>
    </main>
  );
}