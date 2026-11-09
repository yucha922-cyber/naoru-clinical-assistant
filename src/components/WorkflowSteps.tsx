import { useApp, type Tab } from "../state";
import { useClinicalChecks } from "../review/useClinicalChecks";
import { findExercise } from "../data/selfcare";

type Step = { num: number; label: string; tab: Tab; done: boolean; warn?: string };

/**
 * 通常業務の流れ（4つの工程＝上のタブと同じ順番）と、それぞれの進み具合を表示する。押すとその作業の画面へ移動する。
 * 「施術内容の入力」と「AIで作成」は同じ画面で続けて行う作業のため、1つの工程にまとめている。
 * セルフケアの選択は、AIで作成する前でも後でもよい。
 */
export function WorkflowSteps() {
  const { session, tab, setTab } = useApp();
  const { openWarnings } = useClinicalChecks();
  const generated = Object.values(session.karte).some((v) => v.trim()) || session.patientDoc.currentPoints.trim() !== "";
  const unknown = session.selections.some((s) => !findExercise(s.slug));

  const steps: Step[] = [
    {
      num: 1,
      label: "施術内容を入力・AIで作成",
      tab: "input",
      done: generated,
      warn: session.memo.trim() !== "" && !generated ? "AI未作成" : undefined,
    },
    {
      num: 2,
      label: "内容を確認・修正",
      tab: "karte",
      done: session.review.karteConfirmed && session.review.docConfirmed,
      warn: openWarnings > 0 ? `要確認 ${openWarnings}件` : generated && !(session.review.karteConfirmed && session.review.docConfirmed) ? "未確認" : undefined,
    },
    {
      num: 3,
      label: "セルフケアを選択",
      tab: "selfcare",
      done: session.selections.length > 0 && !unknown && session.pendingExercises.length === 0,
      warn: session.pendingExercises.length ? `確認待ち ${session.pendingExercises.length}件` : unknown ? "存在しないID" : undefined,
    },
    { num: 4, label: "カルテコピー・PDF出力", tab: "document", done: session.output.karteCopied && session.output.pdfPrinted },
  ];
  const current = steps.find((s) => !s.done)?.num ?? steps.length + 1;

  return (
    <nav className="no-print mx-auto max-w-7xl px-4 pt-3 sm:px-6" aria-label="作業の流れ" data-testid="workflow-steps">
      <ol className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-navy-100">
        {steps.map((s) => {
          const isCurrent = s.num === current;
          const onTab = s.tab === tab;
          return (
            <li key={s.num} className="min-w-[8.5rem] flex-1">
              <button
                type="button"
                onClick={() => setTab(s.tab)}
                className={`flex h-full w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                  isCurrent ? "bg-navy-900 text-white" : onTab ? "bg-navy-50" : "hover:bg-navy-50"
                }`}
                aria-current={isCurrent ? "step" : undefined}
                data-step={s.num}
                data-done={s.done}
              >
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    s.done ? "bg-emerald-600 text-white" : isCurrent ? "bg-gold text-white" : "bg-navy-100 text-navy-800"
                  }`}
                >
                  {s.done ? "✓" : s.num}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">{s.label}</span>
                  {s.warn && !s.done && (
                    <span className={`mt-0.5 block text-[11px] font-bold ${isCurrent ? "text-gold-light" : "text-amber-700"}`}>！{s.warn}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
