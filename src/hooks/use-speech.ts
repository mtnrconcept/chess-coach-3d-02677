import { useEffect } from "react";

export function useSpeechSynthesis(text: string) {
  useEffect(() => {
    if (!text || typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    const voices = window.speechSynthesis.getVoices();
    const frenchVoice = voices.find((v) => v.lang.startsWith("fr"));
    if (frenchVoice) {
      utterance.voice = frenchVoice;
    }

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [text]);
}

export default useSpeechSynthesis;
