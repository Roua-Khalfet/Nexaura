// src/hooks/usePitchSpeech.js
// Hook pour générer un pitch oral résumé (~2 min) à partir du contexte d'analyse concurrentielle
// Utilise la Web Speech API par chunks pour éviter la limite synthesis-failed
// Export audio MP3 : génération via l'API Anthropic TTS (pas de capture micro)

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Générateur de texte pitch RÉSUMÉ (~350 mots = ~2 min) ───────────────────
export function buildSummaryText(context, projectData) {
  const parts = [];

  const projectDesc =
    projectData?.enriched_description ||
    projectData?.description ||
    "votre projet startup";

  const location   = projectData?.location   || context?.project_info?.location   || "";
  const sector     = projectData?.sector     || context?.project_info?.sector     || "";
  const clientType = projectData?.clientType || context?.project_info?.clientType || "";

  const locationStr   = location   ? ` Basée à ${location}.`          : "";
  const sectorStr     = sector     ? ` Secteur : ${sector}.`          : "";
  const clientStr     = clientType ? ` Cible : ${clientType}.`        : "";

  parts.push(
    `Bienvenue dans votre synthèse d'intelligence concurrentielle.` +
    ` Projet : ${projectDesc.slice(0, 200)}.` +
    locationStr + sectorStr + clientStr
  );

  const competitors = context?.competitors_structured || context?.competitors || [];
  if (competitors.length > 0) {
    parts.push(
      `\nPaysage concurrentiel : ${competitors.length} concurrent${competitors.length > 1 ? "s" : ""} identifié${competitors.length > 1 ? "s" : ""}.`
    );

    competitors.slice(0, 3).forEach((c) => {
      const name      = c.name || "Inconnu";
      const sentiment = c.reviews?.overall_sentiment ? ` Sentiment : ${c.reviews.overall_sentiment}.` : "";
      const strength  = c.competitive_analysis?.strengths?.[0] ||
                        c.competitive_analysis?.perceived_strengths?.[0]?.point ||
                        c.reviews?.perceived_strengths?.[0]?.point || "";
      const weakness  = c.competitive_analysis?.weaknesses?.[0] ||
                        c.competitive_analysis?.perceived_weaknesses?.[0]?.point ||
                        c.reviews?.perceived_weaknesses?.[0]?.point || "";

      parts.push(
        `${name} :` +
        (strength ? ` point fort — ${String(strength).slice(0, 80)}.` : "") +
        (weakness ? ` point faible — ${String(weakness).slice(0, 80)}.` : "") +
        sentiment
      );
    });
  }

  const swot = context?.swot;
  if (swot) {
    const scores = swot.overall_score;
    if (scores) {
      const v  = scores.viability         ? `viabilité ${scores.viability}/100` : "";
      const m  = scores.market_opportunity ? `opportunité de marché ${scores.market_opportunity}/100` : "";
      const r  = scores.competition_risk   ? `risque concurrentiel ${scores.competition_risk}/100` : "";
      const sc = [v, m, r].filter(Boolean).join(", ");
      if (sc) parts.push(`\nScores SWOT : ${sc}.`);
    }

    const pick = (arr, n) =>
      (arr || [])
        .slice(0, n)
        .map(i => (typeof i === "string" ? i : i.point || ""))
        .filter(Boolean)
        .join("; ");

    const S = pick(swot.strengths, 2);
    const W = pick(swot.weaknesses, 2);
    const O = pick(swot.opportunities, 2);
    const T = pick(swot.threats, 2);

    if (S) parts.push(`Forces : ${S}.`);
    if (W) parts.push(`Faiblesses : ${W}.`);
    if (O) parts.push(`Opportunités : ${O}.`);
    if (T) parts.push(`Menaces : ${T}.`);

    if (swot.strategic_summary) {
      parts.push(`\nInsight stratégique : ${String(swot.strategic_summary).slice(0, 200)}.`);
    }
  }

  const actions = swot?.priority_actions || [];
  if (actions.length > 0) {
    parts.push(`\nActions prioritaires :`);
    actions.slice(0, 3).forEach((a, i) => {
      const act = typeof a === "string" ? a : a.action || "";
      if (act) parts.push(`${i + 1}. ${String(act).slice(0, 100)}.`);
    });
  }

  parts.push(
    `\nConclusion : utilisez ces insights pour positionner et différencier efficacement votre startup.` +
    ` Bonne chance.`
  );

  return parts.join(" ").replace(/\s{2,}/g, " ").trim();
}

