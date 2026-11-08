import { useApp } from "../state";
import { Button, Card, CardTitle, Notice } from "./ui";
import { useClinicalChecks } from "../review/useClinicalChecks";
import type { CheckArea } from "../review/clinicalCheck";

/** 指摘の該当箇所（入力欄）へ移動する */
function jumpTo(field: string) {
  const el =
    document.querySelector<HTMLElement>(`[data-karte-field="${field}"]`) ?? document.querySelector<HTMLElement>(`[data-doc-field="${field}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = el.matches("input, textarea") ? el : el.querySelector<HTMLElement>("input, textarea, button");
  input?.focus({ preventScroll: true });
}

/**
 * AIが生成した内容を、施術者が確定する前の確認パネル。
 * 元メモとの照合結果（要確認・参考）を表示し、修正するか「確認済み」にしてもらう。
 */
export function ClinicalReview({ area }: { area: CheckArea }) {
  const { session, dispatch } = useApp();
  const { checks, openWarnings } = useClinicalChecks(area);
  const part = area === "karte" ? "karte" : "doc";
  const confirmed = area === "karte" ? session.review.karteConfirmed : session.review.docConfirmed;
  const label = area === "karte" ? "カルテ" : "患者説明資料";
  const hasContent =
    area === "karte"
      ? Object.values(session.karte).some((v) => v.trim())
      : session.patientDoc.currentPoints.trim() !== "" || session.patientDoc.idealPoints.trim() !== "";

  return (
    <Card>
      <CardTitle
        title={`内容の確認（${label}）`}
        hint="AIが作った内容を、元の施術メモと照合して確認が必要な箇所を表示しています。照合は機械的なもので、正しさを保証するものではありません。最終確認は施術者が行ってください。"
      />
      {!session.memo.trim() ? (
        <Notice tone="info">施術メモが空のため、照合できません。</Notice>
      ) : checks.length === 0 ? (
        <Notice tone="ok">元メモとの照合で、指摘はありませんでした。内容を読んで確認してください。</Notice>
      ) : (
        <ul className="space-y-2" data-testid={`review-${area}`}>
          {checks.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl px-3 py-2 text-sm ring-1 ${
                c.approved ? "bg-emerald-50 ring-emerald-200" : c.severity === "warn" ? "bg-amber-50 ring-amber-200" : "bg-navy-50 ring-navy-100"
              }`}
              data-check-id={c.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    c.approved ? "bg-emerald-600 text-white" : c.severity === "warn" ? "bg-amber-500 text-white" : "bg-slate-400 text-white"
                  }`}
                >
                  {c.approved ? "確認済み" : c.severity === "warn" ? "要確認" : "参考"}
                </span>
                <span className="font-semibold text-navy-900">{c.where}</span>
              </div>
              <p className="mt-1 leading-relaxed text-slate-700">{c.message}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => jumpTo(c.field)}>
                  該当箇所を直す
                </Button>
                {c.severity === "warn" && (
                  <Button size="sm" variant={c.approved ? "ghost" : "secondary"} onClick={() => dispatch({ type: "approveCheck", id: c.id, approved: !c.approved })}>
                    {c.approved ? "確認済みを取り消す" : "確認したので問題なし"}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-navy-100 pt-3">
        {confirmed ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-emerald-700" data-testid={`confirmed-${area}`}>
              ✓ {label}の内容を施術者が確認しました
            </p>
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "setConfirmed", part, value: false })}>
              取り消す
            </Button>
          </div>
        ) : (
          <>
            <Button
              variant="primary"
              className="w-full"
              disabled={openWarnings > 0 || !hasContent}
              onClick={() => dispatch({ type: "setConfirmed", part, value: true })}
              data-testid={`confirm-${area}`}
            >
              {label}の内容を確認しました
            </Button>
            <p className="mt-1.5 text-xs text-slate-500">
              {!hasContent
                ? "まだ内容がありません。"
                : openWarnings > 0
                  ? `「要確認」が ${openWarnings} 件あります。修正するか「確認したので問題なし」を押してください。`
                  : "患者さんの申告・検査の事実・臨床仮説・今後の提案が正しく分かれているかも確認してください。"}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
