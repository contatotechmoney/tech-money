import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity, 
  ArrowRight, 
  FileText, 
  Clock,
  Scale,
  Percent
} from "lucide-react";
import { Link } from "wouter";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCountryRate } from "@/hooks/useCountryRate";
import { Badge } from "@/components/ui/badge";

const data = [
  { name: 'Jan', revenue: 4000, expenses: 2400 },
  { name: 'Fev', revenue: 3000, expenses: 1398 },
  { name: 'Mar', revenue: 2000, expenses: 9800 },
  { name: 'Abr', revenue: 2780, expenses: 3908 },
  { name: 'Mai', revenue: 1890, expenses: 4800 },
  { name: 'Jun', revenue: 2390, expenses: 3800 },
  { name: 'Jul', revenue: 3490, expenses: 4300 },
];

export default function Dashboard() {
  const { t } = useLanguage();
  const countryRate = useCountryRate();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-heading">{t("dashboardTitle")}</h1>
          <p className="text-muted-foreground mt-1">{t("overviewDescription")}</p>
        </div>
        <div className="flex gap-3 flex-wrap justify-end items-center">
          {countryRate && (
            <div className="flex gap-2 mr-2">
              <Badge variant="outline" className="flex items-center gap-1 bg-background shadow-sm border-emerald-200 text-emerald-800">
                <Percent className="h-3 w-3" />
                {t("interestRate")}: <span className="font-bold">{countryRate.rate}%</span>
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1 bg-background shadow-sm border-orange-200 text-orange-800">
                <TrendingUp className="h-3 w-3" />
                {t("inflationRate")}: <span className="font-bold">{countryRate.inflation}%</span>
              </Badge>
            </div>
          )}
          <Link href="/dre/new">
            <Button className="shadow-md bg-primary hover:bg-primary/90">
              <FileText className="mr-2 h-4 w-4" />
              {t("newDRE")}
            </Button>
          </Link>
          <Link href="/balance-sheet">
            <Button variant="outline">
              <Scale className="mr-2 h-4 w-4" />
              {t("buildBalance")}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("totalRevenue")}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">R$ 452.318,00</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500 font-medium inline-flex items-center">
                +20.1% <TrendingUp className="h-3 w-3 ml-1" />
              </span>{" "}
              {t("vsYearBefore")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("netMargin")}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24.5%</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-red-500 font-medium inline-flex items-center">
                -4.3% <TrendingDown className="h-3 w-3 ml-1" />
              </span>{" "}
              {t("vsLastMonth")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("generatedReports")}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground mt-1">
              +2 {t("newThisMonth")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm hover:shadow-md transition-shadow border-primary/20 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("availableCredits")}</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">12</div>
            <Link href="/credits">
              <Button variant="link" className="p-0 h-auto text-xs mt-1">
                {t("acquireMoreCredits")} <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle>{t("revenueEvolution")}</CardTitle>
            <CardDescription>{t("comparativeSemester")}</CardDescription>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `R$${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRevenue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 shadow-sm">
          <CardHeader>
            <CardTitle>Relatórios Recentes</CardTitle>
            <CardDescription>Seus últimos processamentos.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: "DRE Anual 2024", date: "Hoje, 14:30", type: "Anual", status: "Completo" },
                { name: "Trimestre Q3 2024", date: "Ontem, 09:15", type: "Trimestral", status: "Completo" },
                { name: "Análise Mensal Out", date: "15/12/2024", type: "Mensal", status: "Pendente" },
                { name: "Planejamento 2025", date: "10/12/2024", type: "Personalizado", status: "Completo" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border last:border-0 pb-4 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-1 rounded-full font-medium border
                      ${item.type === 'Anual' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                        item.type === 'Trimestral' ? 'bg-purple-50 text-purple-700 border-purple-200' : 
                        'bg-gray-50 text-gray-700 border-gray-200'
                      }`}>
                      {item.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