// Alias pour compatibilité
export const buildPitchText = buildSummaryText;

// ─── Découpage du texte en chunks ≤ 180 mots ─────────────────────────────────
function splitIntoChunks(text, maxWords = 180) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let current  = "";

  for (const sentence of sentences) {
    const candidate = current ? current + " " + sentence.trim() : sentence.trim();
    if (candidate.split(/\s+/).length > maxWords && current) {
      chunks.push(current.trim());
      current = sentence.trim();
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ─── Estimation de la durée en secondes ──────────────────────────────────────
function estimateDuration(text) {
  return Math.ceil((text.split(/\s+/).length / 140) * 60);
}

// ─── Calcule le temps de départ d'un chunk (en secondes) ─────────────────────
function chunkStartTime(chunks, index) {
  return chunks
    .slice(0, index)
    .reduce((acc, c) => acc + (c.split(/\s+/).length / 140) * 60, 0);
}

// ─── Durée estimée d'un chunk ─────────────────────────────────────────────────
function chunkDuration(chunk) {
  return (chunk.split(/\s+/).length / 140) * 60;
}

// ─── Hook principal ───────────────────────────────────────────────────────────
export function usePitchSpeech() {
  const [state, setState]               = useState("idle");
  const [progress, setProgress]         = useState(0);
  const [errorMsg, setErrorMsg]         = useState(null);
  const [audioUrl, setAudioUrl]         = useState(null);
  const [currentTime, setCurrentTime]   = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [isGeneratingMp3, setIsGeneratingMp3] = useState(false);

  const chunksRef      = useRef([]);
  const chunkIndexRef  = useRef(0);
  const utteranceRef   = useRef(null);
  const stateRef       = useRef("idle");
  const seekTargetRef  = useRef(null);
  const audioUrlRef    = useRef(null);
  const fullTextRef    = useRef("");

  // ── Minuterie pour la barre de progression ──
  const timerRef         = useRef(null);
  const chunkStartRef    = useRef(0); // horodatage Date.now() du début du chunk courant
  const chunkStartTimeSecRef = useRef(0); // secondes de début du chunk dans le total

  const setStateSync = (s) => {
    stateRef.current = s;
    setState(s);
  };

  // ─── Minuterie qui met à jour currentTime + progress en temps réel ───
  const startTimer = useCallback((chunkIdx) => {
    stopTimer();
    const chunks   = chunksRef.current;
    const total    = chunksRef.current.reduce((acc, c) => acc + chunkDuration(c), 0);
    const startSec = chunkStartTime(chunks, chunkIdx);

    chunkStartRef.current        = Date.now();
    chunkStartTimeSecRef.current = startSec;

    timerRef.current = setInterval(() => {
      if (stateRef.current !== "speaking") return;
      const elapsed   = (Date.now() - chunkStartRef.current) / 1000;
      const current   = Math.min(startSec + elapsed, total);
      const pct       = Math.min(99, Math.round((current / total) * 100));
      setCurrentTime(Math.round(current));
      setProgress(pct);
    }, 250);
  }, []);

  // ─── Nettoyage de la minuterie ───
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ─── Réinitialisation complète ───
  const reset = useCallback(() => {
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    stopTimer();

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    chunksRef.current      = [];
    chunkIndexRef.current  = 0;
    seekTargetRef.current  = null;
    fullTextRef.current    = "";

    setStateSync("idle");
    setProgress(0);
    setCurrentTime(0);
    setTotalDuration(0);
    setErrorMsg(null);
    setAudioUrl(null);
    setIsGeneratingMp3(false);
  }, [stopTimer]);

  // ─── Lecture d'un chunk ───
  const speakChunk = useCallback((index) => {
    const chunks = chunksRef.current;

    if (index >= chunks.length) {
      stopTimer();
      const total = chunks.reduce((acc, c) => acc + chunkDuration(c), 0);
      setProgress(100);
      setCurrentTime(Math.round(total));
      setStateSync("done");
      return;
    }

    chunkIndexRef.current = index;

    const text      = chunks[index];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang   = "fr-FR";
    utterance.rate   = 0.92;
    utterance.pitch  = 1.0;
    utterance.volume = 1.0;

    const voices    = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.startsWith("fr") &&
      (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
    ) || voices.find(v => v.lang.startsWith("fr"));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
      startTimer(index);
    };

    utterance.onend = () => {
      if (stateRef.current === "idle") return;

      // Seek en attente ?
      if (seekTargetRef.current !== null) {
        const target = seekTargetRef.current;
        seekTargetRef.current = null;
        setStateSync("speaking");
        speakChunk(target);
        return;
      }

      if (stateRef.current === "paused") return;

      speakChunk(index + 1);
    };

    utterance.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      stopTimer();
      setErrorMsg(`Erreur vocale : ${e.error}`);
      setStateSync("error");
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [startTimer, stopTimer]);

  // ─── Lancer la lecture ───
  const speak = useCallback(async (text) => {
    if (!window.speechSynthesis) {
      setErrorMsg("La synthèse vocale n'est pas prise en charge par votre navigateur.");
      setStateSync("error");
      return;
    }

    fullTextRef.current = text;

    const chunks = splitIntoChunks(text, 180);
    chunksRef.current      = chunks;
    chunkIndexRef.current  = 0;
    seekTargetRef.current  = null;

    const dur = estimateDuration(text);
    setTotalDuration(dur);
    setProgress(0);
    setCurrentTime(0);

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);

    setStateSync("preparing");

    await new Promise(resolve => {
      if (window.speechSynthesis.getVoices().length > 0) { resolve(); return; }
      const h = () => {
        resolve();
        window.speechSynthesis.removeEventListener("voiceschanged", h);
      };
      window.speechSynthesis.addEventListener("voiceschanged", h);
      setTimeout(resolve, 1000);
    });

    setStateSync("speaking");
    speakChunk(0);
  }, [speakChunk]);

  // ─── Mettre en pause ───
  const pause = useCallback(() => {
    if (stateRef.current !== "speaking") return;
    stopTimer();
    window.speechSynthesis.pause();
    setStateSync("paused");
  }, [stopTimer]);

  // ─── Reprendre la lecture ───
  const resume = useCallback(() => {
    if (stateRef.current !== "paused") return;
    // Reprendre la minuterie depuis le currentTime actuel
    const chunks = chunksRef.current;
    const idx    = chunkIndexRef.current;
    chunkStartRef.current        = Date.now();
    chunkStartTimeSecRef.current = chunkStartTime(chunks, idx);
    window.speechSynthesis.resume();
    setStateSync("speaking");
    startTimer(idx);
  }, [startTimer]);

  // ─── Arrêter la lecture ───
  const stop = useCallback(() => {
    stopTimer();
    window.speechSynthesis.cancel();
    chunksRef.current     = [];
    chunkIndexRef.current = 0;
    seekTargetRef.current = null;
    setStateSync("idle");
    setProgress(0);
    setCurrentTime(0);
  }, [stopTimer]);

  // ─── Seek (±15s) — corrigé : relance directe sans passer par onend ───
  const seekTo = useCallback((targetTime) => {
    const chunks = chunksRef.current;
    if (chunks.length === 0) return;

    // Trouver le chunk cible
    let accumulated = 0;
    let targetIndex = chunks.length - 1;
    for (let i = 0; i < chunks.length; i++) {
      const dur = chunkDuration(chunks[i]);
      if (accumulated + dur > targetTime) {
        targetIndex = i;
        break;
      }
      accumulated += dur;
    }

    const total = chunks.reduce((acc, c) => acc + chunkDuration(c), 0);
    const clampedTime = Math.max(0, Math.min(targetTime, total));
    setCurrentTime(Math.round(clampedTime));
    setProgress(Math.min(99, Math.round((clampedTime / total) * 100)));

    if (stateRef.current === "speaking" || stateRef.current === "paused") {
      stopTimer();
      // Annuler l'utterance courante — on relance directement sans attendre onend
      seekTargetRef.current = null; // on ne passe PAS par onend
      window.speechSynthesis.cancel();

      // Petit délai pour laisser le cancel se propager
      setTimeout(() => {
        setStateSync("speaking");
        speakChunk(targetIndex);
      }, 80);
    }
  }, [speakChunk, stopTimer]);

  // ─── Générer et télécharger en MP3 via l'API Anthropic TTS ───
  // Utilise l'endpoint /v1/audio/speech si disponible,
  // sinon bascule sur la synthèse navigateur + MediaRecorder (getDisplayMedia)
  const downloadAudio = useCallback(async (filename = "pitch-summary.mp3") => {
    const text = fullTextRef.current;
    if (!text) return;

    setIsGeneratingMp3(true);

    try {
      // ── Tentative 1 : API Anthropic TTS ──
      // (disponible si l'endpoint /v1/audio/speech existe sur votre compte)
      const ttsRes = await fetch("https://api.anthropic.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text.slice(0, 4096), // limite de l'API
          voice: "alloy",
          response_format: "mp3",
        }),
      });

      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url  = URL.createObjectURL(blob);
        triggerDownload(url, filename);
        URL.revokeObjectURL(url);
        setIsGeneratingMp3(false);
        return;
      }
    } catch (_) {
      // L'API TTS n'est pas disponible, on bascule sur le fallback
    }

    // ── Fallback : Web Speech API → MediaRecorder via getDisplayMedia (son système) ──
    // Demande la capture du son du système (onglet courant)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: {
          suppressLocalAudioPlayback: false,
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 44100,
        },
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        systemAudio: "include",
      });

      // On ne conserve que la piste audio
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        // Aucun audio capturé (l'utilisateur n'a pas coché « Partager le son »)
        stream.getTracks().forEach(t => t.stop());
        throw new Error("no_audio");
      }
      // Arrêter les pistes vidéo
      stream.getVideoTracks().forEach(t => t.stop());

      const audioStream = new MediaStream(audioTracks);
      const mimeType    = getSupportedMimeType();
      const recorder    = new MediaRecorder(audioStream, { mimeType });
      const chunks_rec  = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks_rec.push(e.data);
      };

      recorder.onstop = () => {
        audioTracks.forEach(t => t.stop());
        if (chunks_rec.length === 0) {
          setIsGeneratingMp3(false);
          return;
        }
        const blob     = new Blob(chunks_rec, { type: mimeType });
        const url      = URL.createObjectURL(blob);
        const dlName   = filename.replace(".mp3", ".webm");
        triggerDownload(url, dlName);
        URL.revokeObjectURL(url);
        setIsGeneratingMp3(false);
      };

      recorder.start(200);

      // Relancer la synthèse pour la capturer
      const utterance         = new SpeechSynthesisUtterance(text);
      utterance.lang          = "fr-FR";
      utterance.rate          = 0.92;
      utterance.pitch         = 1.0;
      utterance.volume        = 1.0;
      const voices            = window.speechSynthesis.getVoices();
      const preferred         = voices.find(v =>
        v.lang.startsWith("fr") &&
        (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Premium"))
      ) || voices.find(v => v.lang.startsWith("fr"));
      if (preferred) utterance.voice = preferred;

      utterance.onend = () => {
        setTimeout(() => recorder.stop(), 300);
      };
      utterance.onerror = () => {
        recorder.stop();
      };

      window.speechSynthesis.speak(utterance);

    } catch (err) {
      setIsGeneratingMp3(false);
      if (err.message === "no_audio") {
        alert(
          "Pour télécharger l'audio, veuillez :\n" +
          "1. Cliquer sur « Télécharger »\n" +
          "2. Choisir « Cet onglet » dans le sélecteur\n" +
          "3. Cocher « Partager le son de l'onglet »\n" +
          "4. Cliquer sur Partager"
        );
      }
      // Si l'utilisateur annule ou erreur, on ne fait rien
    }
  }, []);

  // Nettoyage de la minuterie au démontage du composant
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  return {
    state,
    progress,
    currentTime,
    totalDuration,
    errorMsg,
    audioUrl,
    isGeneratingMp3,
    speak,
    pause,
    resume,
    stop,
    reset,
    seekTo,
    downloadAudio,
  };
}

// ─── Déclenche le téléchargement d'un blob URL ────────────────────────────────
function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Format audio pris en charge ─────────────────────────────────────────────
function getSupportedMimeType() {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || "audio/webm";
}