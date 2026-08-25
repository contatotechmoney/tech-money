import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations } from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
  formatCurrency: (value: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    // Get from localStorage or default to pt
    const saved = localStorage.getItem('language') as Language | null;
    return saved || 'pt';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    let text: string = translations[language]?.[key as keyof typeof translations['pt']] || key;
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        text = text.replace(`{{${key}}}`, value);
      });
    }
    
    return text;
  };

  const formatCurrency = (value: number): string => {
    if (language === 'pt') {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } else if (language === 'es') {
      const valInUSD = value / 5;
      // Spain format uses 1.234,56 € style
      return valInUSD.toLocaleString('es-ES', { style: 'currency', currency: 'USD' });
    } else {
      const valInUSD = value / 5;
      return valInUSD.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, formatCurrency }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
