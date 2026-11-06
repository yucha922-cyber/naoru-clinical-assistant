import type { ReactNode } from "react";
import { ArrowRight, CircleCheck, Target } from "lucide-react";
import { MIND_ICON_COMPONENTS } from "../doc/mindIcons";
import type { Session, SelectedExercise } from "../domain/session";
import { splitLines } from "../domain/session";
import type { Exercise } from "../data/selfcare";
import { APP_CONFIG } from "../config/app";
import { ExerciseImage, NoImage } from "./ExerciseImage";
import { QrCode } from "./QrCode";
import { PostureFigure } from "../doc/PostureFigure";
import { idealOf } from "../doc/postures";

// 患者説明資料（A4縦・1枚を目標）の固定テンプレート。HTML/CSS で組み、ブラウザ印刷で PDF にする。
// 構成: 目標 → ①今 と ②理想 をイラストで対比 → ③意識すること（アイコン） → ④セルフケア（別枠）


function SectionTitle({ num, title, color, children }: { num: string; title: string; color: string; children?: ReactNode }) {
  return (
    <div className="mb-[2mm] flex items-baseline gap-[2.5mm]" style={{ breakAfter: "avoid" }}>
      <span className="inline-flex h-[6.5mm] w-[6.5mm] shrink-0 items-center justify-center self-center rounded-full text-[10.5pt] font-bold text-white" style={{ background: color }}>
        {num}
      </span>
      <h2 className="text-[12.5pt] font-bold" style={{ color }}>
        {title}
      </h2>
      {children && <span className="ml-auto text-[8pt] text-slate-500">{children}</span>}
    </div>
  );
}

