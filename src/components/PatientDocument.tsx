import type { CSSProperties, ReactNode } from "react";
import { ArrowRight, CalendarCheck, CircleCheck, HeartHandshake, Target, TrendingUp } from "lucide-react";
import { MIND_ICON_COMPONENTS } from "../doc/mindIcons";
import type { Session, SelectedExercise, ChangeItem } from "../domain/session";
import { splitLines } from "../domain/session";
import type { Exercise } from "../data/selfcare";
import { APP_CONFIG } from "../config/app";
import { ExerciseImage, NoImage } from "./ExerciseImage";
import { QrCode } from "./QrCode";
import { PostureFigure } from "../doc/PostureFigure";
import { idealOf } from "../doc/postures";
import { DENSITY, FONT, type Density } from "../doc/density";
import { exercisePurpose } from "../doc/exercise";

// 患者説明資料（A4縦）の固定テンプレート。HTML/CSS で組み、ブラウザ印刷で PDF にする。
// 構成: あなたの目標 → 今のお身体の状態 ⇄ これから目指すお身体の状態 → 今日確認できた変化
//       → 日常生活で意識すること → 次回来院までの目標 → 今日のセルフケア
// ※「次回来院までの目標」はセルフケアの前に置く。セルフケアが次のページに回る場合でも
//   1ページ目の説明と一緒に収まり、この枠だけが別のページに送られる不自然さを防ぐため。
// 情報が無い項目は表示しない（AIや画面で推測して埋めない）。

const COLOR = {
  pink: "var(--color-sec-pink)",
  pinkBg: "var(--color-sec-pink-bg)",
  blue: "var(--color-sec-blue)",
  blueBg: "var(--color-sec-blue-bg)",
  green: "var(--color-sec-green)",
  greenBg: "var(--color-sec-green-bg)",
  navy: "var(--color-navy-900)",
  gold: "var(--color-gold)",
  teal: "#2a7f8f",
  tealBg: "#ebf6f8",
};

function SectionTitle({ icon, title, color, children }: { icon?: ReactNode; title: string; color: string; children?: ReactNode }) {
  return (
    <div className="mb-[1.8mm] flex items-center gap-[2mm]" style={{ breakAfter: "avoid" }}>
      {icon && (
        <span className="inline-flex h-[6mm] w-[6mm] shrink-0 items-center justify-center rounded-full text-white" style={{ background: color }}>
          {icon}
        </span>
      )}
      <h2 className="text-[12pt] font-bold leading-tight" style={{ color }}>
        {title}
      </h2>
      {children && (
        <span className="ml-auto text-slate-500" style={{ fontSize: FONT.caption }}>
          {children}
        </span>
      )}
    </div>
  );
}

