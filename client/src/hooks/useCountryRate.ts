import { useState, useEffect } from "react";

export interface CountryRateData {
  country: string;
  countryCode: string;
  rate: number;
  inflation: number;
  currency: string;
  lastUpdated: string;
}

// Mock data for interest rates and inflation by country
const RATES_BY_COUNTRY: Record<string, { rate: number; inflation: number; currency: string }> = {
  BR: { rate: 11.25, inflation: 4.6, currency: "BRL" },    // Brazil - Updated
  US: { rate: 5.33, inflation: 3.2, currency: "USD" },    // USA
  ES: { rate: 4.25, inflation: 3.4, currency: "EUR" },    // Spain
  MX: { rate: 11.25, inflation: 4.8, currency: "MXN" },   // Mexico
  AR: { rate: 40.0, inflation: 250.0, currency: "ARS" },  // Argentina
  CO: { rate: 12.25, inflation: 7.2, currency: "COP" },   // Colombia
  CL: { rate: 10.25, inflation: 3.8, currency: "CLP" },   // Chile
  PE: { rate: 9.25, inflation: 3.0, currency: "PEN" },    // Peru
  GB: { rate: 5.25, inflation: 3.4, currency: "GBP" },    // UK
  DE: { rate: 4.25, inflation: 2.4, currency: "EUR" },    // Germany
  FR: { rate: 4.25, inflation: 2.2, currency: "EUR" },    // France
  IT: { rate: 4.25, inflation: 1.3, currency: "EUR" },    // Italy
  CA: { rate: 5.0, inflation: 2.9, currency: "CAD" },     // Canada
  AU: { rate: 4.35, inflation: 3.6, currency: "AUD" },    // Australia
  JP: { rate: 0.5, inflation: 2.8, currency: "JPY" },     // Japan
};

export function useCountryRate(): CountryRateData | null {
  const [rateData, setRateData] = useState<CountryRateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCountryAndRate = async () => {
      try {
        // Try to get location from IP
        // Using ipapi.co which is free and requires no API key
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        
        const countryCode = data.country_code || "BR";
        const countryName = data.country_name || "Brazil";
        
        const rateInfo = RATES_BY_COUNTRY[countryCode] || {
          rate: RATES_BY_COUNTRY["BR"].rate,
          inflation: RATES_BY_COUNTRY["BR"].inflation,
          currency: RATES_BY_COUNTRY["BR"].currency,
        };

        setRateData({
          country: countryName,
          countryCode,
          rate: rateInfo.rate,
          inflation: rateInfo.inflation,
          currency: rateInfo.currency,
          lastUpdated: new Date().toLocaleDateString(),
        });
      } catch (error) {
        // Fallback to Brazil
        console.log("Could not fetch location, using Brazil as default");
        setRateData({
          country: "Brazil",
          countryCode: "BR",
          rate: 10.5,
          inflation: 4.5,
          currency: "BRL",
          lastUpdated: new Date().toLocaleDateString(),
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCountryAndRate();
  }, []);

  return isLoading ? null : rateData;
}
