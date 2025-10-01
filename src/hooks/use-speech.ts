import { useEffect, useRef } from "react";

interface SpeechOptions {
  voicePreferences?: string[];
  rate?: number;
  pitch?: number;
  volume?: number;
}

const DEFAULT_PREFERENCES = ["Google", "Amelie", "Thomas", "fr", "French"];

export function useSpeechSynthesis(text: string, options: SpeechOptions = {}) {
  const lastUtteranceRef = useRef<string>("");

  useEffect(() => {
    if (!text || !text.trim() || typeof window === "undefined") return;

    const synthesis = window.speechSynthesis;
    if (!synthesis) return;

    if (text === lastUtteranceRef.current) return;

    const voicePreferences = options.voicePreferences?.length ? options.voicePreferences : DEFAULT_PREFERENCES;
    const rate = options.rate ?? 0.98;
    const pitch = options.pitch ?? 1;
    const volume = options.volume ?? 1;

    let cancelled = false;

    const speakWithVoices = (voices: SpeechSynthesisVoice[]) => {
      if (cancelled || !voices.length) return;

      const normalizedPreferences = voicePreferences.map((pref) => pref.toLowerCase());
      const preferredVoice =
        voices.find((voice) => normalizedPreferences.some((pref) => voice.name.toLowerCase().includes(pref))) ||
        voices.find((voice) => voice.lang.toLowerCase().startsWith("fr")) ||
        voices[0];

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice?.lang ?? "fr-FR";
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      synthesis.cancel();
      lastUtteranceRef.current = text;
      synthesis.speak(utterance);
    };

    const handleVoicesChanged = () => {
      const voices = synthesis.getVoices();
      if (voices.length) {
        speakWithVoices(voices);
      }
    };

    const existingVoices = synthesis.getVoices();
    if (existingVoices.length) {
      speakWithVoices(existingVoices);
    } else {
      synthesis.addEventListener("voiceschanged", handleVoicesChanged);
    }

    return () => {
      cancelled = true;
      synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      synthesis.cancel();
    };
  }, [text, options.voicePreferences, options.rate, options.pitch, options.volume]);
}

export default useSpeechSynthesis;
