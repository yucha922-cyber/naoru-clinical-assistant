import { useId } from "react";
import type { BodyArea, PostureKey } from "./postures";

// 患者資料用の人物イラスト（SVG）。関節の位置をパラメータで動かして姿勢の違いを描き分ける。
// 画像生成AIは使わず、コードで描画する（印刷でもにじまない・費用0円）。
// 金色の点線は「耳・肩・股関節・ひざ・くるぶし」を結ぶ重心線（横から）／左右の水平線（正面）の目安。

type P = { x: number; y: number };

const C = {
  skin: "#f6d5c1",
  skinShade: "#e8b89f",
  hair: "#3b3240",
  shirt: "#9cc3e6",
  shirtShade: "#7fa9d3",
  pants: "#2d4170",
  shoe: "#1f2f55",
  guide: "#b9975b",
  focus: "#c9577c",
};

type SideParams = {
  headFwd: number;
  headDrop: number;
  c7Fwd: number;
  kyph: number;
  lordo: number;
  shoulderFwd: number;
  hipX: number;
  kneeX: number;
  pelvisTilt: number;
};

const SIDE: Record<string, SideParams> = {
  "side-neutral": { headFwd: 0, headDrop: 0, c7Fwd: 0, kyph: 0, lordo: 0, shoulderFwd: 0, hipX: 0, kneeX: 0, pelvisTilt: 0 },
  "side-forward-head": { headFwd: 13, headDrop: 5, c7Fwd: 4, kyph: -5, lordo: 0, shoulderFwd: 7, hipX: 0, kneeX: 0, pelvisTilt: 0 },
  "side-rounded-back": { headFwd: 10, headDrop: 7, c7Fwd: 6, kyph: -11, lordo: -4, shoulderFwd: 6, hipX: 2, kneeX: 1, pelvisTilt: -8 },
  "side-sway-back": { headFwd: 3, headDrop: 0, c7Fwd: -2, kyph: -4, lordo: 12, shoulderFwd: 1, hipX: -4, kneeX: -2, pelvisTilt: 16 },
};

type FrontParams = { shoulder: number; pelvis: number; head: number };
const FRONT: Record<string, FrontParams> = {
  "front-neutral": { shoulder: 0, pelvis: 0, head: 0 },
  // 正面から見ると、患者さんの右側は画像の左側
  "front-shoulder-right-low": { shoulder: 7, pelvis: 0, head: -2 },
  "front-shoulder-left-low": { shoulder: -7, pelvis: 0, head: 2 },
  "front-pelvis-right-low": { shoulder: -2, pelvis: 6, head: 0 },
  "front-pelvis-left-low": { shoulder: 2, pelvis: -6, head: 0 },
};

const bez = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
};

function Focus({ points }: { points: P[] }) {
  return (
    <g data-focus>
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={11} fill={C.focus} opacity={0.18} />
          <circle cx={p.x} cy={p.y} r={11} fill="none" stroke={C.focus} strokeWidth={1.6} strokeDasharray="3 2" />
        </g>
      ))}
    </g>
  );
}

function Face({ head, clipId, front }: { head: P; clipId: string; front: boolean }) {
  return (
    <g>
      <clipPath id={clipId}>
        <circle cx={head.x} cy={head.y} r={15} />
      </clipPath>
      <circle cx={head.x} cy={head.y} r={15} fill={C.skin} />
      {front ? (
        <ellipse cx={head.x} cy={head.y - 10} rx={19} ry={11} fill={C.hair} clipPath={`url(#${clipId})`} />
      ) : (
        <ellipse cx={head.x - 7} cy={head.y - 8} rx={17} ry={13} fill={C.hair} clipPath={`url(#${clipId})`} />
      )}
      {front ? (
        <>
          <circle cx={head.x - 5} cy={head.y + 1} r={1.4} fill={C.hair} />
          <circle cx={head.x + 5} cy={head.y + 1} r={1.4} fill={C.hair} />
          <circle cx={head.x - 8} cy={head.y + 6} r={2.4} fill={C.focus} opacity={0.25} />
          <circle cx={head.x + 8} cy={head.y + 6} r={2.4} fill={C.focus} opacity={0.25} />
          <path d={`M${head.x - 3.5} ${head.y + 7} Q${head.x} ${head.y + 10} ${head.x + 3.5} ${head.y + 7}`} stroke={C.hair} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx={head.x - 3} cy={head.y + 2} rx={2.8} ry={3.8} fill={C.skinShade} />
          <circle cx={head.x + 8} cy={head.y} r={1.4} fill={C.hair} />
          <circle cx={head.x + 8} cy={head.y + 6} r={2.4} fill={C.focus} opacity={0.25} />
          <path d={`M${head.x + 7} ${head.y + 8} Q${head.x + 10} ${head.y + 10} ${head.x + 13} ${head.y + 7}`} stroke={C.hair} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </>
      )}
    </g>
  );
}

