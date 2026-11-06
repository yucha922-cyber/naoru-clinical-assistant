import { useState } from "react";
import { useApp } from "../state";
import { findExercise } from "../data/selfcare";
import { Notice } from "./ui";

/** 選択済みセルフケアの要約・存在しないID・確認待ちの表示 */
export function SelectedSummary({ compact = false }: { compact?: boolean }) {
  const { session, dispatch } = useApp();
  const [pendingName, setPendingName] = useState("");
  const unknown = session.selections.filter((s) => !findExercise(s.slug));
  const known = session.selections.filter((s) => findExercise(s.slug));

  return (
    <div className="space-y-3">
      {known.length === 0 ? (
        <p className="rounded-xl bg-navy-50 px-4 py-3 text-sm text-slate-500">まだ選択されていません。</p>
      ) : (
        <ol className="space-y-2">
          {known.map((s, i) => {
            const ex = findExercise(s.slug)!;
            return (
              <li key={s.slug} className="flex items-center gap-3 rounded-xl bg-navy-50 px-3 py-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{ex.title}</span>
                  {s.dosage && <span className="block truncate text-xs text-slate-500">{s.dosage}</span>}
                </span>
                {!compact && (
                  <button
                    type="button"
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-red-700"
                    onClick={() => dispatch({ type: "removeSelection", slug: s.slug })}
                    aria-label={`${ex.title} を外す`}
                  >
                    外す
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {unknown.length > 0 && (
        <Notice tone="error" title="ライブラリに存在しない運動IDがあります（資料には載りません）">
          <ul className="space-y-1">
            {unknown.map((s) => (
              <li key={s.slug} className="flex items-center justify-between gap-2">
                <code>{s.slug}</code>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => dispatch({ type: "removeSelection", slug: s.slug })}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {session.pendingExercises.length > 0 && (
        <Notice tone="warn" title="確認待ち（ライブラリで特定できない運動・資料には載りません）">
          <ul className="space-y-1">
            {session.pendingExercises.map((name) => (
              <li key={name} className="flex items-center justify-between gap-2">
                <span>{name}</span>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => dispatch({ type: "removePending", name })}
                >
                  確認済みにして消す
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">該当する運動をライブラリから選び直すか、確認後に消してください。</p>
        </Notice>
      )}

      {!compact && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({ type: "addPending", name: pendingName });
            setPendingName("");
          }}
        >
          <input
            className="field py-2 text-sm"
            value={pendingName}
            onChange={(e) => setPendingName(e.target.value)}
            placeholder="ライブラリに無い運動を確認待ちに追加"
            aria-label="確認待ちに追加する運動名"
          />
          <button
            type="submit"
            className="shrink-0 rounded-xl px-3 text-sm font-semibold text-navy-700 ring-1 ring-navy-100 hover:ring-navy-700 disabled:opacity-40"
            disabled={pendingName.trim() === ""}
          >
            追加
          </button>
        </form>
      )}
    </div>
  );
}
