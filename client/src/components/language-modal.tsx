import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe } from "lucide-react";

export function LanguageModal() {
  const { setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has already selected language on first visit
    const hasSelectedLanguage = localStorage.getItem("languageSelected");
    if (!hasSelectedLanguage) {
      setIsOpen(true);
    }
  }, []);

  const handleLanguageSelect = (lang: "pt" | "en" | "es") => {
    setLanguage(lang);
    localStorage.setItem("languageSelected", "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-300">
      <Card className="w-full max-w-md shadow-lg animate-in zoom-in-95 duration-300">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 bg-primary/10 text-primary rounded-full flex items-center justify-center">
              <Globe className="h-6 w-6" />
            </div>
          </div>
          <CardTitle className="text-2xl">{t("selectLanguage")}</CardTitle>
          <CardDescription>{t("choosePreferredLanguage")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button 
            onClick={() => handleLanguageSelect("pt")}
            variant="outline"
            className="w-full h-12 text-base font-medium"
          >
            🇧🇷 Português (Brasil)
          </Button>
          <Button 
            onClick={() => handleLanguageSelect("en")}
            variant="outline"
            className="w-full h-12 text-base font-medium"
          >
            🇺🇸 English (USA)
          </Button>
          <Button 
            onClick={() => handleLanguageSelect("es")}
            variant="outline"
            className="w-full h-12 text-base font-medium"
          >
            🇪🇸 Español (España)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
