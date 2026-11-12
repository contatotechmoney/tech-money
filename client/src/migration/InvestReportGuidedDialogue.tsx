import { useEffect, useRef, useState } from "react";
import { AudioLines, Pause, Play, UserRound } from "lucide-react";
import { Link } from "wouter";
import { previewCreditRates, type ConfirmPreviewCredit } from "./invest-preview-credits";
import { usePreviewCreditConfirmation } from "./use-preview-credit-wallet";
import { CVS } from "@shared/personas";
import { CommitteePortrait } from "./InvestReportCommittee";
import { SourceLinks } from "./InvestReportConversation";
import audioCues from "./invest-report-guided-audio.json";
import { reportGuidedDialogues, type DialogueScene, type DialogueTicker, type DialogueTurn } from "./invest-report-guided-dialogue";
import type { ReportSources } from "./invest-report-example";

const speakerName = (speaker: DialogueTurn["speaker"]) => speaker === "cliente" ? "Cliente" : CVS[speaker].nome;
const selectedStyle = "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100";
const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600";

function GuidedPlayback({ ticker, scene, sources }: { ticker: DialogueTicker; scene: DialogueScene; sources: ReportSources }) {
  const media = useRef<HTMLAudioElement>(null);
  const pendingSeek = useRef<number | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState<string>();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const cues = audioCues[ticker][scene.id];
  const turn = scene.turns[index];
  const participants = Array.from(new Set(scene.turns.map(item => item.speaker)));

  useEffect(() => {
    const audio = media.current;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function loadRecording() {
      const response = await fetch(`/comites/dialogos-demonstrativos/${ticker.toLowerCase()}-${scene.id}.mp3`, { signal: controller.signal });
      if (!response.ok) throw new Error("Recording unavailable");
      const recording = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      // Buffer the short clip so cue seeking also works on local servers without byte ranges.
      objectUrl = URL.createObjectURL(new Blob([recording], { type: "audio/mpeg" }));
      setAudioUrl(objectUrl);
    }
    void loadRecording().catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => {
      controller.abort();
      audio?.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scene.id, ticker]);

  function sync(audio: HTMLAudioElement) {
    if (audio.paused || audio.seeking || pendingSeek.current !== undefined) return;
    setIndex(Math.max(0, cues.filter(cue => cue <= audio.currentTime + 0.025).length - 1));
  }

  function applySeek(audio: HTMLAudioElement) {
    if (pendingSeek.current === undefined || audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    audio.currentTime = pendingSeek.current;
    pendingSeek.current = undefined;
  }

  function goToTurn(next: number) {
    setIndex(next);
    pendingSeek.current = cues[next];
    if (media.current) applySeek(media.current);
  }

  function togglePlayback() {
    const audio = media.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (audio.ended) goToTurn(0);
    setError(false);
    void audio.play().catch(() => setError(true));
  }

  return <div className="space-y-3">
    <audio ref={media} src={audioUrl}
      preload="auto" onLoadedData={event => applySeek(event.currentTarget)} onTimeUpdate={event => sync(event.currentTarget)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => setError(true)} />
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold">Quem participa</h3>
        <button type="button" onClick={togglePlayback} disabled={!audioUrl} className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#245e46] px-3 text-sm font-semibold text-white hover:bg-[#184a36] disabled:opacity-60 ${focus}`}>
          {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
          {playing ? "Pausar conversa" : !audioUrl && !error ? "Carregando áudio" : "Ouvir conversa"}
        </button>
      </div>
      <ul className="mt-3 grid auto-cols-fr grid-flow-col gap-1.5">
        {participants.map(speaker => <li key={speaker} aria-current={speaker === turn.speaker ? "true" : undefined}
          className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border p-1.5 text-center motion-safe:transition-colors ${speaker === turn.speaker ? selectedStyle : "border-transparent text-muted-foreground"}`}>
          {speaker === "cliente" ? <span className="grid h-10 w-10 place-items-center rounded-full bg-muted"><UserRound aria-hidden="true" className="h-5 w-5" /></span>
            : <CommitteePortrait id={speaker} className="h-10 w-10 rounded-full" />}
          <span className="text-xs font-semibold">{speakerName(speaker)}</span>
          {speaker === "rafael" && <span className="text-[10px] leading-tight">Moderador</span>}
        </li>)}
      </ul>
      {error && <p role="status" className="mt-2 text-sm text-muted-foreground">O áudio ficou indisponível. Selecione as falas abaixo para ler a conversa.</p>}
    </div>
    <section aria-label="Fala em destaque" className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <AudioLines aria-hidden="true" className="h-4 w-4 text-emerald-700 dark:text-emerald-300" /> {speakerName(turn.speaker)}
        </span>
        <span>Fala {index + 1} de {scene.turns.length}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{turn.text}</p>
      {turn.sources?.length ? <div className="mt-3 border-t border-border pt-2"><SourceLinks ids={turn.sources} sources={sources} /></div> : null}
    </section>
    <div role="group" aria-label="Navegar pelas falas" className="flex flex-wrap gap-1.5">
      {scene.turns.map(({ speaker }, step) => <button key={step} type="button"
        aria-label={`Fala ${step + 1}, ${speakerName(speaker)}`} aria-pressed={index === step} onClick={() => goToTurn(step)}
        className={`min-h-11 rounded-lg border px-2 text-xs font-semibold ${focus} ${index === step ? selectedStyle : "border-border bg-card hover:bg-muted"}`}>
        {step + 1}. {speakerName(speaker)}
      </button>)}
    </div>
  </div>;
}

export default function InvestReportGuidedDialogue({ ticker, sources, balance, onConfirm }: {
  ticker: DialogueTicker;
  sources: ReportSources;
  balance: number;
  onConfirm: ConfirmPreviewCredit;
}) {
  const [selection, setSelection] = useState(0);
  const [minutes, setMinutes] = useState(5);
  const [confirmed, setConfirmed] = useState(false);
  const [creditOrderId, setCreditOrderId] = useState(() => crypto.randomUUID());
  const { confirm, pending, error } = usePreviewCreditConfirmation(onConfirm);
  const cost = minutes * previewCreditRates.voiceMinute;
  const remaining = balance - cost;
  const scenes = reportGuidedDialogues[ticker];
  return <section aria-labelledby="guided-dialogue-title" className="space-y-3">
    <div>
      <h2 id="guided-dialogue-title" className="text-base font-bold">Experimente uma conversa</h2>
      <p className="mt-1 text-sm text-muted-foreground">Áudio pré-gravado com falas fictícias. Escolha uma pergunta e veja quem Rafael chama para responder.</p>
    </div>
    <div role="group" aria-label="Perguntas de exemplo" className="grid gap-1.5">
      {scenes.map((scene, index) => <button key={scene.id} type="button" aria-pressed={selection === index} onClick={() => setSelection(index)}
        className={`min-h-11 rounded-lg border px-3 py-2 text-left text-sm font-medium ${focus} ${selection === index ? selectedStyle : "border-border bg-card hover:bg-muted"}`}>
        {scene.label}
      </button>)}
    </div>
    <GuidedPlayback key={scenes[selection].id} ticker={ticker} scene={scenes[selection]} sources={sources} />
    <details className="rounded-xl border border-border bg-card p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-semibold">Simular créditos de uma conversa ao vivo</summary>
      <p className="mb-2 text-xs text-muted-foreground">O áudio acima é gratuito na prévia. Este exemplo estima uma sessão com agentes especializados de IA.</p>
      {confirmed ? <div className="space-y-2">
        <p role="status" className="text-sm">{cost} créditos usados na simulação. Saldo de teste: {balance}.</p>
        <button type="button" onClick={() => { setCreditOrderId(crypto.randomUUID()); setConfirmed(false); }}
          className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">Nova estimativa</button>
      </div> : <>
        <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Limite da conversa em minutos
          <select value={minutes} disabled={pending} onChange={event => {
            setMinutes(Number(event.target.value));
            setCreditOrderId(crypto.randomUUID());
          }}
            className="min-h-11 rounded-md border border-input bg-background px-2">
            {[5, 10, 15, 30].map(value => <option key={value} value={value}>{value} min</option>)}
          </select>
        </label>
        <p className="my-2 text-sm" role="status">{cost} créditos de teste · {remaining < 0 ? `Faltam ${-remaining} créditos.` : `Saldo após confirmar: ${remaining} créditos.`}</p>
        <button type="button" disabled={remaining < 0 || pending} onClick={async () => {
          const wallet = await confirm({ id: creditOrderId, type: "spend", credits: cost,
            label: `Conversa de ${minutes} min · ${ticker}`, usage: { kind: "voice", minutes, ticker } });
          if (wallet) setConfirmed(true);
        }} className="min-h-11 rounded-lg bg-[#245e46] px-3 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Registrando créditos…" : "Confirmar consumo de teste"}
        </button>
        {error && <p role="alert" className="my-2 text-sm text-red-700">{error}</p>}
        {remaining < 0 && <Link href="/investments/credits" className="ml-2 text-sm underline">Adicionar créditos de teste</Link>}
      </>}
    </details>
  </section>;
}
