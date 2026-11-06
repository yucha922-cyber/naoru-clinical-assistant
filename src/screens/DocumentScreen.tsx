import { useLayoutEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import { findExercise } from "../data/selfcare";
import { PatientDocument, type ResolvedSelection } from "../components/PatientDocument";
import { FitToWidth } from "../components/FitToWidth";
import { MIND_ICON_COMPONENTS } from "../doc/mindIcons";
import { PostureFigure } from "../doc/PostureFigure";
import { BODY_AREAS, MIND_ICONS, POSTURES, guessMindIcon, type MindIcon } from "../doc/postures";
import { splitLines, type MindItem } from "../domain/session";

import { FIT_TARGET_MM, MIN_ZOOM, PAGE_CONTENT_MM, type Density } from "../doc/density";

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

  // ---- A4 1枚に自動で収める ----
  // 高さを測り、はみ出す場合は ①写真・イラストを小さく（2段階）→ ②資料全体を縮小 の順に詰める。
  const [fit, setFit] = useState<{ density: Density; zoom: number }>({ density: 0, zoom: 1 });
  const [contentMm, setContentMm] = useState(0);
  // 内容が変わったら、標準の大きさから測り直す
  const layoutKey = JSON.stringify([doc, session.selections, session.meta, showSteps]);
  const [prevLayoutKey, setPrevLayoutKey] = useState(layoutKey);
  if (prevLayoutKey !== layoutKey) {
    setPrevLayoutKey(layoutKey);
    setFit({ density: 0, zoom: 1 });
  }
  useLayoutEffect(() => {
    const content = document.getElementById("doc-content");
    const sheet = content?.closest<HTMLElement>('[data-testid="a4-sheet"]');
    if (!content || !sheet) return;
    // ResizeObserver は監視開始時にも1回呼ばれる
    const ro = new ResizeObserver(() => {
      const sheetWidth = sheet.getBoundingClientRect().width;
      if (sheetWidth < 10) return; // 非表示のタブでは測らない
      // 画面上の縮小表示（FitToWidth）の影響を受けないよう、A4の幅（210mm）との比で高さを求める
      const mm = (content.getBoundingClientRect().height / sheetWidth) * 210;
      setContentMm(mm);
      setFit((f) => {
        if (mm <= FIT_TARGET_MM) return f;
        if (f.density < 2) return { density: (f.density + 1) as Density, zoom: 1 };
        if (f.zoom <= MIN_ZOOM) return f;
        const next = Math.max(MIN_ZOOM, Math.floor(((f.zoom * FIT_TARGET_MM) / mm) * 100) / 100);
        return { ...f, zoom: next < f.zoom ? next : Math.max(MIN_ZOOM, f.zoom - 0.01) };
      });
    });
    ro.observe(content);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [fit, layoutKey]);
  const pages = contentMm > PAGE_CONTENT_MM ? Math.ceil(contentMm / PAGE_CONTENT_MM - 0.005) : 1;

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
    checks.push({ tone: "warn", text: `最小まで縮小しても1枚に収まりません（${pages} ページ）。文章を短くするか、「手順も載せる」をオフにするか、セルフケアの種目を減らしてください` });
  else if (fit.zoom < 0.85)
    checks.push({ tone: "warn", text: `1枚に収めるため、資料全体を ${Math.round(fit.zoom * 100)}% に縮小しています。文字が小さいので、読みやすくするには文章を短くするか「手順も載せる」をオフにしてください` });
  if (!doc.currentPoints.trim()) checks.push({ tone: "warn", text: "① 今のお身体の状態 が未入力です（資料には表示されません）" });
  if (!doc.idealPoints.trim()) checks.push({ tone: "warn", text: "② 理想のお身体の状態 が未入力です" });
  if (!doc.mindItems.some((m) => m.text.trim())) checks.push({ tone: "warn", text: "③ 意識していくこと が未入力です" });
  if (!doc.posture) checks.push({ tone: "info", text: "姿勢イラストが未選択です（選ぶと①②に今と理想のイラストが入ります）" });
  [...pointIssues("①", doc.currentPoints), ...pointIssues("②", doc.idealPoints)].forEach((t) => checks.push({ tone: "info", text: t }));
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
          <CardTitle title="患者説明資料の内容" hint="専門用語を使わず、短い言葉で。原因や効果を断定しない表現にしてください。" />
          <div className="space-y-5">
            <label className="block">
              <span className="text-sm font-bold text-gold">目標</span>
              <span className="ml-2 text-xs text-slate-500">本人の希望（HOPE）をもとに20文字前後</span>
              <input className="field mt-1" value={doc.goal} onChange={(e) => patch({ goal: e.target.value })} placeholder="例: 仕事のあとも肩を気にせず過ごす" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-sec-pink">① 今のお身体の状態</span>
              <span className="ml-2 text-xs text-slate-500">1行に1項目・3項目まで</span>
              <textarea className="field mt-1" rows={3} value={doc.currentPoints} onChange={(e) => patch({ currentPoints: e.target.value })} placeholder={"例: 頭が少し前に出た姿勢になりやすい"} />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-sec-blue">② 理想のお身体の状態</span>
              <span className="ml-2 text-xs text-slate-500">①と同じ順番で対応させると、違いが伝わります</span>
              <textarea className="field mt-1" rows={3} value={doc.idealPoints} onChange={(e) => patch({ idealPoints: e.target.value })} placeholder={"例: 頭が背骨の上にのった楽な姿勢"} />
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

            <div>
              <p className="text-sm font-bold text-navy-900">④ 今日のセルフケア（{items.length}種目）</p>
              <p className="mt-1 text-xs text-slate-500">施術者が選択した運動だけが表示されます。回数・ひとことはセルフケア選択画面で編集できます。内容が多いときは、自動で写真を小さくしたり全体を縮小したりして A4 1枚に収めます。</p>
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
          {pages === 1 && (fit.density > 0 || fit.zoom < 1) && (
            <p className="-mt-2 mb-3 text-xs text-slate-500" data-testid="fit-note">
              1枚に収めるため自動で調整しています（
              {[fit.density > 0 ? "写真・イラストを小さく" : null, fit.zoom < 1 ? `全体を${Math.round(fit.zoom * 100)}%に縮小` : null]
                .filter(Boolean)
                .join("・")}
              ）
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
          <PatientDocument session={session} items={items} guides={guides} showSteps={showSteps} density={fit.density} zoom={fit.zoom} />
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
