import { useCallback, useEffect, useState } from "react";
import { findExercise } from "../data/selfcare";

// セルフケアの「お気に入り」と「最近使った運動」の設定。
// ★ ブラウザ（localStorage）に保存するのは、セルフケアライブラリの運動ID（slug）だけ。
//   患者さんの氏名・メモ・カルテなどの患者情報は、ここには一切保存しない。
//   読み込み時も、ライブラリに実在する運動IDだけを受け付ける。

export const PREFS_KEY = "naoru.selfcarePrefs.v1";
const MAX_RECENT = 8;

export type Prefs = { favorites: string[]; recent: string[] };

const SLUG = /^[a-z0-9-]{1,80}$/;
const clean = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && SLUG.test(x) && !!findExercise(x)))] : [];

export function loadPrefs(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): Prefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    const data = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return { favorites: clean(data.favorites), recent: clean(data.recent).slice(0, MAX_RECENT) };
  } catch {
    return { favorites: [], recent: [] };
  }
}

function savePrefs(p: Prefs) {
  try {
    globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify({ favorites: clean(p.favorites), recent: clean(p.recent) }));
  } catch {
    /* 保存できない環境（プライベートモード等）では、このページを開いている間だけ有効 */
  }
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  useEffect(() => savePrefs(prefs), [prefs]);

  const toggleFavorite = useCallback(
    (slug: string) =>
      setPrefs((p) => ({ ...p, favorites: p.favorites.includes(slug) ? p.favorites.filter((s) => s !== slug) : [...p.favorites, slug] })),
    [],
  );
  const addRecent = useCallback((slug: string) => setPrefs((p) => ({ ...p, recent: [slug, ...p.recent.filter((s) => s !== slug)].slice(0, MAX_RECENT) })), []);
  const clearRecent = useCallback(() => setPrefs((p) => ({ ...p, recent: [] })), []);

  return { prefs, toggleFavorite, addRecent, clearRecent };
}
