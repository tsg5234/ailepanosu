"use client";

let audioContext: AudioContext | null = null;
let lastSuccessPhraseIndex = -1;

const SUCCESS_PHRASES_WITH_NAME = [
  (name: string) => `${name}, harika gidiyorsun`,
  (name: string) => `Super ${name}`,
  (name: string) => `${name}, bunu da tamamladin`,
  (name: string) => `Bravo ${name}`,
  (name: string) => `${name}, cok iyi oldu`,
  (name: string) => `${name}, sahane`
];

const SUCCESS_PHRASES_GENERIC = [
  () => "Harika gidiyorsun",
  () => "Super is",
  () => "Bunu da tamamladin",
  () => "Cok guzel oldu",
  () => "Bravo",
  () => "Mis gibi"
];

function pickSuccessPhrase(name?: string) {
  const phraseBuilders = name ? SUCCESS_PHRASES_WITH_NAME : SUCCESS_PHRASES_GENERIC;

  if (phraseBuilders.length === 1) {
    lastSuccessPhraseIndex = 0;
    return phraseBuilders[0](name ?? "");
  }

  let nextIndex = Math.floor(Math.random() * phraseBuilders.length);

  if (nextIndex === lastSuccessPhraseIndex) {
    nextIndex = (nextIndex + 1) % phraseBuilders.length;
  }

  lastSuccessPhraseIndex = nextIndex;
  return phraseBuilders[nextIndex](name ?? "");
}

function getContext() {
  if (typeof window === "undefined") {
    return null;
  }

  audioContext ??= new window.AudioContext();
  return audioContext;
}

export async function playSuccessAudio(name?: string) {
  const context = getContext();

  if (context) {
    if (context.state === "suspended") {
      await context.resume();
    }

    const now = context.currentTime;
    const frequencies = [523.25, 659.25, 783.99];

    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.16, now + index * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.16);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.09);
      oscillator.stop(now + index * 0.09 + 0.18);
    });
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(pickSuccessPhrase(name));
    utterance.lang = "tr-TR";
    utterance.rate = 0.97 + Math.random() * 0.08;
    utterance.pitch = 1.02 + Math.random() * 0.16;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }
}
