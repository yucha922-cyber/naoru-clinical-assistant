import { useMemo, useState } from "react";
import { useApp } from "../state";
import { findExercise } from "../data/selfcare";
import { PatientDocument, type ResolvedSelection } from "../components/PatientDocument";
import { Button, Card, CardTitle, Notice } from "../components/ui";
import { waitForImages } from "../lib/images";

export function DocumentScreen() {
  const { session, dispatch, setTab, brokenImages } = useApp();
  const [printing, setPrinting] = useState(false);
  const [guides, setGuides] = useState(true);
  const doc = session.patientDoc;

  const items: ResolvedSelection[] = useMemo(
    () =>
      session.selections.flatMap((selection) => {
        const exercise = findExercise(selection.slug);
        return exercise ? [{ selection, exercise }] : [];
      }),
    [session.selections],
  );
  const unknownIds = session.selections.filter((s) => !findExercise(s.slug)).map((s) => s.slug);
  const brokenInDoc = items.flatMap((it) =>
    it.exercise.images.slice(0, 3).filter((img) => brokenImages.has(img.url)).map(() => it.exercise.title),
  );

  const checks: { tone: "warn" | "error" | "info"; text: string }[] = [];
  if (!doc.currentState.trim()) checks.push({ tone: "warn", text: "① 今のお身体の状態 が未入力です（資料には表示されません）" });
  if (!doc.idealState.trim()) checks.push({ tone: "warn", text: "② 理想のお身体の状態 が未入力です" });
  if (!doc.pointsToMind.trim()) checks.push({ tone: "warn", text: "③ 意識していくこと が未入力です" });
  if (items.length === 0) checks.push({ tone: "warn", text: "④ 今日のセルフケア が選択されていません" });
  if (brokenInDoc.length) checks.push({ tone: "error", text: `画像を読み込めません: ${[...new Set(brokenInDoc)].join("、")}（ネット接続・URLを確認）` });
  if (unknownIds.length) checks.push({ tone: "error", text: `存在しない運動ID（資料に載りません）: ${unknownIds.join(", ")}` });
  if (session.pendingExercises.length)
    checks.push({ tone: "warn", text: `確認待ちの運動があります（資料に載りません）: ${session.pendingExercises.join("、")}` });
  items
    .filter((i) => i.exercise.images.length === 0)
    .forEach((i) => checks.push({ tone: "info", text: `「${i.exercise.title}」はライブラリに画像がありません` }));

  const print = async () => {
    setPrinting(true);
    const root = document.getElementById("print-root");
    const result = root ? await waitForImages(root, 10000) : { failed: 0, pending: 0 };
    setPrinting(false);
    if (result.failed + result.pending > 0) {
      const ok = window.confirm(
        `読み込めていない画像が ${result.failed + result.pending} 枚あります。このまま印刷しますか？`,
      );
      if (!ok) return;
    }
    const title = document.title;
    document.title = `セルフケアのご案内_${session.meta.visitDate.replaceAll("-", "")}`;
    window.print();
    document.title = title;
  };

  return (
    <div className="print-shell grid grid-cols-[minmax(0,1fr)] gap-5 2xl:grid-cols-[440px_minmax(0,1fr)]">
      <div className="no-print space-y-5">
        <Card>
          <CardTitle title="患者説明資料の文章" hint="専門用語を避け、短くわかりやすく。原因や効果を断定しない表現にしてください。" />
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-sec-pink">① 今のお身体の状態</span>
              <textarea className="field mt-1" rows={5} value={doc.currentState} onChange={(e) => dispatch({ type: "setPatientDoc", patch: { currentState: e.target.value } })} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-sec-blue">② 理想のお身体の状態</span>
              <textarea className="field mt-1" rows={4} value={doc.idealState} onChange={(e) => dispatch({ type: "setPatientDoc", patch: { idealState: e.target.value } })} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-sec-green">③ 意識していくこと</span>
              <span className="ml-2 text-xs text-slate-500">1行に1項目</span>
              <textarea className="field mt-1" rows={5} value={doc.pointsToMind} onChange={(e) => dispatch({ type: "setPatientDoc", patch: { pointsToMind: e.target.value } })} />
            </label>
            <div>
              <p className="text-sm font-bold text-navy-900">④ 今日のセルフケア（{items.length}種目）</p>
              <p className="mt-1 text-xs text-slate-500">施術者が選択した運動だけが表示されます。回数・ひとことはセルフケア選択画面で編集できます。</p>
              <Button size="sm" className="mt-2" onClick={() => setTab("selfcare")}>
                セルフケアを選ぶ・編集する
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle title="印刷前チェック" />
          {checks.length === 0 ? (
            <Notice tone="ok">問題は見つかりませんでした。</Notice>
          ) : (
            <ul className="space-y-2" data-testid="preflight">
              {checks.map((c) => (
                <li key={c.text}>
                  <Notice tone={c.tone}>{c.text}</Notice>
                </li>
              ))}
            </ul>
          )}
          <Button variant="gold" size="lg" className="mt-4 w-full" onClick={print} disabled={printing}>
            {printing ? "画像を読み込み中…" : "PDFを出力（印刷）"}
          </Button>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            印刷画面で「送信先: PDFに保存」、用紙サイズ A4・倍率 100%・余白「なし」または「デフォルト」・「背景のグラフィック」をオンにしてください。
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            プレビューに改ページの目安線（A4の高さごと）を表示
          </label>
        </Card>
      </div>

      <div className="print-shell overflow-x-auto rounded-2xl bg-slate-200/70 p-4 sm:p-6">
        <PatientDocument session={session} items={items} guides={guides} />
      </div>
    </div>
  );
}
