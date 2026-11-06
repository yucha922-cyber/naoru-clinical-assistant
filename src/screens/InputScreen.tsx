import { useCallback, useMemo, useRef, useState } from "react";
import { useApp } from "../state";
import { Button, Card, CardTitle, Notice } from "../components/ui";
import { useSpeech } from "../lib/useSpeech";
import { copyText } from "../lib/clipboard";
import { DEFAULT_PROVIDER } from "../ai/provider";
import { findPrivacyWarnings } from "../ai/prompt";
import { applyAIOutput } from "../domain/applyAI";
import { findExercise, type Exercise } from "../data/selfcare";
import { SelectedSummary } from "../components/SelectedSummary";
import { SAMPLE_AI_RESPONSE } from "../samples/sampleCase";

const MEMO_TEMPLATE = `主訴：
副主訴：
来院理由：
HOPE：
問診：
検査：
施術：
効果（施術直後）：
セルフケア：
次回：
プラン・頻度：
`;

export function InputScreen() {
  const { session, dispatch, notify, setTab, settings, setSettings, snapshot, saveSnapshot, restoreSnapshot, undoImport, setUndoPoint } =
    useApp();
  const [aiText, setAiText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [imported, setImported] = useState(false);
  const memoRef = useRef<HTMLTextAreaElement>(null);

  const onSpeech = useCallback((text: string) => dispatch({ type: "appendMemo", text }), [dispatch]);
  const speech = useSpeech(onSpeech);

  const resolved = useMemo(
    () =>
      session.selections
        .map((selection) => ({ selection, exercise: findExercise(selection.slug) }))
        .filter((x): x is { selection: (typeof session.selections)[number]; exercise: Exercise } => !!x.exercise),
    [session],
  );
  const privacy = findPrivacyWarnings(session.memo, session.meta.patientName);

  const enableSpeech = (on: boolean) => {
    if (on) {
      const ok = window.confirm(
        "音声入力を有効にしますか？\n\nブラウザによっては、音声がブラウザ提供元（Google・Apple など）のサーバーに送信されて文字に変換されます。\n" +
          "患者様の氏名など個人を特定できる情報は話さないでください。院の運用ルールで許可されている場合のみ使用してください。",
      );
      if (!ok) return;
    } else if (speech.listening) {
      speech.stop();
    }
    setSettings({ ...settings, speechEnabled: on });
  };

  const copyPrompt = async () => {
    if (session.memo.trim() === "") {
      notify("施術メモを入力してください");
      memoRef.current?.focus();
      return;
    }
    const prompt = DEFAULT_PROVIDER.buildRequest({
      meta: { visitDate: session.meta.visitDate },
      memo: session.memo,
      selections: resolved,
      pendingExercises: session.pendingExercises,
    });
    const ok = await copyText(prompt);
    notify(ok ? "プロンプトをコピーしました。ChatGPT / Claude に貼り付けてください" : "コピーできませんでした");
  };

  const importAI = () => {
    setImported(false);
    const result = DEFAULT_PROVIDER.parseResponse(
      aiText,
      session.selections.map((s) => s.slug),
    );
    if (!result.ok) {
      setErrors(result.errors);
      setWarnings([]);
      return;
    }
    setErrors([]);
    setWarnings(result.warnings);
    setUndoPoint();
    dispatch({ type: "replace", session: applyAIOutput(session, result.value) });
    setImported(true);
    notify("AIの生成結果を取り込みました");
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardTitle step="1" title="基本情報" />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-semibold">
              施術日
              <input
                type="date"
                className="field mt-1"
                value={session.meta.visitDate}
                onChange={(e) => dispatch({ type: "setMeta", patch: { visitDate: e.target.value } })}
              />
            </label>
            <label className="block text-sm font-semibold">
              担当セラピスト
              <input
                className="field mt-1"
                value={session.meta.therapistName}
                onChange={(e) => dispatch({ type: "setMeta", patch: { therapistName: e.target.value } })}
                placeholder="例: 山田"
              />
            </label>
            <label className="block text-sm font-semibold">
              お名前（資料の表示用）
              <input
                className="field mt-1"
                value={session.meta.patientName}
                onChange={(e) => dispatch({ type: "setMeta", patch: { patientName: e.target.value } })}
                placeholder="AIには渡しません"
                autoComplete="off"
              />
            </label>
          </div>
        </Card>

        <Card>
          <CardTitle step="2" title="施術メモ（問診・評価・施術内容）" hint="箇条書き・話し言葉のままでOK。誤変換はAIが専門用語に整理します。" />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => dispatch({ type: "appendMemo", text: MEMO_TEMPLATE })}>
              見出しテンプレートを挿入
            </Button>
            {settings.speechEnabled && speech.supported && (
              <Button
                size="sm"
                variant={speech.listening ? "danger" : "primary"}
                onClick={speech.listening ? speech.stop : speech.start}
              >
                {speech.listening ? "■ 音声入力を停止" : "🎤 音声入力"}
              </Button>
            )}
            <span className="mx-1 hidden h-6 w-px bg-navy-100 sm:block" />
            <Button size="sm" onClick={saveSnapshot}>
              一時保存
            </Button>
            <Button size="sm" variant="ghost" disabled={!snapshot} onClick={restoreSnapshot}>
              一時保存に戻す
            </Button>
            {snapshot && (
              <span className="text-xs text-slate-500">
                {snapshot.savedAt.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} に一時保存（メモリ内）
              </span>
            )}
          </div>
          <textarea
            ref={memoRef}
            className="field min-h-[22rem] font-[450] leading-relaxed"
            value={session.memo}
            onChange={(e) => dispatch({ type: "setMemo", memo: e.target.value })}
            placeholder={"例）\n主訴：右の首〜肩の張り、夕方に強い\n検査：頸椎右回旋45° 左60°、右胸鎖乳突筋 圧痛\n施術：小胸筋リリース、胸椎モビライゼーション\n効果：右回旋 45°→55°"}
            aria-label="施術メモ"
          />
          {speech.listening && (
            <p className="mt-2 text-sm text-sec-pink">● 聞き取り中… {speech.interim}</p>
          )}
          {speech.error && <div className="mt-2"><Notice tone="error">{speech.error}</Notice></div>}
          <details className="mt-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-semibold text-navy-800">音声入力の設定</summary>
            <div className="mt-2 space-y-2">
              {!speech.supported ? (
                <p>このブラウザは音声入力（Web Speech API）に対応していません。テキストで入力してください。</p>
              ) : (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={settings.speechEnabled}
                    onChange={(e) => enableSpeech(e.target.checked)}
                  />
                  <span>
                    音声入力を有効にする（既定: 無効）
                    <br />
                    <span className="text-xs text-slate-500">
                      ブラウザによっては音声が外部サーバーで処理されます。患者情報を含む音声での利用は、安全性と院の運用条件を確認してからにしてください。
                    </span>
                  </span>
                </label>
              )}
            </div>
          </details>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardTitle step="3" title="今日のセルフケア" hint="資料に載るのは、ここで選んだ運動だけです。" />
          <SelectedSummary />
          <Button variant="primary" className="mt-4 w-full" size="lg" onClick={() => setTab("selfcare")}>
            ライブラリからセルフケアを選ぶ
          </Button>
        </Card>

        <Card>
          <CardTitle step="4" title="AIでカルテ・資料を作成" hint="ChatGPT または Claude（無料プランでも可）にコピー＆貼り付けします。自動送信はしません。" />
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
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="lg" className="flex-1" onClick={importAI} disabled={aiText.trim() === ""}>
              ③ 取り込む
            </Button>
            {undoImport && (
              <Button variant="ghost" onClick={undoImport}>
                取り込み前に戻す
              </Button>
            )}
          </div>
          {errors.length > 0 && (
            <div className="mt-3">
              <Notice tone="error" title="取り込めませんでした（貼り付けた内容はそのまま残っています）">
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
                  <Button size="sm" onClick={() => setTab("karte")}>カルテを確認</Button>
                  <Button size="sm" onClick={() => setTab("document")}>患者資料を確認</Button>
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
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-navy-700"
              onClick={() => setAiText(SAMPLE_AI_RESPONSE)}
              title="架空サンプルのAI返答を貼り付けます（動作確認用）"
            >
              返答例（架空）を貼る
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
