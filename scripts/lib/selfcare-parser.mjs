// selfexercise リポジトリのセルフケア原本（Markdown + 画像フォルダ）を読み取るための純粋関数群。
// selfexercise 側の src/lib/content.ts / src/lib/selfcare.ts の読み取り規則に合わせています。
// ただし、原本に存在しない値は推測で埋めず null にします（例: duration 未記入 → null）。

/** 「## 見出し」として使える名前（selfexercise と同じゆらぎ吸収） */
const SECTION_ALIASES = {
  目的: "purpose",
  実施方法: "steps",
  やり方: "steps",
  手順: "steps",
  注意点: "cautions",
  注意事項: "cautions",
};

const toList = (lines) =>
  lines.map((l) => l.replace(/^[-*・]\s*/, "").trim()).filter((l) => l.length > 0);

const toArray = (value) =>
  (value ?? "")
    .replace(/^\[|\]$/g, "")
    .split(/[,、]/)
    .map((v) => v.trim().replace(/^["']|["']$/g, ""))
    .filter((v) => v.length > 0);

const toNumberOrNull = (value, field, file) => {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) throw new Error(`${file} の ${field} が数値ではありません: ${value}`);
  return n;
};

const emptyToNull = (v) => (v === undefined || v.trim() === "" ? null : v.trim());

/**
 * セルフケア1件分の Markdown を解析する。
 * @returns {{ meta: Record<string,string>, title: string, purpose: string|null, steps: string[], cautions: string[], duration: string|null, difficulty: number|null, symptoms: string[], parts: string[], tags: string[], order: number|null, youtube: string|null, youtubeMobile: string|null }}
 */
export function parseSelfCareMarkdown(raw, file) {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error(`${file}: 先頭の --- で囲んだ設定が見つかりません`);
  const [, frontmatter, body] = match;

  const meta = {};
  for (const line of frontmatter.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) throw new Error(`${file}: 設定行に「:」がありません: ${line.trim()}`);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }

  const sections = { purpose: [], steps: [], cautions: [] };
  let current = null;
  for (const line of body.split("\n")) {
    const heading = line.match(/^#{2,3}\s*(.+?)\s*$/);
    if (heading) {
      current = SECTION_ALIASES[heading[1].replace(/\s/g, "")] ?? null;
      continue;
    }
    if (current && line.trim()) sections[current].push(line);
  }

  if (!meta.title) throw new Error(`${file}: title がありません`);

  const purpose = toList(sections.purpose).join("\n");
  return {
    meta,
    title: meta.title,
    purpose: purpose === "" ? null : purpose,
    steps: toList(sections.steps),
    cautions: toList(sections.cautions),
    duration: emptyToNull(meta.duration),
    difficulty: toNumberOrNull(meta.difficulty, "difficulty", file),
    symptoms: toArray(meta.symptoms),
    parts: toArray(meta.parts),
    tags: toArray(meta.tags),
    order: toNumberOrNull(meta.order, "order", file),
    youtube: emptyToNull(meta.youtube ?? meta.youtubeId),
    youtubeMobile: emptyToNull(meta.youtube_mobile ?? meta.youtubeMobile ?? meta.youtube_sp),
  };
}

// ---- 画像（public/images/<slug>/ のファイル名から役割を判定） ----
export const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
export const VIDEO_EXTS = new Set([".mp4", ".m4v", ".webm", ".mov"]);

const ROLES = [
  { aliases: ["start", "開始姿勢", "開始"], label: "開始姿勢", kind: "ok" },
  { aliases: ["end", "終了姿勢", "終了"], label: "終了姿勢", kind: "ok" },
  { aliases: ["ng", "ng例", "ダメな例", "だめな例"], label: "ダメな例", kind: "ng" },
];
const STEP_ALIASES = ["step", "手順"];
const STEP_MARKS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];

const extOf = (f) => {
  const i = f.lastIndexOf(".");
  return i === -1 ? "" : f.slice(i).toLowerCase();
};
const baseOf = (f) => {
  const i = f.lastIndexOf(".");
  return i === -1 ? f : f.slice(0, i);
};

function matchStep(base) {
  for (const alias of STEP_ALIASES) {
    if (!base.toLowerCase().startsWith(alias.toLowerCase())) continue;
    const m = base.slice(alias.length).match(/^(\d{1,2})(.*)$/);
    if (!m) continue;
    const index = Number(m[1]);
    if (index < 1 || index > STEP_MARKS.length) continue;
    if (m[2] !== "" && !/^[-_ \u3000]/.test(m[2])) continue;
    return { index, caption: m[2].replace(/^[-_ \u3000]+/, "").trim() };
  }
  return null;
}

function matchRole(base) {
  for (const role of ROLES) {
    for (const alias of role.aliases) {
      if (!base.toLowerCase().startsWith(alias.toLowerCase())) continue;
      const rest = base.slice(alias.length);
      if (rest === "" || /^[-_ \u3000]/.test(rest)) {
        return { role, caption: rest.replace(/^[-_ \u3000]+/, "").trim() };
      }
    }
  }
  return null;
}

/**
 * 画像ファイル名の一覧を、selfexercise の表示順（手順 → 開始/終了/ダメな例 → その他）に並べる。
 * @param {string[]} fileNames
 * @returns {{ file: string, label: string|null, kind: "ok"|"ng"|"step"|null, caption: string|null }[]}
 */
export function orderImages(fileNames) {
  const files = fileNames.filter((f) => !f.startsWith(".") && IMAGE_EXTS.has(extOf(f)));
  const steps = [];
  const roles = [];
  const others = [];
  for (const file of files) {
    const base = baseOf(file);
    const step = matchStep(base);
    if (step) {
      steps.push({
        index: step.index,
        image: { file, label: STEP_MARKS[step.index - 1], kind: "step", caption: step.caption || null },
      });
      continue;
    }
    const role = matchRole(base);
    if (role) {
      roles.push({ file, label: role.role.label, kind: role.role.kind, caption: role.caption || null });
    } else {
      const caption = base.replace(/^\d+[-_ ]*/, "").trim();
      others.push({ file, label: null, kind: null, caption: caption || null });
    }
  }
  steps.sort((a, b) => a.index - b.index);
  roles.sort(
    (a, b) => ROLES.findIndex((r) => r.label === a.label) - ROLES.findIndex((r) => r.label === b.label),
  );
  others.sort((a, b) => a.file.localeCompare(b.file, "ja", { numeric: true }));
  return [...steps.map((s) => s.image), ...roles, ...others];
}

export function findVideo(fileNames) {
  return (
    fileNames
      .filter((f) => !f.startsWith(".") && VIDEO_EXTS.has(extOf(f)))
      .sort((a, b) => a.localeCompare(b, "ja", { numeric: true }))[0] ?? null
  );
}

/** src/data/categories.ts から SYMPTOMS / PARTS の { slug, name } を抜き出す */
export function parseCategories(tsSource) {
  const block = (name) => {
    const m = tsSource.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
    if (!m) throw new Error(`categories.ts に ${name} が見つかりません`);
    return [...m[1].matchAll(/\{\s*slug:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*\}/g)].map((x) => ({
      slug: x[1],
      name: x[2],
    }));
  };
  return { symptoms: block("SYMPTOMS"), parts: block("PARTS") };
}

/** src/config/clinic.ts から recommendedSlugs（会員コード不要で閲覧できる種目）を抜き出す */
export function parseFreeSlugs(tsSource) {
  const m = tsSource.match(/recommendedSlugs:\s*\[([^\]]*)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** 画像・動画など公開ファイルの URL（ファイル名は日本語を含むためエンコードする） */
export const assetUrl = (siteBase, slug, file) =>
  `${siteBase}/images/${encodeURIComponent(slug)}/${encodeURIComponent(file)}`;

/** YouTube の値（ID または URL）を視聴 URL にする。原本の値が URL ならそのまま使う。 */
export function youtubeUrl(value) {
  if (!value) return null;
  if (/^https?:\/\//.test(value)) return value;
  if (/^[\w-]{11}$/.test(value)) return `https://youtu.be/${value}`;
  return null;
}

/**
 * 1種目分の出力レコードを組み立てる。
 */
export function buildExercise({ slug, parsed, imageFiles, folderFiles, categories, freeSlugs, siteBase }) {
  const nameOf = (list, s) => list.find((c) => c.slug === s)?.name ?? null;
  const images = orderImages(imageFiles).map((img) => ({
    url: assetUrl(siteBase, slug, img.file),
    path: `public/images/${slug}/${img.file}`,
    label: img.label,
    kind: img.kind,
    caption: img.caption,
  }));
  const video = findVideo(folderFiles);
  return {
    id: slug,
    slug,
    title: parsed.title,
    category: parsed.symptoms.map((s) => ({ slug: s, name: nameOf(categories.symptoms, s) })),
    bodyPart: parsed.parts.map((p) => ({ slug: p, name: nameOf(categories.parts, p) })),
    purpose: parsed.purpose,
    instructions: parsed.steps,
    precautions: parsed.cautions,
    duration: parsed.duration,
    difficulty: parsed.difficulty,
    tags: parsed.tags,
    order: parsed.order,
    images,
    imageUrls: images.map((i) => i.url),
    videoUrl: youtubeUrl(parsed.youtube) ?? (video ? assetUrl(siteBase, slug, video) : null),
    videoMobileUrl: youtubeUrl(parsed.youtubeMobile),
    detailUrl: `${siteBase}/selfcare/${encodeURIComponent(slug)}/`,
    requiresMemberCode: !freeSlugs.includes(slug),
    sourceFile: `src/data/selfcare/${slug}.md`,
  };
}