function CompareCard({
  num,
  title,
  tone,
  points,
  figure,
  marker,
}: {
  num: string;
  title: string;
  tone: "pink" | "blue";
  points: string[];
  figure: ReactNode | null;
  marker: ReactNode;
}) {
  const color = tone === "pink" ? "var(--color-sec-pink)" : "var(--color-sec-blue)";
  const bg = tone === "pink" ? "var(--color-sec-pink-bg)" : "var(--color-sec-blue-bg)";
  return (
    <section className="avoid-break flex min-w-0 flex-col rounded-[3mm] px-[3.5mm] pb-[3mm] pt-[2.5mm]" style={{ background: bg, borderTop: `1.2mm solid ${color}` }}>
      <SectionTitle num={num} title={title} color={color} />
      <div className="flex min-w-0 flex-1 items-center gap-[2mm]">
        {figure && <div className="w-[33mm] shrink-0">{figure}</div>}
        <ul className="min-w-0 flex-1 space-y-[2mm]">
          {points.map((p, i) => (
            <li key={i} className="flex gap-[1.8mm] text-[10.5pt] font-semibold leading-[1.45] text-navy-900">
              <span className="mt-[0.4mm] shrink-0" style={{ color }}>
                {marker}
              </span>
              <span className="min-w-0">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ExerciseCard({ index, exercise, selection, showSteps }: { index: number; exercise: Exercise; selection: SelectedExercise; showSteps: boolean }) {
  const images = exercise.images.slice(0, 2);
  return (
    <article className="avoid-break flex min-w-0 flex-col overflow-hidden rounded-[3mm] border border-navy-100 bg-white" data-doc-exercise={exercise.slug}>
      <header className="flex items-center gap-[2mm] bg-navy-900 px-[3mm] py-[1.6mm] text-white">
        <span className="inline-flex h-[5mm] w-[5mm] shrink-0 items-center justify-center rounded-full bg-gold text-[8.5pt] font-bold">{index}</span>
        <h3 className="min-w-0 flex-1 text-[10pt] font-bold leading-tight">
          <a href={exercise.detailUrl} target="_blank" rel="noopener noreferrer" className="text-white no-underline" data-doc-link={exercise.slug}>
            {exercise.title}
          </a>
        </h3>
      </header>
      <div className="flex flex-1 flex-col p-[2.5mm]">
        {images.length > 0 ? (
          <div className="grid grid-cols-2 gap-[1.5mm]">
            {images.map((img) => (
              <div key={img.url} className="relative overflow-hidden rounded-[1.5mm] bg-navy-50" style={{ height: "36mm" }}>
                <ExerciseImage url={img.url} alt={`${exercise.title} ${img.label ?? ""}`} className="absolute inset-0 h-full w-full" />
                {img.label && (
                  <span
                    className={`absolute left-[1mm] top-[1mm] rounded-full px-[1.5mm] text-[7pt] font-bold text-white ${
                      img.kind === "ng" ? "bg-red-600" : img.kind === "step" ? "bg-navy-900" : "bg-sec-green"
                    }`}
                  >
                    {img.label}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <NoImage className="h-[36mm] rounded-[1.5mm]" />
        )}
        {selection.dosage && (
          <p className="mt-[2mm] self-start rounded-full bg-[#f4ecdc] px-[2.5mm] py-[0.6mm] text-[9pt] font-bold text-navy-900">{selection.dosage}</p>
        )}
        {selection.note && <p className="mt-[1.5mm] text-[9pt] font-semibold leading-[1.45] text-navy-900">✓ {selection.note}</p>}
        {showSteps && exercise.instructions.length > 0 && (
          <ol className="mt-[1.5mm] list-decimal space-y-[0.3mm] pl-[4mm] text-[8pt] leading-[1.45] text-slate-700">
            {exercise.instructions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        <div className="mt-auto flex items-end gap-[2mm] pt-[2mm]">
          <p className="min-w-0 flex-1 text-[7.5pt] leading-[1.45] text-slate-600">
            {exercise.precautions[0] && (
              <>
                <span className="font-bold text-sec-pink">注意 </span>
                {exercise.precautions[0]}
              </>
            )}
          </p>
          <a href={exercise.detailUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 flex-col items-center no-underline" data-doc-link={exercise.slug}>
            <QrCode url={exercise.detailUrl} size={62} label={`${exercise.title} の詳細ページのQRコード`} />
            <span className="text-[6.5pt] font-bold text-sec-blue">動画を見る ›</span>
          </a>
        </div>
      </div>
    </article>
  );
}

export type ResolvedSelection = { selection: SelectedExercise; exercise: Exercise };

export function PatientDocument({
  session,
  items,
  guides = false,
  showSteps = false,
}: {
  session: Session;
  items: ResolvedSelection[];
  guides?: boolean;
  showSteps?: boolean;
}) {
  const { patientDoc: doc, meta } = session;
  const current = splitLines(doc.currentPoints);
  const ideal = splitLines(doc.idealPoints);
  const mind = doc.mindItems.filter((m) => m.text.trim());
  const date = meta.visitDate ? new Date(`${meta.visitDate}T00:00:00`) : null;
  const dateText =
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }) : "";
  const needsMemberNote = items.some((i) => i.exercise.requiresMemberCode);
  const hasCompare = current.length > 0 || ideal.length > 0;
  const cols = items.length === 1 ? 2 : Math.min(items.length, 3);

  return (
    <div id="print-root">
      <div className={`a4-sheet mx-auto shadow-xl ${guides ? "a4-guides" : ""}`} data-testid="a4-sheet">
        <div id="doc-content">
          <header className="flex items-center justify-between gap-[4mm] rounded-[3mm] bg-navy-900 px-[5mm] py-[3.5mm] text-white">
            <div>
              <p className="text-[8pt] font-semibold tracking-[0.35em] text-gold-light">{APP_CONFIG.clinicName}</p>
              <h1 className="mt-[0.5mm] text-[15pt] font-bold leading-tight tracking-wide">からだの状態とセルフケアのご案内</h1>
            </div>
            <div className="shrink-0 text-right text-[8.5pt] leading-relaxed">
              {meta.patientName.trim() && <p className="text-[11pt] font-bold">{meta.patientName.trim()} 様</p>}
              {dateText && <p>{dateText}</p>}
              {meta.therapistName.trim() && <p>担当：{meta.therapistName.trim()}</p>}
            </div>
          </header>

          {doc.goal.trim() && (
            <div className="avoid-break mt-[3mm] flex items-center gap-[3mm] rounded-full border-[0.5mm] border-gold bg-[#faf6ee] px-[4mm] py-[2mm]" data-doc-goal>
              <span className="inline-flex shrink-0 items-center gap-[1mm] rounded-full bg-gold px-[2.5mm] py-[0.5mm] text-[8.5pt] font-bold text-white">
                <Target size={12} strokeWidth={2.5} aria-hidden /> 目標
              </span>
              <p className="min-w-0 text-[12pt] font-bold text-navy-900">{doc.goal.trim()}</p>
            </div>
          )}

          {hasCompare && (
            <div className="mt-[3.5mm]">
              <div className="grid items-stretch gap-[2mm]" style={{ gridTemplateColumns: "minmax(0,1fr) 7mm minmax(0,1fr)" }}>
                <CompareCard
                  num="1"
                  title="今のお身体の状態"
                  tone="pink"
                  points={current}
                  marker="●"
                  figure={doc.posture ? <PostureFigure posture={doc.posture} focus={doc.focusAreas} title="今の姿勢のイメージ" /> : null}
                />
                <div className="flex items-center justify-center">
                  <span className="inline-flex h-[7mm] w-[7mm] items-center justify-center rounded-full bg-navy-900 text-gold-light">
                    <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
                  </span>
                </div>
                <CompareCard
                  num="2"
                  title="理想のお身体の状態"
                  tone="blue"
                  points={ideal}
                  marker="◎"
                  figure={doc.posture ? <PostureFigure posture={idealOf(doc.posture)} title="目指す姿勢のイメージ" /> : null}
                />
              </div>
              {doc.posture && (
                <p className="mt-[1mm] text-right text-[7pt] text-slate-500">
                  イラストはイメージです。<span className="text-gold">┊</span> 点線はまっすぐな姿勢の目安
                  {doc.focusAreas.length > 0 && (
                    <>
                      ・<span className="text-sec-pink">◯</span> 気になる部位
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {mind.length > 0 && (
            <section className="avoid-break mt-[3mm] rounded-[3mm] bg-sec-green-bg px-[3.5mm] pb-[3mm] pt-[2.5mm]" style={{ borderTop: "1.2mm solid var(--color-sec-green)" }}>
              <SectionTitle num="3" title="意識していくこと" color="var(--color-sec-green)" />
              <ul className="grid gap-[2.5mm]" style={{ gridTemplateColumns: `repeat(${Math.min(mind.length, 3)}, minmax(0, 1fr))` }}>
                {mind.map((m, i) => {
                  const Icon = MIND_ICON_COMPONENTS[m.icon] ?? CircleCheck;
                  return (
                    <li key={i} className="flex items-center gap-[2.5mm] rounded-[2.5mm] bg-white px-[2.5mm] py-[2mm]" data-mind-icon={m.icon}>
                      <span className="inline-flex h-[10mm] w-[10mm] shrink-0 items-center justify-center rounded-full bg-sec-green text-white">
                        <Icon size={20} strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0 text-[9.5pt] font-semibold leading-[1.45] text-navy-900">{m.text}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {items.length > 0 && (
            <section className="mt-[3.5mm]">
              <SectionTitle num="4" title="今日のセルフケア" color="var(--color-navy-900)">
                QRコード・運動名から動画が見られます
              </SectionTitle>
              <div className="grid gap-[2.5mm]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {items.map((it, i) => (
                  <ExerciseCard key={it.exercise.slug} index={i + 1} exercise={it.exercise} selection={it.selection} showSteps={showSteps} />
                ))}
              </div>
              {needsMemberNote && <p className="mt-[1mm] text-right text-[7pt] text-slate-500">{APP_CONFIG.memberCodeNote}</p>}
            </section>
          )}

          <footer className="avoid-break mt-[3mm] flex items-end justify-between gap-[4mm] border-t border-navy-100 pt-[2mm] text-[7pt] leading-relaxed text-slate-500">
            <p className="min-w-0">{APP_CONFIG.documentDisclaimer}</p>
            <p className="shrink-0 font-semibold tracking-[0.2em] text-navy-900">{APP_CONFIG.clinicName}</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
