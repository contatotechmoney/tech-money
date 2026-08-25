import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Download, 
  Share2, 
  Printer, 
  ArrowLeft, 
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Sparkles,
  Zap
} from "lucide-react";
import { Link } from "wouter";
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
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line
} from "recharts";

const dataDRE = [
  { category: "Receita Bruta", value: 150000, previous: 130000 },
  { category: "Impostos", value: -15000, previous: -13000 },
  { category: "Receita Líquida", value: 135000, previous: 117000 },
  { category: "CMV", value: -60000, previous: -55000 },
  { category: "Lucro Bruto", value: 75000, previous: 62000 },
  { category: "Despesas Op.", value: -30000, previous: -28000 },
  { category: "EBITDA", value: 45000, previous: 34000 },
  { category: "Depreciação", value: -5000, previous: -5000 },
  { category: "Lucro Líquido", value: 40000, previous: 29000 },
];

const expenseData = [
  { name: 'Pessoal', value: 45 },
  { name: 'Marketing', value: 20 },
  { name: 'Tecnologia', value: 15 },
  { name: 'Administrativo', value: 10 },
  { name: 'Outros', value: 10 },
];

const COLORS = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ef4444'];

export default function Report() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold font-heading">{t("annualReport")}</h1>
            <p className="text-sm text-muted-foreground">{t("generatedOn")} 18 Dec 2024 • {t("basedOn")} DRE_2024_Final.xlsx</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Printer className="mr-2 h-4 w-4" />
            {t("print")}
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" />
            {t("share")}
          </Button>
          <Button size="sm">
            <Download className="mr-2 h-4 w-4" />
            {t("exportPDF")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary text-primary-foreground border-none shadow-lg shadow-primary/20">
          <CardHeader className="pb-2">
            <CardDescription className="text-primary-foreground/80">{t("netProfit")}</CardDescription>
            <CardTitle className="text-3xl font-bold">R$ 40.000,00</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm bg-white/20 w-fit px-2 py-1 rounded">
              <TrendingUp className="mr-1 h-3 w-3" />
              +37.9% {t("vsYearBefore")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("contributionMargin")}</CardDescription>
            <CardTitle className="text-3xl font-bold">50%</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-emerald-600">
              <TrendingUp className="mr-1 h-3 w-3" />
              +2.3% vs meta
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("ebitda")}</CardDescription>
            <CardTitle className="text-3xl font-bold">R$ 45.000,00</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-emerald-600">
              <TrendingUp className="mr-1 h-3 w-3" />
              +32.3% {t("vsYearBefore")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="analysis">
            <Sparkles className="h-4 w-4 mr-2" />
            {t("advancedAnalysis")}
          </TabsTrigger>
          <TabsTrigger value="projections">
            <Zap className="h-4 w-4 mr-2" />
            {t("aiProjections")}
          </TabsTrigger>
          <TabsTrigger value="recommendations">{t("aiRecommendations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>{t("cascataResults")}</CardTitle>
                <CardDescription>{t("percentageOfRevenue")}</CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dataDRE} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="category" type="category" width={100} tick={{ fontSize: 11 }} interval={0} />
                      <Tooltip 
                        cursor={{fill: 'transparent'}}
                        contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {dataDRE.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.value > 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>{t("expenseComposition")}</CardTitle>
                <CardDescription>Distribuição por centro de custo.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {expenseData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("detailedStatement")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dataDRE.map((item, i) => (
                  <div key={i} className={`flex items-center justify-between py-2 border-b border-border ${item.category === 'Lucro Líquido' || item.category === 'EBITDA' ? 'font-bold bg-muted/30 px-2 -mx-2' : ''}`}>
                    <span>{item.category}</span>
                    <div className="flex gap-8">
                      <span className="text-muted-foreground w-24 text-right">{((item.value / 150000) * 100).toFixed(1)}%</span>
                      <span className={`w-32 text-right ${item.value < 0 ? 'text-destructive' : ''}`}>
                        R$ {Math.abs(item.value).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <div className="flex gap-2 mb-4">
            <Badge className="flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200">
              <Sparkles className="h-3 w-3" />
              Análise Avançada
            </Badge>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Acesse Análises Detalhadas</CardTitle>
              <CardDescription>Confira índices financeiros, benchmarking e score de saúde.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/analysis">
                <Button className="w-full">
                  <Sparkles className="mr-2 h-4 w-4" />
                  Abrir Análise Profunda
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="projections" className="space-y-4">
          <div className="flex gap-2 mb-4">
            <Badge className="flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200">
              <Zap className="h-3 w-3" />
              Machine Learning
            </Badge>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Projeções Inteligentes</CardTitle>
              <CardDescription>Veja as previsões IA de receita, custos e lucro para os próximos 12 meses.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/projections">
                <Button className="w-full">
                  <Zap className="mr-2 h-4 w-4" />
                  Visualizar Projeções
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <CardTitle>Atenção: Aumento no CMV</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                O Custo da Mercadoria Vendida (CMV) aumentou 5% em relação ao período anterior, impactando sua margem bruta.
                Recomendamos revisar negociações com fornecedores ou ajustar precificação.
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-500" />
                <CardTitle>Oportunidade: Margem Operacional</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Sua eficiência operacional melhorou. O EBITDA cresceu 32.3%, indicando que as despesas operacionais estão bem controladas em relação ao crescimento da receita.
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-green-500" />
                <CardTitle>Insight IA: Potencial de Crescimento</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Baseado em análise de dados históricos e padrões do setor, identificamos que sua empresa tem 23% de potencial para aumentar a margem líquida através de otimização de custos operacionais.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
