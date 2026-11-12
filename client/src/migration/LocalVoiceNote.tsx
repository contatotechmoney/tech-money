import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

const LIMIT_MS = 30_000;

export default function LocalVoiceNote() {
  const [stage, setStage] = useState<"idle" | "starting" | "recording" | "finishing">("idle");
  const [audio, setAudio] = useState("");
  const [notice, setNotice] = useState("");
  const active = useRef(true);
  const stream = useRef<MediaStream | undefined>(undefined);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const audioUrl = useRef("");

  function releaseMicrophone() {
    clearTimeout(timeout.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = undefined;
    recorder.current = undefined;
  }
  function discardAudio() {
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
    setAudio("");
  }

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      const capture = recorder.current;
      if (capture) {
        capture.onstop = null;
        capture.ondataavailable = null;
        capture.onerror = null;
        if (capture.state !== "inactive") capture.stop();
      }
      releaseMicrophone();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);

  function stop() {
    if (recorder.current?.state === "recording") {
      setStage("finishing");
      recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    }
  }

  async function start() {
    if (stage !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice("A gravação não está disponível neste navegador. Você pode escrever a pergunta.");
      return;
    }
    setStage("starting");
    setNotice("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!active.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const capture = new MediaRecorder(media);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      capture.onerror = () => {
        capture.onstop = null;
        releaseMicrophone();
        if (active.current) { setStage("idle"); setNotice("Não foi possível concluir a gravação."); }
      };
      capture.onstop = () => {
        releaseMicrophone();
        if (!active.current) return;
        setStage("idle");
        const blob = new Blob(chunks, { type: capture.mimeType || chunks[0]?.type });
        if (!blob.size) { setNotice("Nenhum áudio foi capturado. Tente novamente ou escreva a pergunta."); return; }
        discardAudio();
        audioUrl.current = URL.createObjectURL(blob);
        setAudio(audioUrl.current);
        setNotice("Gravação pronta para ouvir. Nenhum áudio foi enviado.");
      };
      capture.start();
      setStage("recording");
      timeout.current = setTimeout(stop, LIMIT_MS);
    } catch {
      releaseMicrophone();
      if (active.current) {
        setStage("idle");
        setNotice("O microfone não pôde ser aberto. Verifique a permissão ou escreva a pergunta.");
      }
    }
  }

  return <section aria-label="Pergunta por voz" className="mt-4 rounded-xl border border-border bg-background text-foreground p-4">
    <h4 className="text-sm font-semibold">Pergunta por voz</h4>
    <p className="mt-1 text-sm leading-5 text-muted-foreground">Grave até 30 segundos e ouça antes de avançar. Nesta prévia, o áudio fica no navegador: não é enviado nem transcrito.</p>
    <button type="button" disabled={stage === "starting" || stage === "finishing"}
      onClick={() => stage === "recording" ? stop() : void start()}
      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-card-foreground disabled:opacity-60">
      {stage === "recording" ? <Square aria-hidden="true" className="h-4 w-4" /> : <Mic aria-hidden="true" className="h-4 w-4" />}
      {stage === "recording" ? "Parar gravação" : stage === "starting" ? "Aguardando microfone…" : stage === "finishing" ? "Preparando áudio…" : "Gravar pergunta"}
    </button>
    {stage === "recording" && <p role="status" className="mt-2 text-sm text-rose-800 dark:text-rose-300">Gravando…</p>}
    {notice && <p role="status" className="mt-2 text-sm text-muted-foreground">{notice}</p>}
    {audio && <div className="mt-3 flex flex-wrap items-center gap-2">
      <audio aria-label="Ouvir pergunta gravada" src={audio} controls preload="metadata" className="w-full max-w-sm" />
      <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => { discardAudio(); setNotice("Gravação descartada."); }}>Descartar áudio</button>
    </div>}
  </section>;
}
