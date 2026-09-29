import { useEffect, useRef } from 'react'

/** Felolvasás a böngésző beépített, ingyenes beszédszintetizátorával */
export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'hu-HU'
  u.rate = 1.1
  speechSynthesis.speak(u)
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}

type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const voiceSupported = typeof window !== 'undefined' && recognitionCtor() !== null

// A \b ékezetes betűknél nem működik, ezért Unicode-betűkre figyelő határt használunk
const word = (alts: string) => new RegExp(`(?<![\\p{L}\\d])(${alts})(?![\\p{L}\\d])`, 'u')
const NUMBER_WORDS: Array<[RegExp, number]> = [
  [word('1|egy|egyes|első'), 1],
  [word('2|kettő|kető|két|kettes|második'), 2],
  [word('3|három|hármas|harmadik'), 3],
  [word('4|négy|négyes|negyedik'), 4],
]

export function parseSpokenNumber(text: string): number | null {
  const t = text.toLowerCase()
  for (const [re, n] of NUMBER_WORDS) if (re.test(t)) return n
  return null
}

/** Hangos válasz: a válasz sorszámát kell kimondani („egy”, „kettő”…). */
export function useVoiceAnswers(enabled: boolean, onNumber: (n: number) => void, onError: (msg: string) => void) {
  const cb = useRef({ onNumber, onError })
  useEffect(() => {
    cb.current = { onNumber, onError }
  })
  useEffect(() => {
    const Ctor = recognitionCtor()
    if (!enabled || !Ctor) return
    const rec = new Ctor()
    rec.lang = 'hu-HU'
    rec.continuous = true
    rec.interimResults = true
    let stopped = false
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const n = parseSpokenNumber(e.results[i][0].transcript)
        if (n !== null) {
          cb.current.onNumber(n)
          return
        }
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true
        cb.current.onError('A mikrofon használata nincs engedélyezve')
      }
    }
    rec.onend = () => {
      if (!stopped) rec.start()
    }
    rec.start()
    return () => {
      stopped = true
      rec.stop()
    }
  }, [enabled])
}
