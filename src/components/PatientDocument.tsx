import type { ReactNode } from "react";
import type { Session, SelectedExercise } from "../domain/session";
import { splitLines } from "../domain/session";
import type { Exercise } from "../data/selfcare";
import { APP_CONFIG } from "../config/app";
import { ExerciseImage, NoImage } from "./ExerciseImage";
import { QrCode } from "./QrCode";

// 患者説明資料（A4縦）の固定テンプレート。HTML/CSS で組み、ブラウザ印刷で PDF にする。

type Tone = "pink" | "blue" | "green" | "navy";
const TONES: Record<Tone, { bar: string; bg: string; num: string; text: string }> = {
  pink: { bar: "border-sec-pink", bg: "bg-sec-pink-bg", num: "bg-sec-pink", text: "text-sec-pink" },
  blue: { bar: "border-sec-blue", bg: "bg-sec-blue-bg", num: "bg-sec-blue", text: "text-sec-blue" },
  green: { bar: "border-sec-green", bg: "bg-sec-green-bg", num: "bg-sec-green", text: "text-sec-green" },
  navy: { bar: "border-navy-900", bg: "bg-navy-50", num: "bg-navy-900", text: "text-navy-900" },
};

function Section({ num, title, tone, children }: { num: string; title: string; tone: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <section className="mt-[5mm]">
      <h2 className={`avoid-break flex items-center gap-[2.5mm] border-b-2 pb-[1.5mm] text-[13pt] font-bold ${t.bar} ${t.text}`} style={{ breakAfter: "avoid" }}>
        <span className={`inline-flex h-[7mm] w-[7mm] items-center justify-center rounded-full text-[11pt] text-white ${t.num}`}>{num}</span>
        {title}
      </h2>
      <div className="mt-[2.5mm]">{children}</div>
    </section>
  );
}

function Paragraphs({ text, tone }: { text: string; tone: Tone }) {
  return (
    <div className={`avoid-break rounded-[3mm] px-[5mm] py-[3.5mm] ${TONES[tone].bg}`}>
      {text
        .split("\n")
        .filter((l) => l.trim())
        .map((l, i) => (
          <p key={i} className={i > 0 ? "mt-[1.5mm]" : ""}>
            {l}
          </p>
        ))}
    </div>
  );
}

