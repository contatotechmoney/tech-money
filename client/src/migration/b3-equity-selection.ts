export const b3EquityPath = "/investments/acoes";
export const equityConfirmationPath = "/investments/acoes/confirmar";
export const b3EquityReference = {
  date: "08/09/2026",
  url: "https://sistemasweb.b3.com.br/PlantaoNoticias/Noticias/Detail?agencia=15&dataNoticia=2026-09-08+06%3A07%3A58&idNoticia=3474865",
};

export type ListedEquity = { ticker: string; name: string };

// Initial product selection checked against the B3 notice cited above.
export const listedEquities: readonly ListedEquity[] = [
  { ticker: "ABEV3", name: "Ambev" },
  { ticker: "B3SA3", name: "B3" },
  { ticker: "BBAS3", name: "Banco do Brasil" },
  { ticker: "BBSE3", name: "BB Seguridade" },
  { ticker: "CPLE3", name: "Copel" },
  { ticker: "ITUB4", name: "Itaú Unibanco" },
  { ticker: "PETR4", name: "Petrobras" },
  { ticker: "RADL3", name: "Raia Drogasil" },
  { ticker: "SUZB3", name: "Suzano" },
  { ticker: "TOTS3", name: "TOTVS" },
  { ticker: "VALE3", name: "Vale" },
  { ticker: "VIVT3", name: "Telefônica Brasil" },
  { ticker: "WEGE3", name: "WEG" },
];

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function searchListedEquities(query: string) {
  const term = normalize(query);
  return listedEquities.filter(asset => normalize(asset.name).includes(term) || normalize(asset.ticker).includes(term));
}
