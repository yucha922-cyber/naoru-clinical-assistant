import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state";
import { Button, Card, CardTitle, Notice } from "./ui";
import { copyText } from "../lib/clipboard";
import { DEFAULT_PROVIDER } from "../ai/provider";
import { findPrivacyWarnings, type PromptInput } from "../ai/prompt";
import { findExercise, type Exercise } from "../data/selfcare";
import type { SelectedExercise } from "../domain/session";
import { SAMPLE_AI_RESPONSE } from "../samples/sampleCase";
import { LOCAL_EXPECTED_CHARS, LOCAL_MAX_PROMPT_CHARS, LOCAL_MODELS, resolveModelId, type LocalModelKey } from "../ai/localModels";
import { buildLocalKartePrompt, buildLocalPatientPrompt } from "../ai/localPrompts";
import type { AIPart } from "../domain/applyAI";
import type { WebGPUStatus } from "../ai/localProvider";

type Mode = "local" | "copy";
type Phase =
  | { kind: "idle" }
  | { kind: "loading"; progress: number; text: string }
  | { kind: "generating"; step: AIPart; chars: number; seconds: number; charsPerSec: number; remainingSec: number | null; patientDone: boolean }
  | { kind: "error"; message: string };

// 端末内AIのコード（WebLLM）は大きいので、使うときだけ読み込む
const loadLocal = () => import("../ai/localProvider");