function PointsCard({
  title,
  tone,
  points,
  figure,
  marker,
  testId,
}: {
  title: string;
  tone: "pink" | "blue";
  points: string[];
  figure: ReactNode | null;
  marker: ReactNode;
  testId: string;
}) {
  const color = tone === "pink" ? COLOR.pink : COLOR.blue;
  const bg = tone === "pink" ? COLOR.pinkBg : COLOR.blueBg;
  return (
    <section
      className="avoid-break flex min-w-0 flex-col rounded-[3mm] px-[3mm] pt-[2.5mm]"
      style={{ background: bg, borderTop: `1.2mm solid ${color}`, paddingBottom: "var(--pad)" }}
      data-doc-section={testId}
    >
      <SectionTitle title={title} color={color} />
      <div className="flex min-w-0 flex-1 items-center gap-[2mm]">
        {figure && (
          <div className="shrink-0" style={{ width: "var(--fig-w)" }}>
            {figure}
          </div>
        )}
        <ul className="min-w-0 flex-1 space-y-[1.6mm]">
          {points.map((p, i) => (
            <li key={i} className="flex gap-[1.5mm] font-semibold leading-[1.5] text-navy-900" style={{ fontSize: FONT.body }}>
              <span className="shrink-0" style={{ color }}>
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

function ChangesBand({ changes }: { changes: ChangeItem[] }) {
  return (
    <section
      className="avoid-break flex items-stretch gap-[3mm] rounded-[3mm] px-[3mm] py-[2.2mm]"
      style={{ background: COLOR.tealBg, borderLeft: `1.2mm solid ${COLOR.teal}`, marginTop: "var(--gap-sm)" }}
      data-doc-section="changes"
      data-block
    >
      <div className="flex w-[46mm] shrink-0 flex-col justify-center">
        <h2 className="flex items-center gap-[1.5mm] text-[11.5pt] font-bold leading-tight" style={{ color: COLOR.teal }}>
          <TrendingUp size={15} strokeWidth={2.5} aria-hidden /> 今日確認できた変化
        </h2>
        <p className="mt-[1mm] leading-[1.35] text-slate-500" style={{ fontSize: FONT.caption }}>
          ※施術直後の変化です。長期的な変化は続けて確認します。
        </p>
      </div>
      <ul className="grid min-w-0 flex-1 gap-[2mm]" style={{ gridTemplateColumns: `repeat(${Math.min(changes.length, 3)}, minmax(0, 1fr))` }}>
        {changes.map((c, i) => (
          <li key={i} className="flex flex-col justify-center rounded-[2mm] bg-white px-[2.5mm] py-[1.4mm]">
            {c.item && (
              <p className="font-semibold leading-[1.35] text-navy-900" style={{ fontSize: FONT.sub }}>
                {c.item}
              </p>
            )}
            <p className="mt-[0.4mm] flex flex-wrap items-center gap-x-[1.5mm] leading-[1.35]" style={{ fontSize: FONT.sub }}>
              <span className="text-slate-500">施術前</span>
              <span className="font-bold text-navy-900">{c.before}</span>
              <ArrowRight size={12} strokeWidth={2.5} className="shrink-0" style={{ color: COLOR.teal }} aria-hidden />
              <span className="text-slate-500">施術後</span>
              <span className="font-bold" style={{ color: COLOR.teal }}>
                {c.after}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Photos({ exercise, height }: { exercise: Exercise; height: string }) {
  const images = exercise.images.slice(0, 2);
  if (images.length === 0) {
    return (
      <div style={{ height }}>
        <NoImage className="h-full rounded-[1.5mm]" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-[1.5mm]">
      {images.map((img) => (
        <figure key={img.url} className="min-w-0">
          <div className="relative overflow-hidden rounded-[1.5mm] bg-navy-50" style={{ height }}>
            <ExerciseImage url={img.url} alt={`${exercise.title} ${img.label ?? ""}`} className="absolute inset-0 h-full w-full" />
            {img.label && (
              <span
                className={`absolute left-[1mm] top-[1mm] rounded-full px-[1.5mm] font-bold text-white ${
                  img.kind === "ng" ? "bg-red-600" : img.kind === "step" ? "bg-navy-900" : "bg-sec-green"
                }`}
                style={{ fontSize: FONT.caption }}
              >
                {img.label}
              </span>
            )}
          </div>
          {img.caption && (
            <figcaption className="mt-[0.5mm] text-center text-slate-600" style={{ fontSize: FONT.caption }}>
              {img.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}

function ExerciseText({ exercise, selection, showSteps }: { exercise: Exercise; selection: SelectedExercise; showSteps: boolean }) {
  const purpose = exercisePurpose(exercise, selection);
  return (
    <>
      {purpose && (
        <p className="leading-[1.55] text-navy-900" style={{ fontSize: FONT.sub }} data-doc-purpose>
          <span className="mr-[1mm] font-bold" style={{ color: COLOR.blue }}>
            目的
          </span>
          {purpose}
        </p>
      )}
      {selection.dosage && (
        <p className="mt-[1.5mm] self-start rounded-full bg-[#f4ecdc] px-[2.5mm] py-[0.6mm] font-bold text-navy-900" style={{ fontSize: FONT.sub }}>
          {selection.dosage}
        </p>
      )}
      {selection.note && (
        <p className="mt-[1.5mm] font-semibold leading-[1.5] text-navy-900" style={{ fontSize: FONT.sub }}>
          ✓ {selection.note}
        </p>
      )}
      {showSteps && exercise.instructions.length > 0 && (
        <ol className="mt-[1.5mm] list-decimal space-y-[0.3mm] pl-[4.5mm] leading-[1.5] text-slate-700" style={{ fontSize: FONT.caution }}>
          {exercise.instructions.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {exercise.precautions.length > 0 && (
        <div className="mt-[1.5mm] leading-[1.5] text-slate-700" style={{ fontSize: FONT.caution }} data-doc-caution>
          <span className="font-bold" style={{ color: COLOR.pink }}>
            注意
          </span>
          <ul className="mt-[0.3mm] space-y-[0.3mm]">
            {exercise.precautions.map((p) => (
              <li key={p} className="flex gap-[1mm]">
                <span className="shrink-0">・</span>
                <span className="min-w-0">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Qr({ exercise, size }: { exercise: Exercise; size: number }) {
  return (
    <a href={exercise.detailUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 flex-col items-center no-underline" data-doc-link={exercise.slug}>
      <QrCode url={exercise.detailUrl} size={size} label={`${exercise.title} の詳細ページのQRコード`} />
      <span className="mt-[0.5mm] font-bold" style={{ fontSize: FONT.caption, color: COLOR.blue }}>
        動画・やり方 ›
      </span>
    </a>
  );
}

function CardHeader({ index, exercise }: { index: number; exercise: Exercise }) {
  return (
    <header className="flex items-center gap-[2mm] bg-navy-900 px-[3mm] py-[1.8mm] text-white">
      <span className="inline-flex h-[5.5mm] w-[5.5mm] shrink-0 items-center justify-center rounded-full bg-gold font-bold" style={{ fontSize: FONT.sub }}>
        {index}
      </span>
      <h3 className="min-w-0 flex-1 text-[11pt] font-bold leading-tight">
        <a href={exercise.detailUrl} target="_blank" rel="noopener noreferrer" className="text-white no-underline" data-doc-link={exercise.slug}>
          {exercise.title}
        </a>
      </h3>
    </header>
  );
}

/** セルフケア1種目: 横長のカードで、写真・文章・QRコードを横に並べる */
function ExerciseWide({ exercise, selection, showSteps, d }: { exercise: Exercise; selection: SelectedExercise; showSteps: boolean; d: (typeof DENSITY)[number] }) {
  return (
    <article className="avoid-break overflow-hidden rounded-[3mm] border border-navy-100 bg-white" data-doc-exercise={exercise.slug} data-layout="wide" data-block>
      <CardHeader index={1} exercise={exercise} />
      <div className="flex gap-[3.5mm] p-[3mm]">
        <div className="w-[72mm] shrink-0">
          <Photos exercise={exercise} height={d.photoWide} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <ExerciseText exercise={exercise} selection={selection} showSteps={showSteps} />
        </div>
        <div className="flex shrink-0 items-end">
          <Qr exercise={exercise} size={d.qrWide} />
        </div>
      </div>
    </article>
  );
}

/** セルフケア2種目以上: 2列のカード */
function ExerciseCard({ index, exercise, selection, showSteps, d }: { index: number; exercise: Exercise; selection: SelectedExercise; showSteps: boolean; d: (typeof DENSITY)[number] }) {
  return (
    <article className="avoid-break flex min-w-0 flex-col overflow-hidden rounded-[3mm] border border-navy-100 bg-white" data-doc-exercise={exercise.slug} data-layout="card" data-block>
      <CardHeader index={index} exercise={exercise} />
      <div className="flex flex-1 flex-col p-[2.5mm]">
        <Photos exercise={exercise} height={d.photo} />
        <div className="mt-[2mm] flex flex-1 gap-[2.5mm]">
          <div className="flex min-w-0 flex-1 flex-col">
            <ExerciseText exercise={exercise} selection={selection} showSteps={showSteps} />
          </div>
          <div className="flex items-end">
            <Qr exercise={exercise} size={d.qr} />
          </div>
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
  density = 0,
}: {
  session: Session;
  items: ResolvedSelection[];
  guides?: boolean;
  showSteps?: boolean;
  density?: Density;
}) {
  const d = DENSITY[density];
  const { patientDoc: doc, meta } = session;
  const current = splitLines(doc.currentPoints);
  const ideal = splitLines(doc.idealPoints);
  const changes = doc.changes.filter((c) => c.before.trim() && c.after.trim());
  const mind = doc.mindItems.filter((m) => m.text.trim());
  const date = meta.visitDate ? new Date(`${meta.visitDate}T00:00:00`) : null;
  const dateText =
    date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }) : "";

  return (
    <div id="print-root">
      <div className={`a4-sheet mx-auto shadow-xl ${guides ? "a4-guides" : ""}`} data-testid="a4-sheet">
        <div
          id="doc-content"
          data-density={density}
          style={
            {
              "--fig-w": d.fig,
              "--gap": d.gap,
              "--gap-sm": d.gapSm,
              "--pad": d.pad,
            } as CSSProperties
          }
        >
          <header className="flex items-center justify-between gap-[4mm] rounded-[3mm] bg-navy-900 px-[5mm] py-[3.2mm] text-white" data-block>
            <div>
              <p className="text-[8pt] font-semibold tracking-[0.35em] text-gold-light">{APP_CONFIG.clinicName}</p>
              <h1 className="mt-[0.5mm] text-[15pt] font-bold leading-tight tracking-wide">からだの状態とセルフケアのご案内</h1>
            </div>
            <div className="shrink-0 text-right text-[9pt] leading-relaxed">
              {meta.patientName.trim() && <p className="text-[11pt] font-bold">{meta.patientName.trim()} 様</p>}
              {dateText && <p>{dateText}</p>}
              {meta.therapistName.trim() && <p>担当：{meta.therapistName.trim()}</p>}
            </div>
          </header>

          {doc.goal.trim() && (
            <div
              className="avoid-break flex items-center gap-[3mm] rounded-[3mm] border-[0.5mm] border-gold bg-[#faf6ee] px-[4mm] py-[2.2mm]"
              style={{ marginTop: "var(--gap-sm)" }}
              data-doc-goal
              data-block
            >
              <span className="inline-flex shrink-0 items-center gap-[1mm] rounded-full bg-gold px-[2.5mm] py-[0.6mm] text-[9pt] font-bold text-white">
                <Target size={13} strokeWidth={2.5} aria-hidden /> あなたの目標
              </span>
              <p className="min-w-0 text-[12pt] font-bold leading-[1.45] text-navy-900">{doc.goal.trim()}</p>
            </div>
          )}

          {(current.length > 0 || ideal.length > 0) && (
            <div style={{ marginTop: "var(--gap)" }} className="avoid-break" data-block>
              <div
                className="grid items-stretch gap-[2mm]"
                style={{ gridTemplateColumns: current.length > 0 && ideal.length > 0 ? "minmax(0,1fr) 6mm minmax(0,1fr)" : "minmax(0,1fr)" }}
              >
                {current.length > 0 && (
                  <PointsCard
                    title="今のお身体の状態"
                    tone="pink"
                    points={current}
                    marker="●"
                    testId="current"
                    figure={doc.posture ? <PostureFigure posture={doc.posture} focus={doc.focusAreas} title="今の姿勢のイメージ" /> : null}
                  />
                )}
                {current.length > 0 && ideal.length > 0 && (
                  <div className="flex items-center justify-center">
                    <span className="inline-flex h-[6mm] w-[6mm] items-center justify-center rounded-full bg-navy-900 text-gold-light">
                      <ArrowRight size={14} strokeWidth={2.5} aria-hidden />
                    </span>
                  </div>
                )}
                {ideal.length > 0 && (
                  <PointsCard
                    title="これから目指すお身体の状態"
                    tone="blue"
                    points={ideal}
                    marker="◎"
                    testId="ideal"
                    figure={doc.posture ? <PostureFigure posture={idealOf(doc.posture)} title="目指す姿勢のイメージ" /> : null}
                  />
                )}
              </div>
              {doc.posture && (
                <p className="mt-[1mm] text-right text-slate-500" style={{ fontSize: FONT.caption }}>
                  イラストはイメージです。点線はまっすぐな姿勢の目安{doc.focusAreas.length > 0 && <>・ピンクの丸は気になる部位</>}
                </p>
              )}
            </div>
          )}

          {changes.length > 0 && <ChangesBand changes={changes} />}

          {mind.length > 0 && (
            <section
              className="avoid-break rounded-[3mm] px-[3mm] pt-[2.5mm]"
              style={{ background: COLOR.greenBg, borderTop: `1.2mm solid ${COLOR.green}`, marginTop: "var(--gap-sm)", paddingBottom: "var(--pad)" }}
              data-doc-section="mind"
              data-block
            >
              <SectionTitle icon={<HeartHandshake size={13} strokeWidth={2.5} aria-hidden />} title="日常生活で意識すること" color={COLOR.green} />
              <ul className="grid gap-[2mm]" style={{ gridTemplateColumns: `repeat(${Math.min(mind.length, 3)}, minmax(0, 1fr))` }}>
                {mind.map((m, i) => {
                  const Icon = MIND_ICON_COMPONENTS[m.icon] ?? CircleCheck;
                  return (
                    <li key={i} className="flex items-center gap-[2mm] rounded-[2.5mm] bg-white px-[2.5mm] py-[2mm]" data-mind-icon={m.icon}>
                      <span className="inline-flex h-[9mm] w-[9mm] shrink-0 items-center justify-center rounded-full text-white" style={{ background: COLOR.green }}>
                        <Icon size={18} strokeWidth={2} aria-hidden />
                      </span>
                      <span className="min-w-0 font-semibold leading-[1.5] text-navy-900" style={{ fontSize: FONT.sub }}>
                        {m.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {(doc.nextGoal.trim() || doc.nextCheck.trim()) && (
            <section
              className="avoid-break flex items-start gap-[3mm] rounded-[3mm] border-[0.4mm] border-navy-900 px-[4mm] py-[2.2mm]"
              style={{ marginTop: "var(--gap-sm)" }}
              data-doc-section="next"
              data-block
            >
              <span className="mt-[0.5mm] inline-flex h-[8mm] w-[8mm] shrink-0 items-center justify-center rounded-full bg-navy-900 text-gold-light">
                <CalendarCheck size={16} strokeWidth={2.2} aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-[12pt] font-bold text-navy-900">次回来院までの目標</h2>
                {doc.nextGoal.trim() && (
                  <p className="mt-[0.8mm] font-semibold leading-[1.55] text-navy-900" style={{ fontSize: FONT.body }}>
                    {doc.nextGoal.trim()}
                  </p>
                )}
                {doc.nextCheck.trim() && (
                  <p className="mt-[0.8mm] leading-[1.5] text-slate-700" style={{ fontSize: FONT.sub }}>
                    <span className="mr-[2mm] font-bold text-gold">次回確認すること</span>
                    {doc.nextCheck.trim()}
                  </p>
                )}
              </div>
            </section>
          )}

          {items.length > 0 && (
            <section style={{ marginTop: "var(--gap)" }} data-doc-section="selfcare">
              <div data-block="keep-with-next">
                <SectionTitle icon={<TrendingUp size={13} strokeWidth={2.5} aria-hidden />} title="今日のセルフケア" color={COLOR.navy}>
                  QRコード・運動名から動画とやり方が見られます
                </SectionTitle>
              </div>
              {items.length === 1 ? (
                <ExerciseWide exercise={items[0].exercise} selection={items[0].selection} showSteps={showSteps} d={d} />
              ) : (
                <div className="grid grid-cols-2 gap-[2.5mm]">
                  {items.map((it, i) => (
                    <ExerciseCard key={it.exercise.slug} index={i + 1} exercise={it.exercise} selection={it.selection} showSteps={showSteps} d={d} />
                  ))}
                </div>
              )}
            </section>
          )}

          <footer
            data-block
            className="avoid-break flex items-end justify-between gap-[4mm] border-t border-navy-100 pt-[2mm] leading-relaxed text-slate-500"
            style={{ marginTop: "var(--gap-sm)", fontSize: FONT.caption }}
          >
            <p className="min-w-0">{APP_CONFIG.documentDisclaimer}</p>
            <p className="shrink-0 font-semibold tracking-[0.2em] text-navy-900">{APP_CONFIG.clinicName}</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
