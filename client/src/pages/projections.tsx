import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar
} from "recharts";
import { Sparkles, TrendingUp, AlertTriangle, Zap } from "lucide-react";
import { Link } from "wouter";

const projectionData = [
  { month: 'Jan', current: 150000, conservative: 150000, optimistic: 150000, ai: 150000 },
  { month: 'Fev', current: 155000, conservative: 152000, optimistic: 160000, ai: 157500 },
  { month: 'Mar', current: 160000, conservative: 153000, optimistic: 172000, ai: 165200 },
  { month: 'Abr', current: 165000, conservative: 154000, optimistic: 185000, ai: 173100 },
  { month: 'Mai', current: 171000, conservative: 155000, optimistic: 200000, ai: 181600 },
  { month: 'Jun', current: 177000, conservative: 156000, optimistic: 218000, ai: 190900 },
];

const accountProjections = [
  {
    account: "Receita Bruta",
    current: 150000,
    q1: 465000,
    q2: 513000,
    q3: 565000,
    q4: 623000,
    confidence: 94,
    trend: "up"
  },
  {
    account: "Custos Variáveis",
    current: 60000,
    q1: 186000,
    q2: 205000,
    q3: 226000,
    q4: 249000,
    confidence: 91,
    trend: "up"
  },
  {
    account: "Despesas Operacionais",
    current: 30000,
    q1: 90000,
    q2: 94000,
    q3: 98000,
    q4: 102000,
    confidence: 87,
    trend: "up"
  },
  {
    account: "Lucro Líquido",
    current: 40000,
    q1: 123000,
    q2: 141000,
    q3: 162000,
    q4: 187000,
    confidence: 89,
    trend: "up"
  },
];

export default function Projections() {
  const { t } = useLanguage();
  const [growthRate, setGrowthRate] = useState([15]);
  const [scenario, setScenario] = useState("ai");

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold font-heading">{t("projectionsScenarios")}</h1>
            <Badge className="flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200">
              <Sparkles className="h-3 w-3" />
              {t("aiPowered")}
            </Badge>
          </div>
          <p className="text-muted-foreground">{t("predictiveAnalysis")}</p>
        </div>
        <Link href="/reports/1">
          <Button variant="outline">{t("back")} {t("reports")}</Button>
        </Link>
      </div>

      <Alert className="bg-blue-50 border-blue-200">
        <Zap className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-900">
          {t("machineLearningSolution")}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t("growthScenario")}</CardTitle>
          <CardDescription>{t("adjustGrowthRate")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("monthlyGrowthRate")}</span>
              <span className="text-2xl font-bold text-primary">{growthRate[0]}%</span>
            </div>
            <Slider 
              value={growthRate} 
              onValueChange={setGrowthRate} 
              min={-10}
              max={50}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-10%</span>
              <span>0%</span>
              <span>+50%</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 bg-muted/50 border-0">
              <div className="text-xs text-muted-foreground mb-1">Cenário Base (Histórico)</div>
              <div className="text-sm font-semibold">-5% a +5%</div>
            </Card>
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <div className="text-xs text-yellow-900 font-medium mb-1">Cenário Conservador</div>
              <div className="text-sm font-semibold text-yellow-900">+3% a +8%</div>
            </Card>
            <Card className="p-4 bg-blue-50 border-blue-200 ring-2 ring-blue-300">
              <div className="text-xs text-blue-900 font-medium mb-1">🤖 Cenário IA (Recomendado)</div>
              <div className="text-sm font-semibold text-blue-900">{growthRate[0]}%</div>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue">Receita</TabsTrigger>
          <TabsTrigger value="costs">Custos</TabsTrigger>
          <TabsTrigger value="profit">Lucro</TabsTrigger>
          <TabsTrigger value="accounts">Todas as Contas</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Projeção de Receita Bruta</CardTitle>
              <CardDescription>Próximos 12 meses com intervalo de confiança.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} />
                    <YAxis stroke="#888888" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      formatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`}
                    />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="conservative" 
                      stroke="#94a3b8" 
                      strokeWidth={2}
                      fill="none" 
                      strokeDasharray="5 5"
                      name="Cenário Conservador"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="ai" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorAI)"
                      name="Projeção IA"
                    />
                    <Area 
                      type="monotone" 
                      dataKey="optimistic" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      fill="none"
                      strokeDasharray="5 5"
                      name="Cenário Otimista"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="costs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Projeção de Custos Variáveis</CardTitle>
              <CardDescription>Evolução estimada com base na receita projetada.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projectionData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} />
                    <YAxis stroke="#888888" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      formatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="current" stroke="#ef4444" strokeWidth={2} name="Histórico" />
                    <Line type="monotone" dataKey="ai" stroke="#3b82f6" strokeWidth={3} name="Projeção IA" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Projeção de Lucro Líquido</CardTitle>
              <CardDescription>Resultado final esperado nos próximos trimestres.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={projectionData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} />
                    <YAxis stroke="#888888" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                      formatter={(value) => `R$ ${value.toLocaleString('pt-BR')}`}
                    />
                    <Legend />
                    <Bar dataKey="current" fill="#f3f4f6" name="Histórico" />
                    <Line type="monotone" dataKey="ai" stroke="#10b981" strokeWidth={3} name="Projeção IA" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="space-y-4">
          <div className="grid gap-4">
            {accountProjections.map((item, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{item.account}</CardTitle>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        {item.trend === 'up' ? '+' : '-'}{Math.abs(Math.round(((item.q4 - item.current) / item.current) * 100))}%
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Confiança:</span>
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
                          style={{ width: `${item.confidence}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-blue-600">{item.confidence}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2 text-sm">
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Atual</div>
                      <div className="font-bold">R$ {(item.current / 1000).toFixed(0)}k</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Q1</div>
                      <div className="font-bold">R$ {(item.q1 / 1000).toFixed(0)}k</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Q2</div>
                      <div className="font-bold">R$ {(item.q2 / 1000).toFixed(0)}k</div>
                    </div>
                    <div className="bg-muted/50 p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Q3</div>
                      <div className="font-bold">R$ {(item.q3 / 1000).toFixed(0)}k</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                      <div className="text-xs text-blue-900 font-medium mb-1">Q4 (IA)</div>
                      <div className="font-bold text-blue-900">R$ {(item.q4 / 1000).toFixed(0)}k</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Alert className="bg-green-50 border-green-200">
        <AlertTriangle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-900">
          <strong>Insight IA:</strong> Seus dados indicam crescimento consistente. Recomendamos aumentar investimento em marketing para aproveitar a tendência positiva.
        </AlertDescription>
      </Alert>
    </div>
  );
}
