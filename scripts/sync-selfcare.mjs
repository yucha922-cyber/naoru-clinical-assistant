#!/usr/bin/env node
// セルフケアデータの取り込みスクリプト（読み取り専用）
//
// 既存の selfexercise リポジトリ（https://github.com/yucha922-cyber/selfexercise）の
//   - src/data/selfcare/*.md      … 種目の原本
//   - src/data/categories.ts      … 症状・部位の名前
//   - src/config/clinic.ts        … 会員コード不要で閲覧できる種目（recommendedSlugs）
//   - public/images/<slug>/       … 公式画像（ファイル名のみ参照。画像はコピーしない）
// を読み取り、src/data/selfcare.json を生成します。selfexercise 側のファイルは一切変更しません。
//
// 使い方:
//   npm run sync:selfcare                         # .cache/selfexercise に shallow clone / 更新して取り込む
//   npm run sync:selfcare -- --source ../selfexercise   # 手元のクローンから取り込む
//   SELFEXERCISE_DIR=../selfexercise npm run sync:selfcare
//
// オプション:
//   --source <dir>     selfexercise のローカルパス
//   --repo <url>       クローン元（既定: https://github.com/yucha922-cyber/selfexercise）
//   --site <url>       公開サイトのURL（既定: https://yucha922-cyber.github.io/selfexercise）
//   --check            生成結果を書き込まず、既存の selfcare.json と差分があれば終了コード1

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildExercise,
  parseCategories,
  parseFreeSlugs,
  parseSelfCareMarkdown,
} from "./lib/selfcare-parser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "selfcare.json");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};
const REPO = opt("--repo") ?? "https://github.com/yucha922-cyber/selfexercise";
const SITE = (opt("--site") ?? "https://yucha922-cyber.github.io/selfexercise").replace(/\/$/, "");
const CHECK = args.includes("--check");

function git(cwd, ...a) {
  return execFileSync("git", a, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function resolveSource() {
  const given = opt("--source") ?? process.env.SELFEXERCISE_DIR;
  if (given) return path.resolve(given);
  const cache = path.join(ROOT, ".cache", "selfexercise");
  // 画像の中身は不要なので blob を取得しない（ファイル名だけ分かればよい）
  if (fs.existsSync(path.join(cache, ".git"))) {
    console.log(`更新中: ${cache}`);
    git(cache, "fetch", "--depth", "1", "--filter=blob:none", "origin", "HEAD");
    git(cache, "reset", "--hard", "FETCH_HEAD");
  } else {
    console.log(`クローン中: ${REPO} → ${cache}`);
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    execFileSync(
      "git",
      ["clone", "--depth", "1", "--filter=blob:limit=200k", "--no-checkout", REPO, cache],
      { stdio: "inherit", env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } },
    );
    // 必要なのはテキスト原本と画像のファイル名だけ。sparse checkout で大きな画像を展開しない
    git(cache, "sparse-checkout", "set", "--no-cone", "/src/data/", "/src/config/", "/README.md");
    git(cache, "checkout");
  }
  return cache;
}

/** 画像フォルダのファイル名一覧（作業ツリーに無ければ git の索引から取得） */
function listFolder(source, slug) {
  const dir = path.join(source, "public", "images", slug);
  if (fs.existsSync(dir)) return fs.readdirSync(dir);
  try {
    // -z: 日本語ファイル名をエスケープせずに取得する
    const out = git(source, "ls-tree", "-z", "--name-only", "HEAD", `public/images/${slug}/`);
    return out.split("\0").filter(Boolean).map((p) => p.split("/").pop());
  } catch {
    return [];
  }
}

function main() {
  const source = resolveSource();
  const dataDir = path.join(source, "src", "data", "selfcare");
  if (!fs.existsSync(dataDir)) throw new Error(`セルフケア原本が見つかりません: ${dataDir}`);

  const categories = parseCategories(
    fs.readFileSync(path.join(source, "src", "data", "categories.ts"), "utf-8"),
  );
  const clinicPath = path.join(source, "src", "config", "clinic.ts");
  const freeSlugs = fs.existsSync(clinicPath) ? parseFreeSlugs(fs.readFileSync(clinicPath, "utf-8")) : [];

  let commit = null;
  try {
    commit = git(source, "rev-parse", "HEAD");
  } catch {
    /* git 管理外のフォルダでも動作させる */
  }

  const errors = [];
  const warnings = [];
  const exercises = [];
  const files = fs
    .readdirSync(dataDir)
    .filter((f) => f.endsWith(".md") && !f.startsWith("_") && !f.startsWith("."))
    .sort();

  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    try {
      const parsed = parseSelfCareMarkdown(fs.readFileSync(path.join(dataDir, file), "utf-8"), file);
      const folderFiles = listFolder(source, slug);
      const ex = buildExercise({
        slug,
        parsed,
        imageFiles: folderFiles,
        folderFiles,
        categories,
        freeSlugs,
        siteBase: SITE,
      });
      if (ex.images.length === 0) warnings.push(`${slug}: 画像がありません`);
      if (ex.instructions.length === 0) warnings.push(`${slug}: 実施方法がありません`);
      for (const c of [...ex.category, ...ex.bodyPart]) {
        if (c.name === null) warnings.push(`${slug}: 未定義のカテゴリー slug「${c.slug}」`);
      }
      exercises.push(ex);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  if (errors.length > 0) {
    console.error("取り込みに失敗しました（selfcare.json は更新していません）:");
    errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  exercises.sort((a, b) => {
    const oa = a.order ?? Number.MAX_SAFE_INTEGER;
    const ob = b.order ?? Number.MAX_SAFE_INTEGER;
    return oa !== ob ? oa - ob : a.title.localeCompare(b.title, "ja");
  });

  const data = {
    source: { repository: REPO, site: SITE, commit },
    categories,
    exercises,
  };
  const json = JSON.stringify(data, null, 2) + "\n";

  if (CHECK) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf-8") : "";
    if (current !== json) {
      console.error("selfcare.json が最新ではありません。npm run sync:selfcare を実行してください。");
      process.exit(1);
    }
    console.log("selfcare.json は最新です。");
    return;
  }

  fs.writeFileSync(OUT, json);
  console.log(`✔ ${exercises.length} 種目を書き出しました → ${path.relative(ROOT, OUT)}`);
  console.log(`  取り込み元コミット: ${commit ?? "(不明)"}`);
  if (warnings.length) {
    console.log("注意:");
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
}

main();
