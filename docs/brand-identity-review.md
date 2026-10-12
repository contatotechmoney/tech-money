# Revisão da identidade Tech Money — Invest / Finance

**Escopo:** aplicação deste repositório e sua revisão existente no GitHub.
Nenhuma publicação, alteração de domínio, banco, autenticação, permissão ou
provedor é autorizada por esta atualização. O site institucional em
techmoney.com.br não foi alterado.

## Ocorrências encontradas e corrigidas

1. A Central dos Comitês carregava `tech_money_logo.png` com a marca antiga
   T/M/T/R no cabeçalho. Agora exibe as três barras ascendentes, TECH MONEY e
   INVESTIMENTOS em HTML/CSS, sem imagem antiga como fallback.
2. Ambas as fotos de grupo tinham a marca antiga incorporada na parede; a
   foto de renda fixa também a mostrava na placa. A Central usa montagens dos
   **mesmos 10 retratos de renda variável e 6 de renda fixa**, sem recortar ou
   substituir os arquivos individuais. Os endereços dos JPGs públicos também
   servem agora composições limpas, com a marca nova e indicação de agentes de
   IA. Os JPGs antigos foram arquivados fora da pasta pública.
3. `logo.svg`, usado pela aparência nativa do Clerk, ainda continha o símbolo
   anterior. Agora há SVGs com a marca atual para acesso geral,
   INVESTIMENTOS e FINANCE; o módulo vem do destino seguro já calculado pelo
   app. Nenhuma etapa, método ou configuração de autenticação foi alterada.
4. `favicon.png` era um ícone do Replit, não a marca atual. Foi preservado no
   histórico e o favicon ativo é uma composição das três barras.
5. Os metadados OG/Twitter apontavam para uma imagem genérica do Replit.
   Foram substituídos por imagens Tech Money. Na resposta HTML do servidor,
   título e imagem correspondem ao módulo solicitado; um redirect válido
   explícito prevalece apenas para *apresentação* dos metadados. Isso não
   controla navegação nem autenticação.
6. Nos cabeçalhos internos, o símbolo já tinha três barras, mas o rótulo do
   módulo ficava oculto na versão compacta, as barras contrastavam pouco com
   a barra lateral escura e no celular o cabeçalho não mostrava o logo.
   Rótulos, contraste e cabeçalho móvel foram corrigidos no Invest e Finance.
7. A tela de áreas, páginas de relatórios, cadastro e rodapés foram
   inspecionados. Não se encontrou outro uso ativo da imagem T/M/T/R nesses
   caminhos; rótulos textuais de Tech Money e a identidade existente dos
   módulos foram mantidos. A apresentação móvel do relatório Finance foi
   ajustada para não transbordar a largura da tela; conteúdo, abas e ações
   permanecem os mesmos.

Arquivos originais, inclusive favicon de terceiro, SVG, JPGs, imagem de
compartilhamento e HTML da Central, estão em
`docs/history/brand-before-three-bars/`. Nenhuma marca de terceiros no
conteúdo dos agentes foi apagada. Dados de currículos e perfis da Central
foram comparados integralmente com o HTML anterior e permanecem idênticos.
Os componentes deixam explícito que as pessoas exibidas representam
**personas de agentes de IA**, não profissionais reais nem aconselhamento.

## Verificação da interface e limites

Testes sintéticos de navegador, exclusivamente com cookie fictício e backend
em memória, percorreram **34 visitas** a acesso, criação de conta, seleção,
Finance e Invest em largura **375 px (claro)** e **1280 px (escuro)**.
Renda variável e fixa foram abertas, com currículos e retratos verificados;
16 imagens de retrato carregaram. Não houve erro de JavaScript ou rolagem
horizontal da página. Constam zero chamadas externas do servidor, consultas
ao banco ou filas legadas, contas reais, tokens e créditos reais:
[resultado](evidence/brand-browser-audit.json).

- [Central, escuro, desktop](evidence/brand-central-dark-desktop.png)
- [Finance, claro, celular](evidence/brand-finance-mobile.png)
- [Invest, claro, celular](evidence/brand-invest-mobile.png)

Os componentes usam `flex-end`, media queries para tema claro/escuro,
contraste do texto e `prefers-reduced-motion` com construções CSS compatíveis
com WebKit moderno. **Safari nativo não foi executado:** o browser WebKit
disponível para download não inicia neste ambiente por falta de bibliotecas
do sistema. Não se atribui a ele uma aprovação de teste não realizada.

**Outros projetos:** Coop e o site institucional são projetos/superfícies
separados e não foram editados nem auditados por acesso ao código nesta
atualização. Não há base para declarar marcas antigas neles como corrigidas
ou presentes; uma eventual verificação neles requer acesso e revisão
separados, sem confundir este repositório com aqueles sites.

Todos os bloqueios da fase de simulação (análises e motores pagos, checkout,
créditos reais, envios de relatórios e monitoramento legado) permanecem
inalterados. A validação de estudos fictícios no navegador continua
independente, sem contas ou clientes reais.