/** 背骨のカーブ（H→C7）から胴体の輪郭を作る。t=0 が骨盤、t=1 が首の付け根 */
function torsoPath(H: P, L: P, T: P, C7: P): string {
  const n = 14;
  const front: P[] = [];
  const back: P[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = bez({ x: H.x, y: H.y - 4 }, L, T, { x: C7.x, y: C7.y + 4 }, t);
    // お腹側: 腰で細く、胸でふくらむ。背中側: ほぼ一定（肩甲骨のあたりで少し厚い）
    const fw = 10.5 + 3 * Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.45) / 0.55)))) + (t < 0.15 ? 2 : 0);
    const bw = 11 + 1.5 * Math.sin(Math.PI * t) + (t < 0.15 ? 2 : 0);
    front.push({ x: c.x + fw, y: c.y });
    back.push({ x: c.x - bw, y: c.y });
  }
  // 首の付け根で丸く閉じる
  const top = bez({ x: H.x, y: H.y - 4 }, L, T, { x: C7.x, y: C7.y + 4 }, 1);
  const pts = [...front, { x: top.x + 4, y: top.y - 7 }, { x: top.x - 6, y: top.y - 7 }, ...back.reverse()];
  return `M${pts.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" L")} Z`;
}

function SideFigure({ p, focus, guides, clipId }: { p: SideParams; focus: BodyArea[]; guides: boolean; clipId: string }) {
  const A: P = { x: 66, y: 212 };
  const K: P = { x: 69 + p.kneeX, y: 167 };
  const H: P = { x: 69 + p.hipX, y: 121 };
  const C7: P = { x: 66 + p.c7Fwd, y: 64 + p.headDrop * 0.4 };
  const L: P = { x: 70.5 + p.lordo, y: 104 };
  const T: P = { x: 63 + p.kyph, y: 86 };
  const head: P = { x: C7.x + 7 + p.headFwd, y: 37 + p.headDrop };
  const S: P = { x: C7.x + 3 + p.shoulderFwd, y: C7.y + 8 };
  const E: P = { x: S.x - 1 + p.shoulderFwd * 0.3, y: S.y + 29 };
  const W: P = { x: E.x + 5, y: E.y + 26 };
  const ear: P = { x: head.x - 3, y: head.y + 2 };
  const plumbX = 69;

  const area: Record<BodyArea, P[]> = {
    head: [head],
    neck: [{ x: (C7.x + head.x) / 2 - 2, y: (C7.y + head.y + 14) / 2 }],
    shoulder: [S],
    upperBack: [{ ...bez(H, L, T, C7, 0.72), x: bez(H, L, T, C7, 0.72).x - 13 }],
    lowerBack: [{ ...bez(H, L, T, C7, 0.28), x: bez(H, L, T, C7, 0.28).x - 13 }],
    pelvis: [{ x: H.x - 12, y: H.y + 3 }],
    hip: [{ x: H.x + 7, y: H.y + 6 }],
    knee: [K],
    ankle: [A],
  };

  return (
    <>
      <line x1={36} y1={220} x2={104} y2={220} stroke="#c8cfdf" strokeWidth={1.5} strokeLinecap="round" />
      {/* 脚 */}
      <path d={`M${H.x} ${H.y} L${K.x} ${K.y}`} stroke={C.pants} strokeWidth={19} strokeLinecap="round" />
      <path d={`M${K.x} ${K.y} L${A.x} ${A.y}`} stroke={C.pants} strokeWidth={15} strokeLinecap="round" />
      <path d={`M${A.x - 3} ${A.y + 3} L${A.x + 15} ${A.y + 4}`} stroke={C.shoe} strokeWidth={9} strokeLinecap="round" />
      {/* 骨盤 */}
      <ellipse cx={H.x - 1} cy={H.y} rx={14.5} ry={11.5} fill={C.pants} transform={`rotate(${p.pelvisTilt} ${H.x} ${H.y})`} />
      {/* 胴体（背骨のカーブに沿って、背中側・お腹側の輪郭を作る） */}
      <path d={torsoPath(H, L, T, C7)} fill={C.shirt} stroke={C.shirt} strokeWidth={3} strokeLinejoin="round" />
      {/* 首・頭 */}
      <path d={`M${C7.x + 1} ${C7.y} L${head.x - 3} ${head.y + 11}`} stroke={C.skin} strokeWidth={11} strokeLinecap="round" />
      <Face head={head} clipId={clipId} front={false} />
      {/* 腕 */}
      <path d={`M${S.x} ${S.y} L${E.x} ${E.y}`} stroke={C.shirtShade} strokeWidth={11} strokeLinecap="round" />
      <path d={`M${E.x} ${E.y} L${W.x} ${W.y}`} stroke={C.skin} strokeWidth={8.5} strokeLinecap="round" />
      <circle cx={W.x + 1} cy={W.y + 3} r={5} fill={C.skin} />
      {guides && (
        <line x1={plumbX} y1={14} x2={plumbX} y2={222} stroke={C.guide} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.9} />
      )}
      {guides && (
        <g fill={C.guide} stroke="white" strokeWidth={1}>
          {[ear, S, H, K, { x: A.x + 3, y: A.y - 2 }].map((pt, i) => (
            <circle key={i} cx={pt.x} cy={pt.y} r={2.6} />
          ))}
        </g>
      )}
      <Focus points={focus.flatMap((f) => area[f])} />
    </>
  );
}

