import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from "recharts";
import { TrendingUp, TrendingDown, AlertCircle, CheckCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const verticalAnalysis = [
  { account: "Receita Bruta", "2024": 100, "2023": 100 },
  { account: "Custos", "2024": 40, "2023": 42 },
  { account: "Lucro Bruto", "2024": 60, "2023": 58 },
  { account: "Despesas Op.", "2024": 20, "2023": 22 },
  { account: "EBITDA", "2024": 40, "2023": 36 },
  { account: "Lucro Líquido", "2024": 27, "2023": 22 },
];

const ratios = [
  { name: "Liquidez Geral", value: 2.1, benchmark: 1.5, status: "Excelente" },
  { name: "Rentabilidade (ROE)", value: 18.5, benchmark: 15, status: "Acima" },
  { name: "Endividamento", value: 0.45, benchmark: 0.6, status: "Saudável" },
  { name: "Margem Operacional", value: 30, benchmark: 25, status: "Acima" },
];

const radarData = [
  { metric: "Rentabilidade", value: 78 },
  { metric: "Liquidez", value: 85 },
  { metric: "Solvência", value: 72 },
  { metric: "Eficiência", value: 88 },
  { metric: "Crescimento", value: 82 },
  { metric: "Saúde Fiscal", value: 90 },
];

const benchmarking = [
  { company: "Sua Empresa", profitMargin: 27, roa: 18.5, assetTurnover: 2.1 },
  { company: "Concorrente A", profitMargin: 22, roa: 14, assetTurnover: 1.8 },
  { company: "Concorrente B", profitMargin: 19, roa: 11, assetTurnover: 1.5 },
  { company: "Média Setor", profitMargin: 20, roa: 12.5, assetTurnover: 1.7 },
];

export default function Analysis() {
  const { t } = useLanguage();
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading mb-2">{t("financialAnalysis")}</h1>
          <p className="text-muted-foreground">{t("indices")}</p>
        </div>
        <Link href="/reports/1">
          <Button variant="outline">{t("back")} {t("reports")}</Button>
        </Link>
      </div>

      <Tabs defaultValue="vertical" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vertical">{t("verticalAnalysis")}</TabsTrigger>
          <TabsTrigger value="horizontal">{t("horizontalAnalysis")}</TabsTrigger>
          <TabsTrigger value="ratios">{t("financialIndices")}</TabsTrigger>
          <TabsTrigger value="benchmark">{t("benchmarking")}</TabsTrigger>
          <TabsTrigger value="health">{t("healthScore")}</TabsTrigger>
        </TabsList>

        <TabsContent value="vertical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("verticalAnalysis")} - Comparativo DRE</CardTitle>
              <CardDescription>{t("percentageOfRevenue")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={verticalAnalysis} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="account" type="category" width={120} fontSize={12} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Legend />
                    <Bar dataKey="2024" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="2023" fill="hsl(var(--muted))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="horizontal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Análise Horizontal - Evolução Trimestral</CardTitle>
              <CardDescription>Variação percentual de período para período.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { account: "Receita Bruta", q1: 0, q2: 8.3, q3: 16.7, q4: 25.0, avg: 12.5 },
                { account: "CMV", q1: 0, q2: 8.3, q3: 18.3, q4: 30.0, avg: 14.2 },
                { account: "Lucro Bruto", q1: 0, q2: 8.2, q3: 14.9, q4: 22.5, avg: 11.4 },
                { account: "Despesas Op.", q1: 0, q2: 3.5, q3: 7.2, q4: 11.5, avg: 5.5 },
                { account: "Lucro Líquido", q1: 0, q2: 12.5, q3: 26.9, q4: 50.0, avg: 22.4 },
              ].map((item, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{item.account}</h4>
                    <Badge variant={item.avg > 15 ? "default" : "secondary"}>
                      {item.avg > 0 ? "+" : ""}{item.avg.toFixed(1)}% (média)
                    </Badge>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-sm">
                    {[
                      { label: "Q1", value: item.q1 },
                      { label: "Q2", value: item.q2 },
                      { label: "Q3", value: item.q3 },
                      { label: "Q4", value: item.q4 },
                    ].map((q) => (
                      <div key={q.label} className="bg-muted/50 p-2 rounded text-center">
                        <div className="text-xs text-muted-foreground">{q.label}</div>
                        <div className={`font-bold ${q.value > 0 ? 'text-green-600' : ''}`}>
                          {q.value > 0 ? "+" : ""}{q.value.toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ratios" className="space-y-4">
          <div className="grid gap-4">
            {ratios.map((ratio, i) => (
              <Card key={i} className={ratio.value > ratio.benchmark ? "border-l-4 border-l-green-500" : "border-l-4 border-l-yellow-500"}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{ratio.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Benchmark do Setor: {ratio.benchmark}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary">{ratio.value.toFixed(2)}</div>
                      <Badge className={ratio.value > ratio.benchmark ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"}>
                        {ratio.value > ratio.benchmark ? (
                          <>
                            <TrendingUp className="h-3 w-3 mr-1" />
                            Acima do Benchmark
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Abaixo do Benchmark
                          </>
                        )}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="benchmark" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Comparativo com Concorrentes</CardTitle>
              <CardDescription>Sua posição competitiva no mercado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      type="number" 
                      dataKey="roa" 
                      name="ROA (%)" 
                      label={{ value: 'ROA (%)', position: 'insideBottomRight', offset: -10 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="profitMargin" 
                      name="Margem de Lucro (%)"
                      label={{ value: 'Margem Lucro (%)', angle: 90, position: 'insideLeft' }}
                    />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter name="Sua Empresa" data={[benchmarking[0]]} fill="hsl(var(--primary))" />
                    <Scatter name="Concorrentes" data={benchmarking.slice(1)} fill="hsl(var(--muted))" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                Score de Saúde Financeira
              </CardTitle>
              <CardDescription>Avaliação multidimensional da sua saúde financeira.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" />
                    <PolarRadiusAxis />
                    <Radar name="Seu Score" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-900">Pontos Fortes</span>
                  </div>
                  <ul className="text-sm text-green-800 space-y-1">
                    <li>✓ Liquidez excelente</li>
                    <li>✓ ROE acima da média</li>
                    <li>✓ Endividamento saudável</li>
                  </ul>
                </Card>
                <Card className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50 border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <span className="font-medium text-yellow-900">Oportunidades</span>
                  </div>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    <li>⚠ Aumentar eficiência operacional</li>
                    <li>⚠ Revisar política de estoque</li>
                    <li>⚠ Otimizar capex</li>
                  </ul>
                </Card>
              </div>

              <Card className="p-4 bg-blue-50 border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  Score Geral
                </h4>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-blue-600">82/100</div>
                  <div className="flex-1">
                    <div className="h-3 bg-blue-200 rounded-full overflow-hidden">
                      <div className="h-full w-4/5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full" />
                    </div>
                    <p className="text-xs text-blue-700 mt-2">Sua empresa está em boa situação financeira</p>
                  </div>
                </div>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
