import { useEffect } from "react";
import { useApp, type Tab } from "./state";
import { hasUserInput, emptySession } from "./domain/session";
import { SAMPLE_SESSION } from "./samples/sampleCase";
import { InputScreen } from "./screens/InputScreen";
import { KarteScreen } from "./screens/KarteScreen";
import { DocumentScreen } from "./screens/DocumentScreen";
import { SelfcareScreen } from "./screens/SelfcareScreen";
import { Button } from "./components/ui";
import { APP_CONFIG } from "./config/app";
import { WorkflowSteps } from "./components/WorkflowSteps";

// 通常業務の順番: 入力・AI作成 → カルテ確認 → セルフケア選択 → 患者説明資料（PDF）
const TABS: { id: Tab; num: string; label: string }[] = [
  { id: "input", num: "1", label: "カルテ入力" },
  { id: "karte", num: "2", label: "カルテ確認" },
  { id: "selfcare", num: "3", label: "セルフケア選択" },
  { id: "document", num: "4", label: "患者説明資料" },
];

export default function App() {
  const { session, dispatch, tab, setTab, toast, notify } = useApp();
  const dirty = hasUserInput(session);

  // ページを閉じる・再読み込みすると入力内容が消えるため、確認を出す
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const loadSample = () => {
    if (dirty && !window.confirm("今の入力内容を消して、架空のサンプルを読み込みますか？")) return;
    dispatch({ type: "replace", session: structuredClone(SAMPLE_SESSION) });
    setTab("input");
    notify("架空のサンプルを読み込みました");
  };

  const clearAll = () => {
    if (!window.confirm("入力内容をすべて消去します。よろしいですか？（元に戻せません）")) return;
    dispatch({ type: "replace", session: emptySession() });
    setTab("input");
    notify("すべて消去しました");
  };

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 bg-navy-900 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <div className="mr-auto">
            <p className="text-[11px] font-medium tracking-[0.3em] text-gold-light">{APP_CONFIG.clinicName}</p>
            <h1 className="text-lg font-bold tracking-wide sm:text-xl">Clinical Assistant</h1>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-white/90 hover:bg-white/10" onClick={loadSample}>
              サンプル（架空）
            </Button>
            <Button size="sm" variant="ghost" className="text-white/90 hover:bg-white/10" onClick={clearAll}>
              すべて消去
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 sm:px-4" aria-label="画面切り替え">
          {TABS.map((t) => {
            const active = tab === t.id;
            const badge = t.id === "selfcare" && session.selections.length > 0 ? session.selections.length : null;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-t-xl px-4 py-3 text-[15px] font-semibold transition ${
                  active ? "bg-navy-50 text-navy-900" : "text-white/75 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    active ? "bg-navy-900 text-white" : "bg-white/15"
                  }`}
                >
                  {t.num}
                </span>
                {t.label}
                {badge !== null && (
                  <span className="rounded-full bg-gold px-2 text-xs font-bold text-white">{badge}</span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <WorkflowSteps />

      <div className="no-print mx-auto max-w-7xl px-4 pt-3 sm:px-6">
        <p className="rounded-xl bg-white px-4 py-2 text-xs text-slate-600 ring-1 ring-navy-100">
          🔒 入力内容はこの画面（メモリ）にだけ保持され、どこにも自動送信・保存されません。
          <strong className="text-navy-900">タブを閉じる・再読み込みすると消えます。</strong>
          初期版のため、実際の患者情報での運用は安全性の確認後に行ってください。
        </p>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {/* タブを切り替えても各画面の状態（AIの生成中の表示・検索条件など）を残すため、隠すだけにする */}
        <div hidden={tab !== "input"} data-screen="input">
          <InputScreen />
        </div>
        <div hidden={tab !== "selfcare"} data-screen="selfcare">
          <SelfcareScreen />
        </div>
        <div hidden={tab !== "karte"} data-screen="karte">
          <KarteScreen />
        </div>
        <div hidden={tab !== "document"} data-screen="document">
          <DocumentScreen />
        </div>
      </main>

      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy-900 px-5 py-3 text-sm font-semibold text-white shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
