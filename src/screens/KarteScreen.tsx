import { useState } from "react";
import { useApp } from "../state";
import { KARTE_FIELDS, formatKarte, isKarteEmpty } from "../domain/karte";
import { findExercise } from "../data/selfcare";
import { Button, Card, CardTitle, Notice } from "../components/ui";
import { copyText } from "../lib/clipboard";

const rowsFor = (text: string) => Math.min(14, Math.max(2, text.split("\n").length + Math.floor(text.length / 60)));

export function KarteScreen() {
  const { session, dispatch, notify } = useApp();
  const [showAll, setShowAll] = useState(true);
  const karte = session.karte;
  const output = formatKarte(karte);

  const selfcareText = session.selections
    .map((s) => {
      const ex = findExercise(s.slug);
      return ex ? `${ex.title}${s.dosage ? `（${s.dosage}）` : ""}` : null;
    })
    .filter(Boolean)
    .join("\n");

  const copy = async () => {
    if (output === "") {
      notify("カルテが空です");
      return;
    }
    notify((await copyText(output)) ? "カルテをコピーしました。SalonOne に貼り付けてください" : "コピーできませんでした");
  };

  const fields = KARTE_FIELDS.filter((f) => showAll || karte[f.key].trim() !== "");

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardTitle
          title="カルテ（NAORU整体フォーマット）"
          hint="AIの取り込み結果を確認・修正してください。手動での入力もできます。空欄の項目はコピー時に省略されます。"
        />
        <div className="mb-4 flex flex-wrap gap-2">
          <Button size="sm" variant={showAll ? "primary" : "secondary"} onClick={() => setShowAll(true)}>
            全項目
          </Button>
          <Button size="sm" variant={!showAll ? "primary" : "secondary"} onClick={() => setShowAll(false)}>
            記入済みのみ
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={selfcareText === ""}
            onClick={() => dispatch({ type: "setKarteField", key: "currentSelfcare", value: selfcareText })}
          >
            選択中のセルフケアを反映
          </Button>
        </div>
        {fields.length === 0 && <p className="text-sm text-slate-500">記入済みの項目はありません。</p>}
        <div className="space-y-4">
          {fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-sm font-bold text-navy-800">【{f.label}】</span>
              <textarea
                className="field mt-1 text-[15px] leading-relaxed"
                rows={rowsFor(karte[f.key])}
                value={karte[f.key]}
                onChange={(e) => dispatch({ type: "setKarteField", key: f.key, value: e.target.value })}
                data-karte-field={f.key}
              />
            </label>
          ))}
        </div>
      </Card>

      <div className="space-y-5 lg:sticky lg:top-36 lg:self-start">
        <Card>
          <CardTitle title="SalonOne 貼り付け用" />
          <Button variant="gold" size="lg" className="w-full" onClick={copy} disabled={isKarteEmpty(karte)}>
            カルテをコピー
          </Button>
          <pre
            className="mt-4 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-navy-50 p-4 font-sans text-sm leading-relaxed text-navy-900"
            data-testid="karte-output"
          >
            {output || "（まだ内容がありません）"}
          </pre>
        </Card>
        {session.confirmations.length > 0 && (
          <Notice tone="warn" title="確認事項（AIからの指摘）">
            <ul className="list-disc space-y-1 pl-5">
              {session.confirmations.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="mt-2 text-right">
              <button type="button" className="text-xs underline" onClick={() => dispatch({ type: "setConfirmations", items: [] })}>
                確認したので非表示にする
              </button>
            </div>
          </Notice>
        )}
      </div>
    </div>
  );
}
