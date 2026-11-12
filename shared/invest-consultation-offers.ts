export const consultationOffers = [
  { id: "avulso", name: "Pacote avulso", sampleCredits: 100, price: 2990, period: "pagamento único" },
  { id: "essencial", name: "Essencial", sampleCredits: 400, price: 10990, period: "por mês" },
  { id: "avancado", name: "Avançado", sampleCredits: 1000, price: 24990, period: "por mês" },
] as const;

export type ConsultationOffer = (typeof consultationOffers)[number];
export const consultationCurrency = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
