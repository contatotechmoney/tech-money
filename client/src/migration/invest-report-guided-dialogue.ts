import type { ReportAgent, ReportSourceId } from "./invest-report-example";

export type DialogueTurn = {
  speaker: ReportAgent | "cliente";
  text: string;
  sources?: readonly ReportSourceId[];
};

type DialogueScene = {
  id: "divergencia" | "risco" | "revisao";
  label: string;
  turns: readonly DialogueTurn[];
};

export const reportGuidedDialogues = {
  HORIZ3: [
    {
      id: "divergencia",
      label: "Por que o comitê ficou dividido?",
      turns: [
        { speaker: "cliente", text: "A margem melhorou. Por que o comitê ficou dividido?" },
        { speaker: "rafael", text: "A melhora aparece nos pareceres. Vou chamar Carlos e Juliana para explicar onde as leituras divergem." },
        { speaker: "carlos", text: "O demonstrativo mostra margem maior e menos perdas na produção. A redução de perdas é a minha explicação mais provável.", sources: ["demonstrativo"] },
        { speaker: "juliana", text: "O comunicado aponta ganhos na fábrica. Para saber o que mais pesou, eu compararia os dados de produção com os de vendas.", sources: ["comunicado"] },
        { speaker: "rafael", text: "Os dois concordam sobre a melhora. Antes de concluir, quero separar o ganho da fábrica do efeito dos produtos vendidos.", sources: ["demonstrativo", "comunicado"] },
      ],
    },
    {
      id: "risco",
      label: "Qual risco merece atenção?",
      turns: [
        { speaker: "cliente", text: "Qual risco merece mais atenção?" },
        { speaker: "rafael", text: "O comunicado cita a dependência de poucos distribuidores. Vou pedir ao Marcos que explique por que isso importa.", sources: ["comunicado"] },
        { speaker: "marcos", text: "Se a empresa perder um distribuidor importante, o volume vendido pode cair. O comunicado ainda não diz quanto da receita depende deles.", sources: ["comunicado"] },
        { speaker: "rafael", text: "Por isso, eu pediria a receita por distribuidor e os prazos dos contratos antes de avaliar a gravidade do risco.", sources: ["comunicado"] },
      ],
    },
    {
      id: "revisao",
      label: "O que faria Rafael rever a conclusão?",
      turns: [
        { speaker: "cliente", text: "Rafael, o que faria você rever a conclusão?" },
        { speaker: "rafael", text: "Uma abertura da variação da margem que separe perdas, preços e composição das vendas. Se os dados mostrarem qual fator foi decisivo, eu reveria a conclusão.", sources: ["demonstrativo", "comunicado"] },
      ],
    },
  ],
  EXEMP3: [
    {
      id: "divergencia",
      label: "Por que o comitê ficou dividido?",
      turns: [
        { speaker: "cliente", text: "O resultado melhorou. Por que o comitê ficou dividido?" },
        { speaker: "rafael", text: "A melhora aparece nos pareceres. Vou chamar Carlos e Juliana para explicar a dúvida sobre a recorrência desse ganho." },
        { speaker: "carlos", text: "O demonstrativo registra uma melhora operacional. O ganho é uma hipótese que merece ser investigada nos próximos resultados.", sources: ["demonstrativo"] },
        { speaker: "juliana", text: "O comunicado menciona efeitos pontuais. Ainda falta saber quanto deles entrou na melhora do trimestre.", sources: ["comunicado"] },
        { speaker: "rafael", text: "O avanço é o ponto em comum. Eu aguardaria as notas explicativas para separar o que pode se repetir do que foi pontual.", sources: ["demonstrativo", "comunicado"] },
      ],
    },
    {
      id: "risco",
      label: "Qual risco merece atenção?",
      turns: [
        { speaker: "cliente", text: "Qual risco merece mais atenção?" },
        { speaker: "rafael", text: "Um ponto é a concentração de clientes. Marcos, o que o relatório permite dizer sobre esse risco?" },
        { speaker: "marcos", text: "A dependência de poucos clientes pode afetar o resultado se um deles sair. Precisamos saber quanto os maiores representam na receita.", sources: ["comunicado"] },
        { speaker: "rafael", text: "A concentração merece acompanhamento. O próximo passo é medir a participação dos maiores clientes e revisar os contratos.", sources: ["comunicado"] },
      ],
    },
    {
      id: "revisao",
      label: "O que faria Rafael rever a conclusão?",
      turns: [
        { speaker: "cliente", text: "Rafael, o que faria você rever a conclusão?" },
        { speaker: "rafael", text: "Notas que separem os ganhos recorrentes dos efeitos pontuais, seguidas de outro trimestre comparável. Assim eu poderia verificar se a melhora se sustenta.", sources: ["demonstrativo", "comunicado"] },
      ],
    },
  ],
} as const satisfies Record<string, readonly DialogueScene[]>;

export type DialogueTicker = keyof typeof reportGuidedDialogues;
export type { DialogueScene };
