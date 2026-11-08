import { useLayoutEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import { findExercise } from "../data/selfcare";
import { PatientDocument, type ResolvedSelection } from "../components/PatientDocument";
import { FitToWidth } from "../components/FitToWidth";
import { MIND_ICON_COMPONENTS } from "../doc/mindIcons";
import { PostureFigure } from "../doc/PostureFigure";
import { BODY_AREAS, MIND_ICONS, POSTURES, guessMindIcon, type MindIcon } from "../doc/postures";
import { splitLines, type ChangeItem, type MindItem } from "../domain/session";

import { countPages, type Density } from "../doc/density";

/** 箇条書き欄の目安（1枚に収めて、パッと読めるように） */
const MAX_POINTS = 3;
const MAX_POINT_CHARS = 30;
import { Button, Card, CardTitle, Notice } from "../components/ui";
import { waitForImages } from "../lib/images";

export function DocumentScreen() {
  const { session, dispatch, setTab, brokenImages } = useApp();
  const [printing, setPrinting] = useState(false);
  const [guides, setGuides] = useState(true);
  const [showSteps, setShowSteps] = useState(false);
  const doc = session.patientDoc;
  const patch = (p: Partial<typeof doc>) => dispatch({ type: "setPatientDoc", patch: p });

  // ---- ページ数の計算と、写真の大きさの自動調整 ----
  // 印刷時と同じ考え方（カードは途中で分けない）でページ数を数える。
  // 写真・イラスト・余白を1段階小さくするとページ数が減る場合だけ小さくする（文字は小さくしない）。
  const [fit, setFit] = useState<{ density: Density; base: number | null; settled: boolean }>({ density: 0, base: null, settled: false });
  const [pages, setPages] = useState(1);
  // 内容が変わったら、標準の大きさから測り直す
  const layoutKey = JSON.stringify([doc, session.selections, session.meta, showSteps]);
  const [prevLayoutKey, setPrevLayoutKey] = useState(layoutKey);
  if (prevLayoutKey !== layoutKey) {
    setPrevLayoutKey(layoutKey);
    setFit({ density: 0, base: null, settled: false });
  }
  useLayoutEffect(() => {
    const content = document.getElementById("doc-content");
    const sheet = content?.closest<HTMLElement>('[data-testid="a4-sheet"]');
    if (!content || !sheet) return;
    // ResizeObserver は監視開始時にも1回呼ばれる
    const ro = new ResizeObserver(() => {
      const sheetWidth = sheet.getBoundingClientRect().width;
      if (sheetWidth < 10) return; // 非表示のタブでは測らない
      // 画面上の縮小表示（FitToWidth）の影響を受けないよう、A4の幅（210mm）との比で mm に直す
      const n = countPages(content, 210 / sheetWidth);
      setPages(n);
      setFit((f) => {
        if (f.settled) return f;
        if (f.density === 0) return n > 1 ? { density: 1, base: n, settled: false } : { ...f, settled: true };
        // 小さくしてもページ数が減らないなら、標準の大きさに戻す
        return n < (f.base ?? n) ? { ...f, settled: true } : { density: 0, base: f.base, settled: true };
      });
    });
    ro.observe(content);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [fit, layoutKey]);

  const pointIssues = (label: string, text: string) => {
    const lines = splitLines(text);
    const out: string[] = [];
    if (lines.length > MAX_POINTS) out.push(`${label} は${MAX_POINTS}項目までにすると読みやすくなります（今 ${lines.length} 項目）`);
    const long = lines.filter((l) => l.length > MAX_POINT_CHARS);
    if (long.length) out.push(`${label} に長い項目があります（${MAX_POINT_CHARS}文字以内が目安）`);
    return out;
  };

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
  if (pages > 1)
    checks.push({ tone: "info", text: `内容が多いため ${pages} ページになります（文字は小さくせず、運動カードはページの途中で分かれません）。1枚にしたい場合は、文章を短くするか「手順も載せる」をオフにしてください` });
  if (!doc.goal.trim()) checks.push({ tone: "warn", text: "本人の希望（HOPE）が未確認です（資料の「あなたの目標」は表示されません）" });
  if (!doc.currentPoints.trim()) checks.push({ tone: "warn", text: "今のお身体の状態 が未入力です（資料には表示されません）" });
  if (!doc.idealPoints.trim()) checks.push({ tone: "warn", text: "これから目指すお身体の状態 が未入力です" });
  if (!doc.mindItems.some((m) => m.text.trim())) checks.push({ tone: "warn", text: "日常生活で意識すること が未入力です" });
  if (doc.changes.length === 0) checks.push({ tone: "info", text: "今日確認できた変化：施術前後の記録が無いため表示しません（評価した場合は入力してください）" });
  if (!doc.nextGoal.trim()) checks.push({ tone: "info", text: "次回来院までの目標 が未入力です" });
  if (!doc.posture) checks.push({ tone: "info", text: "姿勢イラストが未選択です（実際に評価した姿勢があれば選んでください）" });
  [...pointIssues("今のお身体の状態", doc.currentPoints), ...pointIssues("これから目指すお身体の状態", doc.idealPoints)].forEach((t) => checks.push({ tone: "info", text: t }));
  if (items.length === 0) checks.push({ tone: "warn", text: "今日のセルフケア が選択されていません" });
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
          <CardTitle title="患者説明資料の内容" hint="専門用語を使わず、短い言葉で。原因や効果を断定しない表現にしてください。" />
          <div className="space-y-5">
            <div>
              <label className="block">
                <span className="text-sm font-bold text-gold">あなたの目標（本人の希望・HOPE）</span>
                <span className="ml-2 text-xs text-slate-500">本人の言葉に近い形で</span>
                <input className="field mt-1" value={doc.goal} onChange={(e) => patch({ goal: e.target.value })} placeholder="例: 仕事終わりも肩の重さを気にせず過ごしたい" />
              </label>
              {!doc.goal.trim() && (
                <p className="mt-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200" data-testid="hope-missing">
                  本人の希望（HOPE）が未確認です。問診で確認して入力してください。「姿勢改善」などの抽象的な目標は入れないでください。
                </p>
              )}
            </div>
            <label className="block">
              <span className="text-sm font-bold text-sec-pink">今のお身体の状態</span>
              <span className="ml-2 text-xs text-slate-500">評価で確認できた特徴・1行1項目・3項目まで</span>
              <textarea className="field mt-1" rows={3} value={doc.currentPoints} onChange={(e) => patch({ currentPoints: e.target.value })} placeholder={"例: 首を右に向ける動きに制限がみられました"} />
            </label>
            <ChangesEditor items={doc.changes} onChange={(changes) => patch({ changes })} />
            <label className="block">
              <span className="text-sm font-bold text-sec-blue">これから目指すお身体の状態</span>
              <span className="ml-2 text-xs text-slate-500">本人の希望に沿った、生活の中での目標</span>
              <textarea className="field mt-1" rows={3} value={doc.idealPoints} onChange={(e) => patch({ idealPoints: e.target.value })} placeholder={"例: 長時間のデスクワーク後も首や肩を楽に動かせる"} />
            </label>

            <div>
              <p className="text-sm font-bold text-navy-900">姿勢のイラスト（①②に表示）</p>
              <div className="mt-2 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="姿勢のイラスト">
                <button
                  type="button"
                  role="radio"
                  aria-checked={doc.posture === null}
                  onClick={() => patch({ posture: null })}
                  className={`flex aspect-[3/4] items-center justify-center rounded-lg text-xs ring-1 ${doc.posture === null ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-500 ring-navy-100"}`}
                >
                  なし
                </button>
                {POSTURES.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={doc.posture === p.key}
                    title={p.label}
                    onClick={() => patch({ posture: p.key })}
                    className={`rounded-lg bg-white p-0.5 ring-1 ${doc.posture === p.key ? "ring-2 ring-gold" : "ring-navy-100 hover:ring-navy-700"}`}
                  >
                    <PostureFigure posture={p.key} guides={false} className="aspect-[3/4] w-full" title={p.label} />
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">{doc.posture ? POSTURES.find((p) => p.key === doc.posture)?.label : "検査結果に当てはまるものを選んでください"}</p>
            </div>

            <div>
              <p className="text-sm font-bold text-navy-900">気になる部位（イラストに印）</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BODY_AREAS.map((a) => {
                  const on = doc.focusAreas.includes(a.key);
                  return (
                    <button
                      key={a.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => patch({ focusAreas: on ? doc.focusAreas.filter((x) => x !== a.key) : [...doc.focusAreas, a.key] })}
                      className={`rounded-full px-3 py-1 text-sm ${on ? "bg-sec-pink text-white" : "bg-white text-navy-800 ring-1 ring-navy-100"}`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <MindEditor items={doc.mindItems} onChange={(mindItems) => patch({ mindItems })} />

            <div className="space-y-3">
              <label className="block">
                <span className="text-sm font-bold text-navy-900">次回来院までの目標</span>
                <span className="ml-2 text-xs text-slate-500">選んだセルフケアをもとに、自宅で取り組むこと</span>
                <textarea className="field mt-1" rows={2} value={doc.nextGoal} onChange={(e) => patch({ nextGoal: e.target.value })} placeholder="例: 胸筋ストレッチを無理のない範囲で続け、仕事終わりの肩の状態を確かめましょう" />
              </label>
              <label className="block">
                <span className="text-sm font-bold text-navy-900">次回確認すること</span>
                <span className="ml-2 text-xs text-slate-500">次回の評価項目（任意）</span>
                <input className="field mt-1" value={doc.nextCheck} onChange={(e) => patch({ nextCheck: e.target.value })} placeholder="例: 首を回す動きと肩の位置をもう一度確認します" />
              </label>
            </div>

            <div>
              <p className="text-sm font-bold text-navy-900">今日のセルフケア（{items.length}種目）</p>
              <p className="mt-1 text-xs text-slate-500">施術者が選択した運動だけが表示されます。回数・ひとことはセルフケア選択画面で編集できます。1種目は横長、2種目以上は2列で表示します。運動の目的はライブラリの説明を使います（セルフケア選択画面で追記できます）。</p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showSteps} onChange={(e) => setShowSteps(e.target.checked)} />
                やり方（手順）の文章も載せる
              </label>
              <Button size="sm" className="mt-2" onClick={() => setTab("selfcare")}>
                セルフケアを選ぶ・編集する
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle title="印刷前チェック" />
          <p className="mb-3 text-sm font-semibold" data-testid="page-count">
            {pages === 1 ? "✓ A4 1枚に収まっています" : `A4 ${pages} ページ`}
          </p>
          {fit.density > 0 && (
            <p className="-mt-2 mb-3 text-xs text-slate-500" data-testid="fit-note">
              ページ数を減らすため、写真・イラストを少し小さくしています（文字の大きさは変えていません）
            </p>
          )}
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

      <div className="print-shell rounded-2xl bg-slate-200/70 p-3 sm:p-5">
        <p className="no-print mb-2 text-center text-xs text-slate-500">資料の全体プレビュー（画面に合わせて縮小表示。印刷・PDFは実寸のA4です）</p>
        <FitToWidth>
          <PatientDocument session={session} items={items} guides={guides} showSteps={showSteps} density={fit.density} />
        </FitToWidth>
      </div>
    </div>
  );
}

function MindEditor({ items, onChange }: { items: MindItem[]; onChange: (items: MindItem[]) => void }) {
  const update = (i: number, p: Partial<MindItem>) => onChange(items.map((m, j) => (j === i ? { ...m, ...p } : m)));
  return (
    <div>
      <p className="text-sm font-bold text-sec-green">③ 意識していくこと</p>
      <p className="text-xs text-slate-500">アイコンとひとこと（25文字前後）。3項目までがおすすめです。</p>
      <ul className="mt-2 space-y-2">
        {items.map((m, i) => {
          const Icon = MIND_ICON_COMPONENTS[m.icon];
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sec-green text-white">
                <Icon size={18} aria-hidden />
              </span>
              <select
                className="field w-28 shrink-0 px-2 py-2 text-xs"
                value={m.icon}
                onChange={(e) => update(i, { icon: e.target.value as MindIcon })}
                aria-label="アイコン"
              >
                {MIND_ICONS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
              <input
                className="field min-w-0 py-2 text-sm"
                value={m.text}
                onChange={(e) => update(i, { text: e.target.value })}
                onBlur={() => m.icon === "check" && update(i, { icon: guessMindIcon(m.text) })}
                placeholder="例: 1時間に1回は肩を回す"
                aria-label={`意識すること ${i + 1}`}
              />
              <button type="button" className="shrink-0 px-1 text-xs text-slate-400 hover:text-red-700" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                削除
              </button>
            </li>
          );
        })}
      </ul>
      <Button size="sm" className="mt-2" disabled={items.length >= 4} onClick={() => onChange([...items, { icon: "check", text: "" }])}>
        ＋ 項目を追加
      </Button>
    </div>
  );
}

function ChangesEditor({ items, onChange }: { items: ChangeItem[]; onChange: (items: ChangeItem[]) => void }) {
  const update = (i: number, p: Partial<ChangeItem>) => onChange(items.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div data-testid="changes-editor">
      <p className="text-sm font-bold text-[#2a7f8f]">今日確認できた変化</p>
      <p className="text-xs text-slate-500">施術前後に評価した場合だけ入力します（角度・痛みのスコアは実測値のみ）。空欄なら資料に表示しません。</p>
      <ul className="mt-2 space-y-2">
        {items.map((c, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5">
            <input className="field px-2 py-2 text-sm" value={c.item} onChange={(e) => update(i, { item: e.target.value })} placeholder="何の変化か" aria-label={`変化 ${i + 1} の内容`} />
            <input className="field px-2 py-2 text-sm" value={c.before} onChange={(e) => update(i, { before: e.target.value })} placeholder="施術前" aria-label={`変化 ${i + 1} の施術前`} />
            <input className="field px-2 py-2 text-sm" value={c.after} onChange={(e) => update(i, { after: e.target.value })} placeholder="施術後" aria-label={`変化 ${i + 1} の施術後`} />
            <button type="button" className="px-1 text-xs text-slate-400 hover:text-red-700" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              削除
            </button>
          </li>
        ))}
      </ul>
      <Button size="sm" className="mt-2" disabled={items.length >= 3} onClick={() => onChange([...items, { item: "", before: "", after: "" }])}>
        ＋ 変化を追加
      </Button>
    </div>
  );
}
