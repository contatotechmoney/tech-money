import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UploadCloud, FileSpreadsheet, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function DREInput() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleProcess = () => {
    // Simulate processing time then redirect
    setTimeout(() => {
      setLocation("/reports/1");
    }, 1500);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-bold font-heading">{t("newAnalysisDRE")}</h1>
        <p className="text-muted-foreground">{t("importFinancialData")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("reportConfiguration")}</CardTitle>
          <CardDescription>{t("definePeriodAnalysis")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("periodType")}</Label>
              <Select defaultValue="monthly">
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("monthlyCredit")}</SelectItem>
                  <SelectItem value="quarterly">{t("quarterlyCredits")}</SelectItem>
                  <SelectItem value="semiannual">{t("semiannualCredits")}</SelectItem>
                  <SelectItem value="annual">{t("annualCredits")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("referenceMonth")}</Label>
              <Input type="month" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className={`border-2 border-dashed transition-all cursor-pointer relative overflow-hidden
          ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
          ${file ? 'bg-green-50/50 border-green-200' : ''}
        `}>
          <div 
            className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[250px]"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="space-y-4 animate-in zoom-in duration-300">
                <div className="h-16 w-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  Remover arquivo
                </Button>
              </div>
            ) : (
              <>
                <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-medium mb-1">{t("fileUpload")}</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-[200px]">
                  {t("dragDrop")}
                </p>
                <Button variant="outline" className="relative z-10">
                  {t("selectFile")}
                  <Input 
                    type="file" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={(e) => e.target.files && setFile(e.target.files[0])}
                    accept=".xlsx,.csv,.xls"
                  />
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("manualEntry")}</CardTitle>
            <CardDescription>{t("pasteDataDirectly")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("dreData")}</Label>
                <Textarea 
                  placeholder="Receita Bruta: 100000&#10;Impostos: 5000&#10;..." 
                  className="min-h-[150px] font-mono text-sm"
                />
              </div>
              <Button variant="secondary" className="w-full">
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {t("fillForm")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button size="lg" className="px-8 shadow-lg shadow-primary/20" disabled={!file} onClick={handleProcess}>
          {t("generateReport")}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
