import { useCallback, useEffect, useRef, useState } from "react";

// ブラウザ標準の Web Speech API による音声入力。
// ⚠ Chrome / Safari などでは音声がブラウザ提供元のサーバーで処理される場合があります。
//   そのため、このアプリでは音声入力をデフォルト無効にしています（設定で明示的に有効化が必要）。

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

const getCtor = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function useSpeech(onFinalText: (text: string) => void) {
  const supported = getCtor() !== null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const cbRef = useRef(onFinalText);
  useEffect(() => {
    cbRef.current = onFinalText;
  }, [onFinalText]);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) cbRef.current(r[0].transcript);
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      setError(
        e.error === "not-allowed"
          ? "マイクの使用が許可されていません。ブラウザの設定を確認してください。"
          : `音声入力でエラーが発生しました（${e.error}）。テキストで入力してください。`,
      );
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, []);

  useEffect(() => () => recRef.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