function FrontFigure({ p, focus, guides, clipId }: { p: FrontParams; focus: BodyArea[]; guides: boolean; clipId: string }) {
  const cx = 70;
  const sd = 22 * Math.tan((p.shoulder * Math.PI) / 180);
  const pd = 13 * Math.tan((p.pelvis * Math.PI) / 180);
  const Ls: P = { x: cx - 23, y: 67 + sd };
  const Rs: P = { x: cx + 23, y: 67 - sd };
  const Lh: P = { x: cx - 12, y: 122 + pd };
  const Rh: P = { x: cx + 12, y: 122 - pd };
  const Lk: P = { x: cx - 11, y: 168 };
  const Rk: P = { x: cx + 11, y: 168 };
  const La: P = { x: cx - 10, y: 212 };
  const Ra: P = { x: cx + 10, y: 212 };
  const head: P = { x: cx + p.head * 0.8, y: 34 };
  const arm = (s: P, dir: -1 | 1) => {
    const e = { x: s.x + dir * 5, y: s.y + 30 };
    const w = { x: e.x + dir * 2, y: e.y + 26 };
    return (
      <g>
        <path d={`M${s.x} ${s.y} L${e.x} ${e.y}`} stroke={C.shirtShade} strokeWidth={11} strokeLinecap="round" />
        <path d={`M${e.x} ${e.y} L${w.x} ${w.y}`} stroke={C.skin} strokeWidth={8.5} strokeLinecap="round" />
        <circle cx={w.x} cy={w.y + 3} r={5} fill={C.skin} />
      </g>
    );
  };
  const area: Record<BodyArea, P[]> = {
    head: [head],
    neck: [{ x: cx, y: 54 }],
    shoulder: [Ls, Rs],
    upperBack: [{ x: cx, y: 82 }],
    lowerBack: [{ x: cx, y: 104 }],
    pelvis: [{ x: cx, y: 120 }],
    hip: [Lh, Rh],
    knee: [Lk, Rk],
    ankle: [La, Ra],
  };
  const tilted = Math.abs(p.shoulder) > 1 || Math.abs(p.pelvis) > 1;

  return (
    <>
      {guides && (
        <g stroke={C.guide} strokeWidth={1.2} strokeDasharray="4 3">
          <line x1={cx} y1={12} x2={cx} y2={222} />
          <line x1={20} y1={(Ls.y + Rs.y) / 2} x2={120} y2={(Ls.y + Rs.y) / 2} />
          <line x1={28} y1={(Lh.y + Rh.y) / 2} x2={112} y2={(Lh.y + Rh.y) / 2} />
        </g>
      )}
      <line x1={36} y1={220} x2={104} y2={220} stroke="#c8cfdf" strokeWidth={1.5} strokeLinecap="round" />
      {arm(Ls, -1)}
      {arm(Rs, 1)}
      {/* 脚 */}
      {[
        [Lh, Lk, La],
        [Rh, Rk, Ra],
      ].map(([h, k, a], i) => (
        <g key={i}>
          <path d={`M${h.x} ${h.y} L${k.x} ${k.y}`} stroke={C.pants} strokeWidth={17} strokeLinecap="round" />
          <path d={`M${k.x} ${k.y} L${a.x} ${a.y}`} stroke={C.pants} strokeWidth={14} strokeLinecap="round" />
          <ellipse cx={a.x + (i === 0 ? -2 : 2)} cy={a.y + 5} rx={8} ry={4.5} fill={C.shoe} />
        </g>
      ))}
      {/* 骨盤・胴体 */}
      <path
        d={`M${Lh.x - 6} ${Lh.y - 12} L${Rh.x + 6} ${Rh.y - 12} L${Rh.x + 4} ${Rh.y + 6} L${cx} ${(Lh.y + Rh.y) / 2 + 12} L${Lh.x - 4} ${Lh.y + 6} Z`}
        fill={C.pants}
        stroke={C.pants}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <path
        d={`M${Ls.x} ${Ls.y} L${Rs.x} ${Rs.y} L${Rh.x + 4} ${Rh.y - 12} L${Lh.x - 4} ${Lh.y - 12} Z`}
        fill={C.shirt}
        stroke={C.shirt}
        strokeWidth={12}
        strokeLinejoin="round"
      />
      <path d={`M${cx} 46 L${cx} 58`} stroke={C.skin} strokeWidth={11} strokeLinecap="round" />
      <path d={`M${cx - 7} 60 Q${cx} 66 ${cx + 7} 60`} stroke={C.shirtShade} strokeWidth={2} fill="none" strokeLinecap="round" />
      <g transform={`rotate(${p.head} ${head.x} ${head.y + 14})`}>
        <Face head={head} clipId={clipId} front />
      </g>
      {guides && tilted && (
        <g stroke={C.focus} strokeWidth={1.8} strokeLinecap="round">
          {Math.abs(p.shoulder) > 1 && <line x1={Ls.x - 8} y1={Ls.y + (Ls.y - Rs.y) * (8 / 46)} x2={Rs.x + 8} y2={Rs.y - (Ls.y - Rs.y) * (8 / 46)} />}
          {Math.abs(p.pelvis) > 1 && <line x1={Lh.x - 14} y1={Lh.y + (Lh.y - Rh.y) * (14 / 24)} x2={Rh.x + 14} y2={Rh.y - (Lh.y - Rh.y) * (14 / 24)} />}
        </g>
      )}
      <Focus points={focus.flatMap((f) => area[f])} />
    </>
  );
}

export function PostureFigure({
  posture,
  focus = [],
  guides = true,
  className = "",
  title,
}: {
  posture: PostureKey;
  focus?: BodyArea[];
  guides?: boolean;
  className?: string;
  title?: string;
}) {
  const clipId = `head-${posture}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const side = SIDE[posture];
  return (
    <svg viewBox="0 0 140 230" className={className} role="img" aria-label={title} data-posture={posture}>
      {title && <title>{title}</title>}
      {side ? (
        <SideFigure p={side} focus={focus} guides={guides} clipId={clipId} />
      ) : (
        <FrontFigure p={FRONT[posture] ?? FRONT["front-neutral"]} focus={focus} guides={guides} clipId={clipId} />
      )}
    </svg>
  );
}