function ExerciseBlock({ index, exercise, selection }: { index: number; exercise: Exercise; selection: SelectedExercise }) {
  const images = exercise.images.slice(0, APP_CONFIG.maxImagesPerExercise);
  return (
    <article className="avoid-break mt-[3.5mm] overflow-hidden rounded-[3mm] border border-navy-100" data-doc-exercise={exercise.slug}>
      <header className="flex items-center gap-[3mm] bg-navy-900 px-[4mm] py-[2mm] text-white">
        <span className="inline-flex h-[6mm] w-[6mm] shrink-0 items-center justify-center rounded-full bg-gold text-[10pt] font-bold">{index}</span>
        <h3 className="flex-1 text-[12pt] font-bold leading-tight">{exercise.title}</h3>
        {selection.dosage && (
          <span className="shrink-0 rounded-full bg-white px-[3mm] py-[0.8mm] text-[9.5pt] font-bold text-navy-900">{selection.dosage}</span>
        )}
      </header>
      <div className="flex gap-[4mm] p-[3.5mm]">
        {/* 画像: 縦長・横長どちらの写真でも縦横比を保って収まるよう、固定サイズの枠に contain で配置 */}
        <div className="grid shrink-0 grid-cols-2 content-start gap-[2mm]" style={{ width: "66mm" }}>
          {images.length > 0 ? (
            images.map((img) => (
              <figure key={img.url} className="min-w-0">
                <div className="relative overflow-hidden rounded-[2mm] bg-navy-50" style={{ height: "40mm" }}>
                  <ExerciseImage url={img.url} alt={`${exercise.title} ${img.label ?? ""}`} className="absolute inset-0 h-full w-full" />
                  {img.label && (
                    <span
                      className={`absolute left-[1mm] top-[1mm] rounded-full px-[1.8mm] text-[7.5pt] font-bold text-white ${
                        img.kind === "ng" ? "bg-red-600" : img.kind === "step" ? "bg-navy-900" : "bg-sec-green"
                      }`}
                    >
                      {img.label}
                    </span>
                  )}
                </div>
                {img.caption && <figcaption className="mt-[0.5mm] text-center text-[7.5pt] leading-tight text-slate-600">{img.caption}</figcaption>}
              </figure>
            ))
          ) : (
            <NoImage className="col-span-2 h-[20mm] rounded-[2mm]" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col text-[9.3pt] leading-[1.6]">
          {selection.note && (
            <p className="mb-[1.5mm] rounded-[2mm] border-l-[1mm] border-gold bg-[#faf6ee] px-[3mm] py-[1.2mm] font-semibold">{selection.note}</p>
          )}
          {exercise.instructions.length > 0 && (
            <ol className="list-decimal space-y-[0.4mm] pl-[4.5mm]">
              {exercise.instructions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
          <div className="mt-auto flex items-end gap-[3mm] pt-[2mm]">
            <div className="min-w-0 flex-1 text-[8.3pt] leading-[1.5] text-slate-700">
              {exercise.precautions.length > 0 && (
                <>
                  <span className="font-bold text-sec-pink">注意：</span>
                  {exercise.precautions.join(" ")}
                </>
              )}
            </div>
            <div className="flex w-[21mm] shrink-0 flex-col items-center text-center">
              <QrCode url={exercise.detailUrl} size={72} label={`${exercise.title} の詳細ページのQRコード`} />
              <p className="mt-[0.5mm] text-[7pt] leading-tight text-slate-600">動画・詳しい説明</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export type ResolvedSelection = { selection: SelectedExercise; exercise: Exercise };

export function PatientDocument({ session, items, guides = false }: { session: Session; items: ResolvedSelection[]; guides?: boolean }) {
  const { patientDoc, meta } = session;
  const points = splitLines(patientDoc.pointsToMind);
  const date = meta.visitDate ? new Date(`${meta.visitDate}T00:00:00`) : null;
  const dateText = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })
    : "";
  const needsMemberNote = items.some((i) => i.exercise.requiresMemberCode);

  return (
    <div id="print-root">
      <div className={`a4-sheet mx-auto shadow-xl ${guides ? "a4-guides" : ""}`} data-testid="a4-sheet">
        <header className="flex items-end justify-between gap-[4mm] rounded-[3mm] bg-navy-900 px-[6mm] py-[5mm] text-white">
          <div>
            <p className="text-[9pt] font-semibold tracking-[0.35em] text-gold-light">{APP_CONFIG.clinicName}</p>
            <h1 className="mt-[1mm] text-[17pt] font-bold leading-tight tracking-wide">お身体の状態とセルフケアのご案内</h1>
          </div>
          <div className="shrink-0 text-right text-[9.5pt] leading-relaxed">
            {meta.patientName.trim() && <p className="text-[12pt] font-bold">{meta.patientName.trim()} 様</p>}
            {dateText && <p>{dateText}</p>}
            {meta.therapistName.trim() && <p>担当：{meta.therapistName.trim()}</p>}
          </div>
        </header>

        {patientDoc.currentState.trim() && (
          <Section num="1" title="今のお身体の状態" tone="pink">
            <Paragraphs text={patientDoc.currentState} tone="pink" />
          </Section>
        )}
        {patientDoc.idealState.trim() && (
          <Section num="2" title="理想のお身体の状態" tone="blue">
            <Paragraphs text={patientDoc.idealState} tone="blue" />
          </Section>
        )}
        {points.length > 0 && (
          <Section num="3" title="意識していくこと" tone="green">
            <ul className="avoid-break space-y-[1.5mm] rounded-[3mm] bg-sec-green-bg px-[5mm] py-[3.5mm]">
              {points.map((p, i) => (
                <li key={i} className="flex gap-[2.5mm]">
                  <span className="mt-[0.6mm] inline-flex h-[4.5mm] w-[4.5mm] shrink-0 items-center justify-center rounded-full bg-sec-green text-[8pt] font-bold text-white">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
        {items.length > 0 && (
          <Section num="4" title="今日のセルフケア" tone="navy">
            {items.map((it, i) => (
              <ExerciseBlock key={it.exercise.slug} index={i + 1} exercise={it.exercise} selection={it.selection} />
            ))}
            {needsMemberNote && <p className="mt-[2mm] text-right text-[8pt] text-slate-500">{APP_CONFIG.memberCodeNote}</p>}
          </Section>
        )}

        <footer className="avoid-break mt-[6mm] border-t border-navy-100 pt-[3mm] text-[8pt] leading-relaxed text-slate-500">
          <p>{APP_CONFIG.documentDisclaimer}</p>
          <p className="mt-[1mm] font-semibold tracking-[0.2em] text-navy-900">{APP_CONFIG.clinicName}</p>
        </footer>
      </div>
    </div>
  );
}
