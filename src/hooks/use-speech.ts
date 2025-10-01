import { useEffect, useRef } from "react";

interface SpeechOptions {
  voicePreferences?: string[];
  rate?: number;
  pitch?: number;
  volume?: number;
  language?: string;
}

const DEFAULT_PREFERENCES = ["Google", "Amelie", "Thomas", "fr", "French"];

export function useSpeechSynthesis(text: string, options: SpeechOptions = {}) {
  const lastUtteranceRef = useRef<{ text: string; language?: string }>({ text: "", language: undefined });

  useEffect(() => {
    if (!text || !text.trim() || typeof window === "undefined") return;

    const synthesis = window.speechSynthesis;
    if (!synthesis) return;

    if (text === lastUtteranceRef.current.text && options.language === lastUtteranceRef.current.language) return;

    const voicePreferences = options.voicePreferences?.length ? options.voicePreferences : DEFAULT_PREFERENCES;
    const rate = options.rate ?? 0.98;
    const pitch = options.pitch ?? 1;
    const volume = options.volume ?? 1;
    const language = options.language?.toLowerCase();

    let cancelled = false;

    const speakWithVoices = (voices: SpeechSynthesisVoice[]) => {
      if (cancelled || !voices.length) return;

      const normalizedPreferences = voicePreferences.map((pref) => pref.toLowerCase());
      const isLanguageMatch = (voice: SpeechSynthesisVoice) =>
        language ? voice.lang?.toLowerCase().startsWith(language) : true;
      const languageMatches = voices.filter((voice) => isLanguageMatch(voice));
      const findByPreference = (candidateVoices: SpeechSynthesisVoice[]) =>
        candidateVoices.find((voice) =>
          normalizedPreferences.some((pref) => voice.name.toLowerCase().includes(pref) || voice.voiceURI.toLowerCase().includes(pref)),
        );

      const preferredVoice =
        findByPreference(languageMatches) ||
        languageMatches.find((voice) => !voice.localService) ||
        languageMatches[0] ||
        findByPreference(voices) ||
        voices.find((voice) => voice.lang?.toLowerCase().startsWith(language ?? "")) ||
        voices[0];

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = preferredVoice;
      utterance.lang = options.language ?? preferredVoice?.lang ?? "fr-FR";
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = volume;

      synthesis.cancel();
      lastUtteranceRef.current = { text, language: options.language };
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
  }, [text, options.voicePreferences, options.rate, options.pitch, options.volume, options.language]);
}

export default useSpeechSynthesis;
