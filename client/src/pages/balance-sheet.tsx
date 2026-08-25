import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, 
  Trash2, 
  Save, 
  Download, 
  AlertCircle,
  BarChart3,
  TrendingUp
} from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface BalanceItem {
  id: string;
  name: string;
  value: number;
}

interface BalanceSheetState {
  activeCurrent: BalanceItem[];
  activeNonCurrent: BalanceItem[];
  liabilitiesCurrent: BalanceItem[];
  liabilitiesNonCurrent: BalanceItem[];
  equity: BalanceItem[];
}

export default function BalanceSheet() {
  const { t } = useLanguage();
  const [balance, setBalance] = useState<BalanceSheetState>({
    activeCurrent: [
      { id: "1", name: "Caixa", value: 50000 },
      { id: "2", name: "Banco", value: 100000 },
    ],
    activeNonCurrent: [
      { id: "3", name: "Imóvel", value: 300000 },
    ],
    liabilitiesCurrent: [
      { id: "4", name: "Fornecedores", value: 80000 },
    ],
    liabilitiesNonCurrent: [
      { id: "5", name: "Empréstimo Longo Prazo", value: 150000 },
    ],
    equity: [
      { id: "6", name: "Capital Social", value: 220000 },
    ],
  });

  const [activeTab, setActiveTab] = useState("assets");

  const addItem = (section: keyof BalanceSheetState) => {
    const newId = Date.now().toString();
    setBalance(prev => ({
      ...prev,
      [section]: [...prev[section], { id: newId, name: "Nova Conta", value: 0 }]
    }));
  };

  const removeItem = (section: keyof BalanceSheetState, id: string) => {
    setBalance(prev => ({
      ...prev,
      [section]: prev[section].filter(item => item.id !== id)
    }));
  };

  const updateItem = (section: keyof BalanceSheetState, id: string, field: "name" | "value", value: any) => {
    setBalance(prev => ({
      ...prev,
      [section]: prev[section].map(item =>
        item.id === id ? { ...item, [field]: field === "value" ? parseFloat(value) || 0 : value } : item
      )
    }));
  };

  const totalActiveCurrent = balance.activeCurrent.reduce((sum, item) => sum + item.value, 0);
  const totalActiveNonCurrent = balance.activeNonCurrent.reduce((sum, item) => sum + item.value, 0);
  const totalAssets = totalActiveCurrent + totalActiveNonCurrent;

  const totalLiabilitiesCurrent = balance.liabilitiesCurrent.reduce((sum, item) => sum + item.value, 0);
  const totalLiabilitiesNonCurrent = balance.liabilitiesNonCurrent.reduce((sum, item) => sum + item.value, 0);
  const totalLiabilities = totalLiabilitiesCurrent + totalLiabilitiesNonCurrent;

  const totalEquity = balance.equity.reduce((sum, item) => sum + item.value, 0);

  const balanceTotal = totalAssets - totalLiabilities - totalEquity;
  const isBalanced = Math.abs(balanceTotal) < 0.01;

  const BalanceItemRow = ({ 
    item, 
    section, 
    onUpdate, 
    onRemove 
  }: {
    item: BalanceItem;
    section: keyof BalanceSheetState;
    onUpdate: (id: string, field: "name" | "value", value: any) => void;
    onRemove: (id: string) => void;
  }) => (
    <div className="flex gap-3 items-end pb-3 border-b border-border last:border-0">
      <div className="flex-1">
        <Label className="text-xs text-muted-foreground mb-1 block">Descrição</Label>
        <Input 
          placeholder="Ex: Caixa, Banco, Imóvel"
          value={item.name}
          onChange={(e) => onUpdate(item.id, "name", e.target.value)}
          className="text-sm"
        />
      </div>
      <div className="w-32">
        <Label className="text-xs text-muted-foreground mb-1 block">Valor (R$)</Label>
        <Input 
          placeholder="0,00"
          type="number"
          value={item.value || ""}
          onChange={(e) => onUpdate(item.id, "value", e.target.value)}
          className="text-sm"
        />
      </div>
      <Button 
        variant="ghost" 
        size="icon"
        onClick={() => onRemove(item.id)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-3xl font-bold font-heading">{t("balanceSheetBuilder")}</h1>
            <Badge variant="outline" className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              {t("forSMEs")}
            </Badge>
          </div>
          <p className="text-muted-foreground">{t("createBalanceSheet")}</p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline">{t("back")}</Button>
        </Link>
      </div>

      {!isBalanced && (
        <Alert className="bg-red-50 border-red-200">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-900">
            {t("balanceUnbalanced")} <strong>R$ {Math.abs(balanceTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-900">{t("totalAssets")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">
              R$ {totalAssets.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-900">{t("totalLiabilities")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-700">
              R$ {totalLiabilities.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-900">{t("equityTotal")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              R$ {totalEquity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="assets" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="assets">Ativos</TabsTrigger>
          <TabsTrigger value="liabilities">Passivos</TabsTrigger>
          <TabsTrigger value="equity">Patrimônio</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ativo Circulante</CardTitle>
              <CardDescription>Bens e direitos conversíveis em até 12 meses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {balance.activeCurrent.map(item => (
                  <BalanceItemRow
                    key={item.id}
                    item={item}
                    section="activeCurrent"
                    onUpdate={(id, field, value) => updateItem("activeCurrent", id, field, value)}
                    onRemove={(id) => removeItem("activeCurrent", id)}
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => addItem("activeCurrent")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Conta
              </Button>
              <div className="bg-muted/50 p-3 rounded text-sm font-medium">
                Subtotal: R$ {totalActiveCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ativo Não-Circulante</CardTitle>
              <CardDescription>Bens e direitos com realização superior a 12 meses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {balance.activeNonCurrent.map(item => (
                  <BalanceItemRow
                    key={item.id}
                    item={item}
                    section="activeNonCurrent"
                    onUpdate={(id, field, value) => updateItem("activeNonCurrent", id, field, value)}
                    onRemove={(id) => removeItem("activeNonCurrent", id)}
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => addItem("activeNonCurrent")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Conta
              </Button>
              <div className="bg-muted/50 p-3 rounded text-sm font-medium">
                Subtotal: R$ {totalActiveNonCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="liabilities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Passivo Circulante</CardTitle>
              <CardDescription>Obrigações vencíveis em até 12 meses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {balance.liabilitiesCurrent.map(item => (
                  <BalanceItemRow
                    key={item.id}
                    item={item}
                    section="liabilitiesCurrent"
                    onUpdate={(id, field, value) => updateItem("liabilitiesCurrent", id, field, value)}
                    onRemove={(id) => removeItem("liabilitiesCurrent", id)}
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => addItem("liabilitiesCurrent")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Conta
              </Button>
              <div className="bg-muted/50 p-3 rounded text-sm font-medium">
                Subtotal: R$ {totalLiabilitiesCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Passivo Não-Circulante</CardTitle>
              <CardDescription>Obrigações vencíveis após 12 meses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {balance.liabilitiesNonCurrent.map(item => (
                  <BalanceItemRow
                    key={item.id}
                    item={item}
                    section="liabilitiesNonCurrent"
                    onUpdate={(id, field, value) => updateItem("liabilitiesNonCurrent", id, field, value)}
                    onRemove={(id) => removeItem("liabilitiesNonCurrent", id)}
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => addItem("liabilitiesNonCurrent")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Conta
              </Button>
              <div className="bg-muted/50 p-3 rounded text-sm font-medium">
                Subtotal: R$ {totalLiabilitiesNonCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Patrimônio Líquido</CardTitle>
              <CardDescription>Recursos próprios da empresa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {balance.equity.map(item => (
                  <BalanceItemRow
                    key={item.id}
                    item={item}
                    section="equity"
                    onUpdate={(id, field, value) => updateItem("equity", id, field, value)}
                    onRemove={(id) => removeItem("equity", id)}
                  />
                ))}
              </div>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => addItem("equity")}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Conta
              </Button>
              <div className="bg-muted/50 p-3 rounded text-sm font-medium">
                Subtotal: R$ {totalEquity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-2 border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Resumo do Balanço
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4 pb-4 border-b border-border">
            <div>
              <div className="text-xs text-muted-foreground">Ativo Total</div>
              <div className="text-lg font-bold text-primary">
                R$ {totalAssets.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Passivo Total</div>
              <div className="text-lg font-bold text-orange-600">
                R$ {totalLiabilities.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Patrimônio Líquido</div>
              <div className="text-lg font-bold text-green-600">
                R$ {totalEquity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          
          <div className={`p-4 rounded-lg ${isBalanced ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`text-sm font-medium ${isBalanced ? 'text-green-900' : 'text-red-900'}`}>
              {isBalanced ? "✓ Balanço Equilibrado" : "✗ Balanço Desbalanceado"}
            </p>
            <p className={`text-xs ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
              Ativo = Passivo + PL
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={!isBalanced}>
              <Save className="mr-2 h-4 w-4" />
              Salvar Balanço
            </Button>
            <Button variant="outline" className="flex-1">
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
