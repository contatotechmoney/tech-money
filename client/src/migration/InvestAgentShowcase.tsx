import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, LockKeyhole, Pause, Play } from "lucide-react";
import { Link, useSearch } from "wouter";
import { COMITE_CARTEIRA, COMITE_RF, COMITE_RV, CVS, LENTES } from "@shared/personas";

const groups = [
  { name: "Renda variável", ids: COMITE_RV, portraits: "personas_fotos" },
  { name: "Renda fixa", ids: COMITE_RF, portraits: "personas_fotos_rf" },
  { name: "Carteira completa", ids: COMITE_CARTEIRA, portraits: "" },
] as const;
const outlined = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700";
const motion = () => window.matchMedia("(prefers-reduced-motion: reduce)");

export default function InvestAgentShowcase() {
  const requested = new URLSearchParams(useSearch()).get("agente") ?? "";
  const initialGroup = Math.max(0, groups.findIndex(group => (group.ids as readonly string[]).includes(requested)));
  const [groupIndex, setGroupIndex] = useState(initialGroup);
  const [activeId, setActiveId] = useState((groups[initialGroup].ids as readonly string[]).includes(requested) ? requested : groups[initialGroup].ids[0]);
  const [playing, setPlaying] = useState(() => !motion().matches);
  const track = useRef<HTMLUListElement>(null);
  const group = groups[groupIndex];
  const cv = CVS[activeId];

  function advance(direction: number) {
    const element = track.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    if (max < 2) return;
    const width = (element.firstElementChild?.getBoundingClientRect().width ?? element.clientWidth) + 12;
    const left = direction > 0 && element.scrollLeft >= max - 3 ? 0
      : direction < 0 && element.scrollLeft <= 3 ? max : element.scrollLeft + width * direction;
    element.scrollTo({ left, behavior: motion().matches ? "instant" : "smooth" });
  }

  useEffect(() => {
    const preference = motion();
    const sync = () => { if (preference.matches) setPlaying(false); };
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => { if (!document.hidden) advance(1); }, 4200);
    return () => clearInterval(timer);
  }, [playing, groupIndex]);
  useEffect(() => { track.current?.scrollTo({ left: 0, behavior: "instant" }); }, [groupIndex]);


  return <div className="space-y-5">
    <header className="rounded-2xl bg-[#10372b] p-5 text-white sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#bde6d1]">Tech Money Invest · Pessoas e papéis da IA</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Conheça os agentes de IA</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#dbede4]">22 agentes em três comitês. Conheça a especialidade e o currículo de cada um. As perguntas sobre uma empresa ficam no relatório pronto.</p>
      <p className="mt-3 text-xs leading-5 text-[#c7e0d4]">Perfis e imagens ilustram personagens de IA. Formação, experiência e certificações de exemplo não são credenciais profissionais reais.</p>
      <Link href="/investments/agents/estudos" className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20"><BookOpen aria-hidden="true" className="h-4 w-4" /> Abrir estudos e simulações</Link>
    </header>
    <section aria-label="Carrossel dos comitês" className="space-y-3 rounded-2xl border bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Escolher comitê" className="flex flex-wrap gap-2">
          {groups.map((item, index) => <button key={item.name} type="button" aria-pressed={index === groupIndex}
            onClick={() => { setPlaying(false); setGroupIndex(index); setActiveId(item.ids[0]); }}
            className={`${outlined} ${index === groupIndex ? "border-teal-700 bg-teal-50 text-teal-900" : ""}`}>{item.name} ({item.ids.length})</button>)}
        </div>
        <div role="group" aria-label="Controles do carrossel" className="flex gap-2">
          <button type="button" aria-label="Agentes anteriores" className={outlined} onClick={() => { setPlaying(false); advance(-1); }}><ArrowLeft aria-hidden="true" className="h-4 w-4" /></button>
          <button type="button" className={outlined} onClick={() => setPlaying(value => !value)}>
            {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
            {playing ? "Pausar" : "Reproduzir"}
          </button>
          <button type="button" aria-label="Próximos agentes" className={outlined} onClick={() => { setPlaying(false); advance(1); }}><ArrowRight aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      </div>
      <ul ref={track} aria-label={`Agentes de ${group.name}`} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        onPointerEnter={event => { if (event.pointerType === "mouse") setPlaying(false); }}
        onPointerDown={() => setPlaying(false)} onFocusCapture={() => setPlaying(false)}>
        {group.ids.map(id => <li key={id} className="flex w-[min(76vw,15rem)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-teal-100 bg-[#f8fcfa]">
          {group.portraits ? <img className="h-36 w-full object-cover object-[center_28%]" loading="lazy"
            src={`/comites/${group.portraits}/${id}.png`} alt="" />
            : <div aria-hidden="true" className="grid h-36 place-items-center bg-gradient-to-br from-[#d3eadf] to-[#edf6f1] text-4xl font-bold text-[#285b47]">{CVS[id].nome.slice(0, 2).toUpperCase()}</div>}
          <div className="flex flex-1 flex-col p-3">
            <h2 className="text-lg font-bold">{CVS[id].nome}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-600">{CVS[id].papel}</p>
            <a href="#perfil-agente" className={`${outlined} mt-3`} onClick={() => { setPlaying(false); setActiveId(id); }}>Ver currículo de {CVS[id].nome}</a>
          </div>
        </li>)}
      </ul>
      <p className="text-xs text-slate-600">No celular, deslize para ver mais agentes. Você também pode usar as setas.</p>
    </section>

    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <section id="perfil-agente" aria-labelledby="profile-title" className="scroll-mt-20 rounded-2xl border bg-white p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Currículo ilustrativo · {group.name}</p>
        <h2 id="profile-title" className="mt-1 text-2xl font-bold">{cv.nome}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-700">{cv.papel}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{cv.resumo}</p>
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-semibold">Formação, experiência e certificações</summary>
          <div className="mt-3 space-y-3 text-sm text-slate-700">
            {([["Formação", cv.formacao], ["Experiência", cv.experiencia], ["Certificações", cv.certificacoes]] as const).map(([label, values]) =>
              <div key={label}><h3 className="font-semibold">{label}</h3>{values.length
                ? <ul className="mt-1 list-disc space-y-1 pl-5">{values.map(item => <li key={item}>{item}</li>)}</ul>
                : <p>Não cadastrada para esta persona.</p>}</div>)}
            <p><strong>Idiomas:</strong> {cv.idiomas}</p>
          </div>
        </details>
        <p className="mt-3 text-sm leading-relaxed"><strong>Especialidade:</strong> {cv.especializacoes}</p>
      </section>
      <section aria-labelledby="agent-report-rule" className="rounded-2xl border bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 text-teal-900">
          <LockKeyhole aria-hidden="true" className="h-5 w-5" />
          <h2 id="agent-report-rule" className="text-lg font-bold">Pergunte depois da pesquisa</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">As perguntas a {cv.nome} sobre uma empresa começam quando o relatório dela está pronto. Assim, a conversa tem fontes e datas para consultar.</p>
        {LENTES[activeId] && <p className="mt-3 text-sm leading-relaxed"><strong>O que este agente avalia:</strong> {LENTES[activeId].foco}.</p>}
        <Link href={groupIndex === 2 ? "/investments/portfolio/simulation" : "/investments/agents/estudos"} className={`${outlined} mt-4`}>
          {groupIndex === 2 ? "Simular comitê da carteira" : "Ver estudos de exemplo"} <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </section>
    </div>
  </div>;
}