export function AIPanel({ onEmptyMemo }: { onEmptyMemo: () => void }) {
  const { session, dispatch, notify, setTab, undoImport, setUndoPoint } = useApp();
  const [mode, setMode] = useState<Mode>("local");
  const [aiText, setAiText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [errorTitle, setErrorTitle] = useState("取り込めませんでした（AIの出力は貼り付け欄に残っています）");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [imported, setImported] = useState(false);

  const [gpu, setGpu] = useState<WebGPUStatus | null>(null);
  const [modelKey, setModelKey] = useState<LocalModelKey>(LOCAL_MODELS[0].key);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  /** 先読み（画面を開いた時点でモデルをGPUに読み込んでおく）の状態 */
  const [warm, setWarm] = useState<{ kind: "none" | "loading" | "ready" | "error"; progress?: number }>({ kind: "none" });
  const abortRef = useRef<AbortController | null>(null);

  const resolved = useMemo(
    () =>
      session.selections
        .map((selection) => ({ selection, exercise: findExercise(selection.slug) }))
        .filter((x): x is { selection: SelectedExercise; exercise: Exercise } => !!x.exercise),
    [session.selections],
  );
  const promptInput: PromptInput = {
    meta: { visitDate: session.meta.visitDate },
    memo: session.memo,
    selections: resolved,
    pendingExercises: session.pendingExercises,
  };
  const privacy = findPrivacyWarnings(session.memo, session.meta.patientName);
  const busy = phase.kind === "loading" || phase.kind === "generating";

  // WebGPU 対応の確認とダウンロード済みモデルの確認（端末内AIのタブを開いたときだけ）
  useEffect(() => {
    if (mode !== "local" || gpu) return;
    let alive = true;
    loadLocal()
      .then(async (m) => {
        const status = await m.checkWebGPU();
        const f16 = status.ok && status.shaderF16;
        const entries = await Promise.all(
          LOCAL_MODELS.map(async (x) => [x.key, await m.isModelDownloaded(resolveModelId(x.key, f16))] as const),
        );
        if (!alive) return;
        setGpu(status);
        setDownloaded(Object.fromEntries(entries));
      })
      .catch(() => alive && setGpu({ ok: false, reason: "端末内AIの読み込みに失敗しました。ページを再読み込みしてください。" }));
    return () => {
      alive = false;
    };
  }, [mode, gpu]);

  // C: ダウンロード済みのモデルを、画面を開いた時点で先に読み込んでおく（ボタンを押してからの待ち時間を減らす）
  const warmKey = gpu?.ok && downloaded[modelKey] ? resolveModelId(modelKey, gpu.shaderF16) : null;
  useEffect(() => {
    if (mode !== "local" || !warmKey) return;
    let alive = true;
    loadLocal()
      .then(async (m) => {
        if (m.isLocalModelReady(warmKey)) {
          if (alive) setWarm({ kind: "ready" });
          return;
        }
        if (alive) setWarm({ kind: "loading", progress: 0 });
        await m.loadLocalModel(warmKey, (p) => alive && setWarm({ kind: "loading", progress: p.progress }));
        if (alive) setWarm({ kind: "ready" });
      })
      .catch(() => alive && setWarm({ kind: "error" }));
    return () => {
      alive = false;
    };
  }, [mode, warmKey]);

  /** AIの出力テキストを検証して反映する（コピー方式・端末内AIで共通） */
  const importText = (text: string, { parts, undo = true, quiet = false }: { parts?: AIPart[]; undo?: boolean; quiet?: boolean } = {}) => {
    setImported(false);
    const result = DEFAULT_PROVIDER.parseResponse(
      text,
      session.selections.map((s) => s.slug),
    );
    if (!result.ok) {
      setErrorTitle("取り込めませんでした（AIの出力は貼り付け欄に残っています）");
      setErrors(result.errors);
      setWarnings([]);
      return false;
    }
    setErrors([]);
    setWarnings(result.warnings);
    if (undo) setUndoPoint();
    dispatch({ type: "applyAI", output: result.value, parts });
    setImported(true);
    if (!quiet) notify("AIの生成結果を取り込みました");
    return true;
  };

  const copyPrompt = async () => {
    if (session.memo.trim() === "") {
      notify("施術メモを入力してください");
      onEmptyMemo();
      return;
    }
    const ok = await copyText(DEFAULT_PROVIDER.buildRequest(promptInput));
    notify(ok ? "プロンプトをコピーしました。ChatGPT / Claude に貼り付けてください" : "コピーできませんでした");
  };

  /** 作成済みの内容があるときは、AIの結果で上書きしてよいか確認する（「取り込み前に戻す」でも戻せる） */
  const confirmOverwrite = () => {
    const hasContent =
      Object.values(session.karte).some((v) => v.trim()) ||
      session.patientDoc.currentPoints.trim() !== "" ||
      session.patientDoc.idealPoints.trim() !== "";
    return (
      !hasContent ||
      window.confirm("すでに作成済みのカルテ・患者資料があります。AIの結果で上書きしますか？\n（上書き後も「取り込み前に戻す」で元に戻せます）")
    );
  };

  const runLocal = async () => {
    if (session.memo.trim() === "") {
      notify("施術メモを入力してください");
      onEmptyMemo();
      return;
    }
    const m = await loadLocal();
    if (Math.max(buildLocalPatientPrompt(promptInput).length, buildLocalKartePrompt(promptInput).length) > LOCAL_MAX_PROMPT_CHARS) {
      setPhase({
        kind: "error",
        message: "施術メモが長すぎるため、端末内AIでは処理できません。メモを短くするか、「ChatGPT／Claudeにコピー」をお使いください。",
      });
      return;
    }
    if (!gpu?.ok) return;
    if (!confirmOverwrite()) return;
    const modelId = resolveModelId(modelKey, gpu.shaderF16);
    if (!downloaded[modelKey]) {
      const model = LOCAL_MODELS.find((x) => x.key === modelKey)!;
      const ok = window.confirm(
        `初回のみ、AIモデル（${model.download}）をダウンロードします。\nWi-Fi 環境で実行してください。ダウンロードしたモデルはこのブラウザに保存され、次回からはすぐに使えます。\n\n※ ダウンロードするのはAIモデルだけです。入力内容は送信されません。`,
      );
      if (!ok) return;
    }
    setErrors([]);
    setImported(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "loading", progress: 0, text: "準備中…" });
    try {
      const provider = m.createLocalProvider(modelId);
      // E: 速さ（文字/秒）と残り時間の目安を計算する
      let step: AIPart = "patient";
      let stepStart = 0;
      let rate = 0;
      let patientDone = false;
      const stepErrors: string[] = [];
      const stepWarnings: string[] = [];
      let failedRaw = "";
      let applied = false;
      const slugs = session.selections.map((s) => s.slug);
      const text = await provider.generate!(promptInput, {
        signal: controller.signal,
        onLoadProgress: (p) => setPhase({ kind: "loading", progress: p.progress, text: p.text }),
        onToken: (chars, s) => {
          const now = Date.now();
          if (s && s !== step) {
            step = s;
            stepStart = 0;
          }
          if (stepStart === 0) stepStart = now;
          const seconds = (now - stepStart) / 1000;
          if (seconds >= 2 && chars > 0) rate = chars / seconds;
          const left = Math.max(0, LOCAL_EXPECTED_CHARS[step] - chars) + (step === "patient" ? LOCAL_EXPECTED_CHARS.karte : 0);
          setPhase({
            kind: "generating",
            step,
            chars,
            seconds: Math.round(seconds),
            charsPerSec: rate,
            remainingSec: rate > 0 ? Math.round(left / rate) : null,
            patientDone,
          });
        },
        // B: 患者資料ができた時点で先に反映し、カルテはそのあと反映する
        onPartial: (part, partText, err) => {
          const label = part === "patient" ? "患者資料" : "カルテ";
          if (err) {
            stepErrors.push(err);
            failedRaw = partText;
            return;
          }
          const r = DEFAULT_PROVIDER.parseResponse(partText, slugs);
          if (!r.ok) {
            stepErrors.push(...r.errors.map((e) => `${label}: ${e}`));
            failedRaw = partText;
            return;
          }
          if (!applied) setUndoPoint();
          applied = true;
          stepWarnings.push(...r.warnings);
          dispatch({ type: "applyAI", output: r.value, parts: [part] });
          if (part === "patient") {
            patientDone = true;
            notify("患者資料ができました（④で確認できます）。続けてカルテを作成しています");
          }
        },
      });
      setDownloaded((d) => ({ ...d, [modelKey]: true }));
      setWarm({ kind: "ready" });
      setPhase({ kind: "idle" });
      setWarnings(stepWarnings);
      setImported(applied);
      if (stepErrors.length) {
        setAiText(failedRaw || text); // 失敗した出力は「ChatGPT／Claudeにコピー」タブの貼り付け欄で確認できる
        setErrors(stepErrors);
        setErrorTitle(applied ? "一部を作成できませんでした（作成できた部分は反映済みです）" : "作成できませんでした");
        notify(applied ? "一部を作成できませんでした" : "作成できませんでした");
      } else {
        setAiText(text);
        setErrors([]);
        notify("カルテと患者資料を作成しました");
      }
    } catch (e) {
      if (controller.signal.aborted) {
        setPhase({ kind: "idle" });
        notify("中止しました");
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      setPhase({
        kind: "error",
        message: /memory|OOM|out of memory|device lost|GPUBuffer/i.test(msg)
          ? "GPUのメモリが足りない可能性があります。「軽量」モデルを選ぶか、他のタブ・アプリを閉じてから再度お試しください。"
          : /fetch|network|Failed to fetch|NetworkError/i.test(msg)
            ? "AIモデルのダウンロードに失敗しました。インターネット接続を確認して再度お試しください。"
            : `端末内AIでエラーが発生しました。「ChatGPT／Claudeにコピー」をお使いください。（${msg.slice(0, 160)}）`,
      });
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = async () => {
    abortRef.current?.abort();
    (await loadLocal()).interruptLocalGeneration();
  };

  const removeModel = async (key: LocalModelKey) => {
    if (!gpu?.ok) return;
    if (!window.confirm("ダウンロード済みのAIモデルをこのブラウザから削除しますか？（次回使うときに再ダウンロードが必要です）")) return;
    await (await loadLocal()).deleteDownloadedModel(resolveModelId(key, gpu.shaderF16));
    setDownloaded((d) => ({ ...d, [key]: false }));
    notify("AIモデルを削除しました");
  };

  return (
    <Card>
      <CardTitle step="4" title="AIでカルテ・資料を作成" />
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-navy-50 p-1 text-sm font-semibold" role="tablist" aria-label="AIの使い方">
        {(
          [
            ["local", "このサイト内のAI（無料）"],
            ["copy", "ChatGPT／Claudeにコピー"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            disabled={busy}
            onClick={() => setMode(m)}
            className={`rounded-lg px-2 py-2 transition ${mode === m ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-navy-800"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {privacy.length > 0 && (
        <div className="mb-3">
          <Notice tone="warn" title="個人情報が含まれている可能性があります">
            <ul className="list-disc pl-5">
              {privacy.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      {mode === "local" ? (
        <div className="space-y-3" data-testid="local-ai">
          <p className="text-xs leading-relaxed text-slate-500">
            このパソコンの中でAIが動きます。<strong className="text-navy-800">入力内容は外部に送信されず、費用もかかりません。</strong>
            ただし ChatGPT／Claude より文章の質が下がることがあるため、必ず内容を確認してください。
          </p>
          {gpu === null ? (
            <p className="text-sm text-slate-500">この端末で使えるか確認しています…</p>
          ) : !gpu.ok ? (
            <Notice tone="warn" title="この端末・ブラウザでは使えません">
              {gpu.reason}
              <div className="mt-2">
                <Button size="sm" onClick={() => setMode("copy")}>
                  ChatGPT／Claudeにコピーする方法を使う
                </Button>
              </div>
            </Notice>
          ) : (
            <>
              <fieldset className="space-y-2" disabled={busy}>
                <legend className="mb-1 text-sm font-semibold">AIモデル</legend>
                {LOCAL_MODELS.map((m) => (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 ring-1 ${modelKey === m.key ? "bg-navy-50 ring-navy-700" : "ring-navy-100"}`}
                  >
                    <input type="radio" name="local-model" className="mt-1" checked={modelKey === m.key} onChange={() => setModelKey(m.key)} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{m.label}</span>
                      <span className="ml-2 text-xs text-slate-500">
                        {downloaded[m.key] ? "ダウンロード済み" : `初回 ${m.download} のダウンロード`}
                      </span>
                      <span className="block text-xs text-slate-500">{m.note}</span>
                    </span>
                    {downloaded[m.key] && (
                      <button type="button" className="text-xs text-slate-400 underline hover:text-red-700" onClick={() => removeModel(m.key)}>
                        削除
                      </button>
                    )}
                  </label>
                ))}
              </fieldset>

              {phase.kind === "loading" && (
                <div aria-live="polite">
                  <div className="h-2 overflow-hidden rounded-full bg-navy-100">
                    <div className="h-full bg-gold transition-all" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    AIモデルを準備中… {Math.round(phase.progress * 100)}%（初回は数分〜数十分かかります）
                  </p>
                </div>
              )}
              {phase.kind === "generating" && (
                <div className="space-y-1 rounded-xl bg-navy-50 px-3 py-2 text-sm text-navy-800" aria-live="polite" data-testid="local-progress">
                  <p className="font-semibold">
                    {phase.step === "patient" ? "● ステップ1/2：患者資料を作成中…" : "● ステップ2/2：カルテを作成中…"}
                  </p>
                  {phase.patientDone && <p className="text-xs text-sec-green">✓ 患者資料は完成しています（④で確認できます）</p>}
                  <p className="text-xs text-slate-600">
                    {phase.chars.toLocaleString()} 文字（{phase.seconds}秒）
                    {phase.charsPerSec > 0 && <>・速さ 約{phase.charsPerSec.toFixed(1)}文字/秒</>}
                    {phase.remainingSec !== null ? <>・残り 約{formatSec(phase.remainingSec)}（目安）</> : <>・速さを計測中…</>}
                  </p>
                </div>
              )}
              {phase.kind === "error" && <Notice tone="error">{phase.message}</Notice>}

              {!busy && warm.kind === "loading" && (
                <p className="text-xs text-slate-500" data-testid="warm-status">
                  AIを準備しています… {Math.round((warm.progress ?? 0) * 100)}%（画面を開いた時点で自動で準備しています。このままボタンを押してもOK）
                </p>
              )}
              {!busy && warm.kind === "ready" && (
                <p className="text-xs text-sec-green" data-testid="warm-status">
                  ✓ AIの準備ができています
                </p>
              )}
              {busy ? (
                <Button variant="danger" size="lg" className="w-full" onClick={cancel}>
                  中止する
                </Button>
              ) : (
                <Button variant="gold" size="lg" className="w-full" onClick={runLocal}>
                  AIでカルテ・資料を作成
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div>
          <Button variant="gold" size="lg" className="w-full" onClick={copyPrompt}>
            ① プロンプトと入力内容をコピー
          </Button>
          <p className="mt-2 text-xs text-slate-500">
            お名前・担当者名はプロンプトに含まれません。メモに氏名・連絡先などを書いていないか確認してから貼り付けてください。
          </p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="ai-result">
            ② AIの返答をここに貼り付け
          </label>
          <textarea
            id="ai-result"
            className="field mt-1 min-h-40 font-mono text-xs"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="AIの返答（JSON）を丸ごと貼り付けてください"
          />
          <Button variant="primary" size="lg" className="mt-3 w-full" onClick={() => confirmOverwrite() && importText(aiText)} disabled={aiText.trim() === ""}>
            ③ 取り込む
          </Button>
        </div>
      )}

      {undoImport && !busy && (
        <div className="mt-2 text-right">
          <Button variant="ghost" size="sm" onClick={undoImport}>
            取り込み前に戻す
          </Button>
        </div>
      )}
      {errors.length > 0 && (
        <div className="mt-3">
          <Notice tone="error" title={errorTitle}>
            <ul className="list-disc space-y-1 whitespace-pre-wrap pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      {imported && (
        <div className="mt-3 space-y-2">
          <Notice tone="ok" title="取り込みました">
            内容を確認・修正してから使用してください。
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setTab("karte")}>
                カルテを確認
              </Button>
              <Button size="sm" onClick={() => setTab("document")}>
                患者資料を確認
              </Button>
            </div>
          </Notice>
          {warnings.length > 0 && (
            <Notice tone="warn">
              <ul className="list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-navy-100 pt-3 text-sm">
        <button type="button" className="font-semibold text-navy-700 underline-offset-4 hover:underline" onClick={() => setTab("karte")}>
          AIを使わず手動で作成する →
        </button>
        {mode === "copy" && (
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-navy-700"
            onClick={() => setAiText(SAMPLE_AI_RESPONSE)}
            title="架空サンプルのAI返答を貼り付けます（動作確認用）"
          >
            返答例（架空）を貼る
          </button>
        )}
      </div>
    </Card>
  );
}

/** 秒数を「1分20秒」のように表示する */
function formatSec(sec: number): string {
  if (sec < 60) return `${sec}秒`;
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return r ? `${m}分${r}秒` : `${m}分`;
}
