import { useMemo, useState } from "react";
import { useApp } from "../state";
import { SELFCARE, findExercise, searchExercises, type Exercise } from "../data/selfcare";
import { Button, Card, CardTitle, Chip } from "../components/ui";
import { ExerciseImage, NoImage } from "../components/ExerciseImage";
import { QrCode } from "../components/QrCode";
import { SelectedSummary } from "../components/SelectedSummary";
import { copyText } from "../lib/clipboard";
import { usePrefs } from "../lib/usePrefs";

export function SelfcareScreen() {
  const { session, dispatch, setTab, notify } = useApp();
  const [keyword, setKeyword] = useState("");
  const [symptom, setSymptom] = useState<string | null>(null);
  const [part, setPart] = useState<string | null>(null);
  const [mode, setMode] = useState<"symptom" | "part">("symptom");
  const [onlyFav, setOnlyFav] = useState(false);
  const { prefs, toggleFavorite, addRecent, clearRecent } = usePrefs();
  const favorites = new Set(prefs.favorites);

  const results = useMemo(() => {
    const r = searchExercises(SELFCARE.exercises, { keyword, symptom, part });
    return onlyFav ? r.filter((e) => prefs.favorites.includes(e.slug)) : r;
  }, [keyword, symptom, part, onlyFav, prefs.favorites]);
  const selected = new Set(session.selections.map((s) => s.slug));

  const toggle = (ex: Exercise) => {
    if (!selected.has(ex.slug)) addRecent(ex.slug); // 最近使った運動（運動IDだけを記録）
    dispatch({ type: "toggleExercise", slug: ex.slug, defaultDosage: ex.duration ?? "" });
  };

  const quickRow = (label: string, slugs: string[], testId: string, extra?: React.ReactNode) =>
    slugs.length > 0 && (
      <div className="flex flex-wrap items-center gap-1.5" data-testid={testId}>
        <span className="mr-1 text-xs font-bold text-slate-500">{label}</span>
        {slugs.map((slug) => {
          const ex = findExercise(slug);
          if (!ex) return null;
          const on = selected.has(slug);
          return (
            <button
              key={slug}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(ex)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${on ? "bg-gold text-white" : "bg-navy-50 text-navy-800 ring-1 ring-navy-100 hover:ring-navy-700"}`}
            >
              {on ? "✓ " : "＋ "}
              {ex.title}
            </button>
          );
        })}
        {extra}
      </div>
    );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-col gap-3">
            <input
              type="search"
              className="field text-lg"
              placeholder="キーワードで探す（例: 胸のストレッチ、大胸筋、太もも裏、あご引き）"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              aria-label="キーワード検索"
            />
            <div className="flex gap-2 text-sm">
              <Button size="sm" variant={mode === "symptom" ? "primary" : "ghost"} onClick={() => setMode("symptom")}>
                症状別
              </Button>
              <Button size="sm" variant={mode === "part" ? "primary" : "ghost"} onClick={() => setMode("part")}>
                部位別
              </Button>
              <Button size="sm" variant={onlyFav ? "primary" : "ghost"} onClick={() => setOnlyFav(!onlyFav)} aria-pressed={onlyFav}>
                ★ お気に入りのみ
              </Button>
              {(symptom || part || keyword || onlyFav) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => {
                    setSymptom(null);
                    setPart(null);
                    setKeyword("");
                    setOnlyFav(false);
                  }}
                >
                  条件をクリア
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {mode === "symptom"
                ? SELFCARE.categories.symptoms.map((c) => (
                    <Chip key={c.slug} active={symptom === c.slug} onClick={() => setSymptom(symptom === c.slug ? null : c.slug)}>
                      {c.name}
                    </Chip>
                  ))
                : SELFCARE.categories.parts.map((c) => (
                    <Chip key={c.slug} active={part === c.slug} onClick={() => setPart(part === c.slug ? null : c.slug)}>
                      {c.name}
                    </Chip>
                  ))}
            </div>
            {(prefs.favorites.length > 0 || prefs.recent.length > 0) && (
              <div className="space-y-2 border-t border-navy-100 pt-3">
                {quickRow("★ お気に入り", prefs.favorites, "fav-row")}
                {quickRow(
                  "最近使った",
                  prefs.recent,
                  "recent-row",
                  <button type="button" className="ml-1 text-xs text-slate-400 underline hover:text-navy-700" onClick={clearRecent}>
                    履歴を消す
                  </button>,
                )}
                <p className="text-[11px] text-slate-400">お気に入り・最近使った運動は、この端末のブラウザに運動の種類だけを保存します（患者さんの情報は保存しません）。</p>
              </div>
            )}
          </div>
        </Card>

        <p className="px-1 text-sm text-slate-500">
          {results.length} 件 ／ 全 {SELFCARE.exercises.length} 種目
        </p>
        {results.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-500 ring-1 ring-navy-100">
            条件に合うセルフケアがありません。
          </p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {results.map((ex) => {
            const on = selected.has(ex.slug);
            const fav = favorites.has(ex.slug);
            return (
              <li key={ex.slug} className="relative">
                <button
                  type="button"
                  onClick={() => toggle(ex)}
                  aria-pressed={on}
                  className={`flex h-full w-full gap-3 rounded-2xl bg-white p-3 text-left shadow-sm transition ${
                    on ? "ring-2 ring-gold" : "ring-1 ring-navy-100 hover:ring-navy-700"
                  }`}
                >
                  {ex.images[0] ? (
                    <ExerciseImage url={ex.images[0].url} alt={ex.title} className="h-24 w-24 shrink-0 rounded-xl bg-navy-50" />
                  ) : (
                    <NoImage className="h-24 w-24 shrink-0 rounded-xl" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="pr-7 font-bold leading-snug">{ex.title}</span>
                    {ex.bodyPart.length > 0 && (
                      <span className="mt-0.5 text-[11px] text-slate-400">部位：{ex.bodyPart.map((b) => b.name ?? b.slug).join("・")}</span>
                    )}
                    <span className="mt-1 line-clamp-2 text-xs text-slate-500">{ex.purpose ?? ""}</span>
                    <span className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-xs text-slate-400">{ex.duration ?? "所要時間 未設定"}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          on ? "bg-gold text-white" : "bg-navy-50 text-navy-800"
                        }`}
                      >
                        {on ? "✓ 選択中" : "＋ 選択"}
                      </span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleFavorite(ex.slug)}
                  aria-pressed={fav}
                  aria-label={fav ? `${ex.title} をお気に入りから外す` : `${ex.title} をお気に入りに追加`}
                  title={fav ? "お気に入りから外す" : "お気に入りに追加"}
                  className={`absolute right-2 top-2 rounded-full px-1.5 text-lg leading-none ${fav ? "text-gold" : "text-slate-300 hover:text-gold"}`}
                >
                  {fav ? "★" : "☆"}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="px-1 text-xs text-slate-400">
          データ: selfexercise（コミット {SELFCARE.source.commit?.slice(0, 7) ?? "不明"}）。更新方法は README を参照。
        </p>
      </div>

      <div className="space-y-4 xl:sticky xl:top-36 xl:self-start">
        <Card>
          <CardTitle title={`選択済み（${session.selections.length}）`} hint="回数・時間とひとことを編集できます。上から順に資料へ掲載されます。" />
          {session.selections.length === 0 ? (
            <SelectedSummary />
          ) : (
            <div className="space-y-3">
              {session.selections.map((sel, i) => {
                const ex = findExercise(sel.slug);
                if (!ex) return null;
                return (
                  <div key={sel.slug} className="rounded-xl bg-navy-50 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <p className="flex-1 font-bold">{ex.title}</p>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className="rounded px-2 text-slate-500 hover:bg-white disabled:opacity-30" disabled={i === 0} onClick={() => dispatch({ type: "moveSelection", slug: sel.slug, delta: -1 })} aria-label="上へ">↑</button>
                        <button type="button" className="rounded px-2 text-slate-500 hover:bg-white disabled:opacity-30" disabled={i === session.selections.length - 1} onClick={() => dispatch({ type: "moveSelection", slug: sel.slug, delta: 1 })} aria-label="下へ">↓</button>
                        <button type="button" className="rounded px-2 text-xs text-slate-500 hover:bg-white hover:text-red-700" onClick={() => dispatch({ type: "removeSelection", slug: sel.slug })}>外す</button>
                      </div>
                    </div>
                    <label className="mt-2 block text-xs font-semibold text-slate-600">
                      回数・時間
                      <input
                        className="field mt-1 py-2 text-sm"
                        value={sel.dosage}
                        onChange={(e) => dispatch({ type: "updateSelection", slug: sel.slug, patch: { dosage: e.target.value } })}
                        placeholder="例: 左右20秒×2回／1日2セット"
                      />
                    </label>
                    <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-700" data-testid={`purpose-${sel.slug}`}>
                      <p>
                        <span className="font-bold text-navy-800">どこを動かす運動か：</span>
                        {ex.bodyPart.length ? ex.bodyPart.map((b) => b.name ?? b.slug).join("・") : "ライブラリに記載なし"}
                      </p>
                      <p className="mt-1">
                        <span className="font-bold text-sec-blue">目的（ライブラリ）：</span>
                        {ex.purpose ?? "ライブラリに目的の記載がありません。必要なら下に追記してください（自動では作りません）。"}
                      </p>
                    </div>
                    <label className="mt-2 block text-xs font-semibold text-slate-600">
                      目的を追記・言い換え（任意。入力すると資料ではこちらを表示）
                      <input
                        className="field mt-1 py-2 text-sm"
                        value={sel.purposeNote}
                        onChange={(e) => dispatch({ type: "updateSelection", slug: sel.slug, patch: { purposeNote: e.target.value } })}
                        placeholder="例: 胸の前側をゆっくり伸ばし、肩を動かしやすくするための運動です"
                        aria-label={`${ex.title} の目的の追記`}
                      />
                    </label>
                    <label className="mt-2 block text-xs font-semibold text-slate-600">
                      ひとこと（資料に表示）
                      <input
                        className="field mt-1 py-2 text-sm"
                        value={sel.note}
                        onChange={(e) => dispatch({ type: "updateSelection", slug: sel.slug, patch: { note: e.target.value } })}
                        placeholder="例: 痛みのない範囲でゆっくり"
                      />
                    </label>
                    {ex.precautions.length > 0 && (
                      <div className="mt-2 rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
                        <p className="font-bold text-sec-pink">注意事項</p>
                        <ul className="mt-1 list-disc pl-4">
                          {ex.precautions.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3">
                      <QrCode url={ex.detailUrl} size={64} />
                      <div className="min-w-0 flex-1 text-xs">
                        <a href={ex.detailUrl} target="_blank" rel="noreferrer noopener" className="block truncate text-navy-700 underline">
                          {ex.detailUrl}
                        </a>
                        <button
                          type="button"
                          className="mt-1 font-semibold text-navy-700 hover:underline"
                          onClick={async () => notify((await copyText(ex.detailUrl)) ? "URLをコピーしました" : "コピーできませんでした")}
                        >
                          URLをコピー
                        </button>
                        {ex.requiresMemberCode && <p className="mt-1 text-slate-400">会員コードが必要なページです</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <SelectedSummary compact />
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button size="lg" onClick={() => setTab("karte")}>
              ← カルテ確認へ戻る
            </Button>
            <Button variant="primary" size="lg" onClick={() => setTab("document")}>
              次へ：患者説明資料・PDF →
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
