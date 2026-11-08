#!/usr/bin/env node
// ブラウザでの通し動作確認（E2E）。架空のサンプルデータのみを使用します。
//
//   npm run build && npm run e2e
//
// - Playwright はプロジェクトの依存に含めていません。インストール済みの playwright を使います
//   （未インストールなら `npm i -D playwright && npx playwright install chromium`）。
// - selfexercise の画像を手元のクローンから配信したい場合（オフライン環境など）:
//     E2E_IMAGES_DIR=../selfexercise/public/images npm run e2e
//   未指定なら公開サイト（GitHub Pages）から実際に読み込みます。
// - 成果物（スクリーンショット・PDF）は artifacts/ に出力します（.gitignore 済み）。

import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("playwright が見つかりません。`npm i -D playwright && npx playwright install chromium` を実行してください。");
  process.exit(2);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "artifacts");
fs.mkdirSync(OUT, { recursive: true });
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}/`;
const SITE = "https://yucha922-cyber.github.io/selfexercise";
const IMAGES_DIR = process.env.E2E_IMAGES_DIR ? path.resolve(process.env.E2E_IMAGES_DIR) : null;
const FICTIONAL_NAME = "架空 花子";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
};

/** PDF の各ページの文字（空白を除く）。運動カードがページの途中で分かれていないかの確認に使う */
function pdfPageTexts(file) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    let t;
    try {
      t = execFileSync("pdftotext", ["-f", String(i), "-l", String(i), "-enc", "UTF-8", file, "-"], { encoding: "utf-8" });
    } catch {
      break;
    }
    if (!t.trim() && i > 1) break;
    out.push(t.replace(/\s+/g, ""));
  }
  return out;
}

/** 運動カードごとに「運動名」と「最後の注意事項」が同じページにあるか（＝カードが分断されていないか） */
function cardsNotSplit(pages, cards) {
  return cards.map((c) => {
    const tail = c.lastCaution.replace(/\s+/g, "").slice(-12);
    // 同じ注意文が別の運動にもあるため、「運動名のあるページ」に注意文があるかで判定する
    const titlePage = pages.findIndex((p) => p.includes(c.title.replace(/\s+/g, "")));
    return { title: c.title, titlePage, ok: titlePage >= 0 && pages[titlePage].includes(tail) };
  });
}

/** 資料内の文字サイズ（px）・QRコードの大きさ（mm）・カードの配置 */
async function docMetrics(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="a4-sheet"]');
    const mmPerPx = 210 / sheet.getBoundingClientRect().width;
    const sizes = [];
    const walker = document.createTreeWalker(document.querySelector("#doc-content"), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (el.closest("svg")) continue;
      sizes.push({ px: parseFloat(getComputedStyle(el).fontSize), text: n.textContent.trim().slice(0, 12) });
    }
    const min = sizes.reduce((a, b) => (b.px < a.px ? b : a), { px: 99, text: "" });
    const qr = Array.from(document.querySelectorAll("#print-root img[data-qr]")).map((i) => +(i.getBoundingClientRect().width * mmPerPx).toFixed(1));
    const cards = Array.from(document.querySelectorAll("[data-doc-exercise]")).map((c) => {
      const r = c.getBoundingClientRect();
      return { slug: c.getAttribute("data-doc-exercise"), layout: c.getAttribute("data-layout"), wMm: +(r.width * mmPerPx).toFixed(1), top: Math.round(r.top) };
    });
    const content = document.querySelector("#doc-content").getBoundingClientRect();
    return {
      minFontPt: +(min.px * 0.75).toFixed(1),
      minFontText: min.text,
      qrMm: qr,
      cards,
      contentWmm: +(content.width * mmPerPx).toFixed(1),
      zoomStyle: document.querySelector("#doc-content").style.zoom || "",
      sections: Array.from(document.querySelectorAll("[data-doc-section]")).map((e) => e.getAttribute("data-doc-section")),
    };
  });
}

async function printPdf(page, file) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("#print-root img"));
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.emulateMedia({ media: "print" });
  const buf = await page.pdf({ path: file, format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: "screen" });
  return { pages: (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length, file };
}

/** 選択中の運動の「運動名」と「最後の注意事項」（ライブラリのデータから） */
const SELFCARE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "selfcare.json"), "utf-8"));
const cardInfo = (slugs) =>
  slugs.map((slug) => {
    const e = SELFCARE_DATA.exercises.find((x) => x.slug === slug);
    return { title: e.title, lastCaution: e.precautions.at(-1) ?? e.title };
  });

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.error("dist/ がありません。先に npm run build を実行してください。");
  process.exit(2);
}

const server = spawn(process.execPath, [path.join(ROOT, "node_modules/vite/bin/vite.js"), "preview", "--port", String(PORT), "--strictPort"], {
  cwd: ROOT,
  stdio: "ignore",
});
const stop = () => server.kill();
process.on("exit", stop);

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("preview サーバーが起動しません");
}

async function routeImages(context, { breakUrl } = {}) {
  const external = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith("data:")) return route.continue();
    if (url.startsWith(`${SITE}/images/`)) {
      if (breakUrl && url.includes(breakUrl)) return route.fulfill({ status: 404, body: "" });
      if (IMAGES_DIR) {
        const rel = decodeURIComponent(url.slice(`${SITE}/images/`.length));
        const file = path.join(IMAGES_DIR, rel);
        if (fs.existsSync(file)) return route.fulfill({ status: 200, path: file, contentType: "image/jpeg" });
        return route.fulfill({ status: 404, body: "" });
      }
      return route.continue();
    }
    if (/huggingface\.co|raw\.githubusercontent\.com/.test(url)) return route.abort(); // AIモデルのダウンロード先（E2Eでは遮断）
    external.push(url);
    return route.abort();
  });
  return external;
}

await waitServer();
// ソフトウェア版 WebGPU を有効にして、端末内AIの画面・エラー処理も確認する
const browser = await chromium.launch({ args: ["--enable-unsafe-webgpu", "--use-webgpu-adapter=swiftshader"] });

try {
  // ---------- メインの通しテスト（PC幅） ----------
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE.slice(0, -1) });
  const external = await routeImages(context);
  const page = await context.newPage();
  const consoleText = [];
  page.on("console", (m) => consoleText.push(m.text()));
  page.on("pageerror", (e) => consoleText.push(`PAGEERROR ${e.message}`));
  page.on("dialog", (d) => d.accept());

  await page.goto(BASE);
  check("トップ画面が表示される", await page.getByRole("heading", { name: "Clinical Assistant" }).isVisible());

  // 日本語フォント
  await page.evaluate(() => document.fonts.ready);
  const fontOk = await page.evaluate(() => document.fonts.check('16px "Noto Sans JP Variable"', "日本語あア"));
  check("日本語フォント（Noto Sans JP）が読み込まれる", fontOk);

  // 端末内AI（既定のタブ）: この端末で使えるかの判定結果が表示される
  const localPanel = page.getByTestId("local-ai");
  await localPanel.getByText(/この端末・ブラウザでは使えません|AIモデル/).first().waitFor({ timeout: 20000 });
  const gpuSupported = await localPanel.getByText("AIモデル", { exact: true }).isVisible();
  check("端末内AIの利用可否を判定して表示する", true, gpuSupported ? "WebGPU 利用可" : "WebGPU 非対応のため案内を表示");
  if (gpuSupported) {
    // モデルのダウンロード先は E2E では遮断しているため、失敗時のエラー表示まで確認する
    await page.getByRole("button", { name: "サンプル（架空）" }).click();
    await localPanel.getByRole("button", { name: "AIでカルテ・資料を作成" }).click();
    const err = await localPanel.getByRole("alert").first().waitFor({ timeout: 60000 }).then(() => localPanel.getByRole("alert").first().innerText()).catch(() => "");
    check("端末内AI: モデルを取得できない場合にエラーを表示し、入力は残る", err.length > 0 && (await page.getByLabel("施術メモ").inputValue()).includes("架空のサンプル"), err.slice(0, 80));
    await page.getByRole("button", { name: "すべて消去" }).click();
  }
  await page.getByRole("tab", { name: "ChatGPT／Claudeにコピー" }).click();

  // 空のままプロンプトコピー → 案内
  await page.getByRole("button", { name: "① プロンプトと入力内容をコピー" }).click();
  check("メモ未入力でコピーすると案内が出る", await page.getByRole("status").filter({ hasText: "施術メモを入力" }).isVisible());

  // 架空サンプル読み込み
  await page.getByRole("button", { name: "サンプル（架空）" }).click();
  const memo = await page.getByLabel("施術メモ").inputValue();
  check("架空サンプルを読み込める", memo.includes("架空のサンプル"));

  // 個人情報の警告（メモにお名前を書いた場合）
  await page.getByLabel("施術メモ").fill(`${memo}\n${FICTIONAL_NAME}さん`);
  check("メモに氏名があると警告が出る", await page.getByText("個人情報が含まれている可能性があります").isVisible());
  await page.getByLabel("施術メモ").fill(memo);

  // プロンプトをコピー
  await page.getByRole("button", { name: "① プロンプトと入力内容をコピー" }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  check(
    "統合プロンプトをコピーできる（選択セルフケアを含み、氏名を含まない）",
    prompt.includes("kata-chest-stretch") && prompt.includes("頸椎回旋") && !prompt.includes(FICTIONAL_NAME),
    `${prompt.length}文字`,
  );

  // 壊れた JSON の取り込み
  const broken = '{"karte": {"chiefComplaint": "腰痛"}, "patient": {"currentState": "途中で';
  await page.getByLabel("② AIの返答をここに貼り付け").fill(broken);
  await page.getByRole("button", { name: "③ 取り込む" }).click();
  const errVisible = await page.getByRole("alert").filter({ hasText: "取り込めませんでした" }).isVisible();
  const kept = (await page.getByLabel("② AIの返答をここに貼り付け").inputValue()) === broken;
  check("不完全なJSONはエラー表示し、貼り付けた内容を保持する", errVisible && kept);

  // 正しい返答例を取り込む
  await page.getByRole("button", { name: "返答例（架空）を貼る" }).click();
  await page.getByRole("button", { name: "③ 取り込む" }).click();
  check("AIの返答（架空）を取り込める", await page.getByText("取り込みました", { exact: true }).isVisible());
  check("特定できない運動が確認待ちになる", await page.getByText("壁を使ったドリル").first().isVisible());

  // 3種目（サンプル）の資料: 新しい構成・イラスト・アイコン・文字サイズ・QR・ページ分割
  await page.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  await page.getByTestId("page-count").waitFor();
  await page.waitForTimeout(500);
  const figures = await page.locator("#print-root svg[data-posture]").evaluateAll((els) => els.map((e) => e.getAttribute("data-posture")));
  const focusMarks = await page.locator("#print-root svg[data-posture] [data-focus] circle").count();
  const mindIcons = await page.locator("#print-root [data-mind-icon]").evaluateAll((els) => els.map((e) => e.getAttribute("data-mind-icon")));
  check(
    "資料に今・目指す姿勢のイラスト、気になる部位の印、生活のアイコンが入る",
    figures.join() === "side-forward-head,side-neutral" && focusMarks > 0 && mindIcons.join() === "break,desk,breath",
    `${figures.join(" → ")} / 印${focusMarks / 2}か所 / ${mindIcons.join(",")}`,
  );
  check("あなたの目標（本人のHOPE）が表示される", (await page.locator("[data-doc-goal]").innerText()).includes("仕事終わりも肩を気にせず過ごしたい"));
  const docText3 = await page.getByTestId("a4-sheet").innerText();
  const newSections = ["あなたの目標", "今のお身体の状態", "今日確認できた変化", "これから目指すお身体の状態", "日常生活で意識すること", "今日のセルフケア", "次回来院までの目標"];
  check("新しい構成（7項目）がすべて表示される", newSections.every((t) => docText3.includes(t)), newSections.filter((t) => !docText3.includes(t)).join(",") || "OK");
  check("今日確認できた変化に、メモの実測値（45°→55°、10→4）が表示される", /首を右に向ける動き[\s\S]*45°[\s\S]*55°/.test(docText3) && /施術直後の変化です/.test(docText3));
  check("運動の目的（ライブラリの説明）が表示される", (await page.locator("#print-root [data-doc-purpose]").count()) === 3);
  const m3 = await docMetrics(page);
  check("文字が小さくなりすぎていない（最小8pt以上・全体の縮小なし）", m3.minFontPt >= 8 && m3.zoomStyle === "", `最小 ${m3.minFontPt}pt「${m3.minFontText}」`);
  check("QRコードが印刷で読み取れる大きさ（20mm以上）", m3.qrMm.length === 3 && m3.qrMm.every((q) => q >= 20), m3.qrMm.join("mm, ") + "mm");
  check("セルフケア3種目は2列のカードで表示", m3.cards.every((c) => c.layout === "card") && m3.cards[0].top === m3.cards[1].top && m3.cards[2].top > m3.cards[0].top, m3.cards.map((c) => `${c.wMm}mm`).join(" / "));
  const pageCount3 = await page.getByTestId("page-count").innerText();
  const pdf3 = await printPdf(page, path.join(OUT, "patient-document-3items.pdf"));
  check("画面に表示するページ数が実際の PDF と一致する（3種目）", pageCount3.includes(pdf3.pages === 1 ? "1枚" : `${pdf3.pages} ページ`), `画面「${pageCount3}」/ PDF ${pdf3.pages}ページ`);
  const split3 = cardsNotSplit(pdfPageTexts(pdf3.file), cardInfo(["kata-chest-stretch", "kubi-chin-tuck", "kubi-thoracic-extension"]));
  check(
    "3種目の PDF: 運動カードがページの途中で分かれない（2ページまで）",
    pdf3.pages <= 2 && split3.every((c) => c.ok),
    `${pdf3.pages}ページ / ${split3.map((c) => `${c.title}:p${c.titlePage + 1}`).join(", ")}`,
  );
  await page.locator("nav").getByRole("button", { name: /カルテ入力/ }).click();

  // カルテ
  await page.locator("nav").getByRole("button", { name: /カルテ確認/ }).click();
  const karteOut = await page.getByTestId("karte-output").innerText();
  check("カルテが NAORU フォーマットで表示される", karteOut.startsWith("【プラン・頻度】") && karteOut.includes("【主訴】") && !karteOut.includes("【離反理由】"));
  await page.locator('[data-karte-field="history"]').fill("特記なし（架空）");
  await page.getByRole("button", { name: "カルテをコピー" }).click();
  const copiedKarte = await page.evaluate(() => navigator.clipboard.readText());
  check("カルテを編集してコピーできる", copiedKarte.includes("【既往歴・通院歴】\n特記なし（架空）") && copiedKarte === (await page.getByTestId("karte-output").innerText()));
  check("AIの確認事項が表示される", await page.getByText("確認事項（AIからの指摘）").isVisible());

  // セルフケア選択
  await page.locator("nav").getByRole("button", { name: /セルフケア選択/ }).click();
  await page.getByLabel("キーワード検索").fill("胸椎");
  const searchCount = await page.locator("ul > li button[aria-pressed]").count();
  check("キーワード検索できる", searchCount >= 1, `${searchCount}件`);
  await page.getByLabel("キーワード検索").fill("");
  await page.getByRole("button", { name: "膝痛", exact: true }).click();
  const kneeTitles = await page.locator("ul > li button[aria-pressed] span.font-bold").allInnerTexts();
  check("症状別に絞り込める", kneeTitles.length > 0 && kneeTitles.length < 32, kneeTitles.join(" / "));
  await page.getByRole("button", { name: "部位別" }).click();
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await page.getByRole("button", { name: "ふくらはぎ", exact: true }).click();
  await page.locator("ul > li button[aria-pressed]", { hasText: "ふくらはぎストレッチ" }).click();
  const dosage = page.locator('input[placeholder^="例: 左右20秒"]').last();
  await dosage.fill("30秒×2回（架空）");
  check("複数種目を選択し、回数・時間を編集できる", (await page.getByText("選択済み（4）").count()) === 1);
  await page.waitForSelector("[data-screen=selfcare] img[data-qr]");
  check("QRコードが生成される", (await page.locator("[data-screen=selfcare] img[data-qr]").count()) === 4);
  check("注意事項が表示される", (await page.getByText("注意事項", { exact: true }).count()) >= 1);

  // 患者資料
  await page.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  const sheet = page.getByTestId("a4-sheet");
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("#print-root img"));
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  const sheetText = await sheet.innerText();
  check("資料の主な項目が表示される", ["今のお身体の状態", "これから目指すお身体の状態", "日常生活で意識すること", "今日のセルフケア"].every((t) => sheetText.includes(t)));
  check("資料に選択した運動だけが載る", (await page.locator("[data-doc-exercise]").count()) === 4 && !sheetText.includes("壁を使ったドリル"));
  const imgStats = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll("#print-root img:not([data-qr])"));
    return {
      total: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      contain: imgs.every((i) => getComputedStyle(i).objectFit === "contain"),
      broken: document.querySelectorAll("#print-root [data-broken-image]").length,
    };
  });
  check(
    "運動画像（公式画像）が読み込まれ、縦横比を維持（object-fit: contain）",
    imgStats.total > 0 && imgStats.loaded === imgStats.total && imgStats.contain && imgStats.broken === 0,
    JSON.stringify(imgStats) + (IMAGES_DIR ? "（ローカルのselfexercise画像を使用）" : ""),
  );
  check("資料のQRコードが表示される", (await page.locator("#print-root img[data-qr]").count()) === 4);
  const overflow = await page.evaluate(() => {
    const s = document.querySelector('[data-testid="a4-sheet"]');
    const sr = s.getBoundingClientRect();
    const bad = Array.from(s.querySelectorAll("*")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > sr.right + 0.5 || r.left < sr.left - 0.5 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.tagName !== "IMG");
    });
    return { sheetWidth: sr.width, bad: bad.slice(0, 5).map((e) => e.tagName + "." + e.className.toString().slice(0, 40)) };
  });
  check("資料の文字・要素がA4幅からはみ出さない", overflow.bad.length === 0 && Math.abs(overflow.sheetWidth - 793.7) < 2, JSON.stringify(overflow));
  await sheet.screenshot({ path: path.join(OUT, "patient-document.png") });

  // PDF（印刷用CSSで出力）
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ path: path.join(OUT, "patient-document.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const hiddenUi = await page.evaluate(() => getComputedStyle(document.querySelector("header")).display === "none");
  const pdfText = pdf.toString("latin1");
  const linkedSlugs = ["kata-chest-stretch", "kubi-chin-tuck", "kubi-thoracic-extension", "calf-stretch"].filter((slug) =>
    pdfText.includes(`/URI (${SITE}/selfcare/${slug}/)`),
  );
  check("PDF内の運動名・QRコードがタップできるリンクになっている", linkedSlugs.length === 4, `${linkedSlugs.length}/4 種目`);
  check("A4 PDF を出力できる（印刷時はアプリのUIを隠す）", pdf.length > 10000 && pages >= 1 && hiddenUi, `${pages}ページ, ${(pdf.length / 1024).toFixed(0)}KB`);
  const breaks = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-doc-exercise]")).every((el) => getComputedStyle(el).breakInside === "avoid"),
  );
  check("運動カードの途中で改ページしない設定（break-inside: avoid）", breaks);
  await page.emulateMedia({ media: "screen" });

  // 個人情報の取り扱い
  const storage = await page.evaluate(async () => ({
    localKeys: Object.keys(localStorage),
    localValues: Object.keys(localStorage).map((k) => localStorage.getItem(k)),
    session: sessionStorage.length,
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
    cookie: document.cookie,
    url: location.href,
  }));
  // 保存してよいのは「お気に入り・最近使った運動」の運動IDだけ（患者情報は保存しない）
  const prefsOnly =
    storage.localKeys.every((k) => k === "naoru.selfcarePrefs.v1") &&
    storage.localValues.every((v) => {
      const o = JSON.parse(v);
      return [...(o.favorites ?? []), ...(o.recent ?? [])].every((x) => /^[a-z0-9-]+$/.test(x)) && !/架空|頸椎|主訴|施術/.test(v);
    });
  check(
    "患者情報をブラウザのストレージ・Cookie・URL に残さない（保存されるのは運動IDの設定だけ）",
    prefsOnly && storage.session === 0 && storage.idb === 0 && storage.cookie === "" && storage.url === BASE,
    JSON.stringify({ keys: storage.localKeys, values: storage.localValues, url: storage.url }),
  );
  const leaked = consoleText.filter((t) => t.includes("架空") || t.includes("頸椎") || t.includes("PAGEERROR"));
  check("コンソールに患者データ・エラーを出力しない", leaked.length === 0, leaked.slice(0, 3).join(" | "));
  check("外部への通信がない（selfexercise 画像を除く）", external.length === 0, external.slice(0, 3).join(", "));
  await context.close();

  // ---------- 画像欠落・画像なし種目の検出 ----------
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await routeImages(ctx2, { breakUrl: "/kubi-chin-tuck/" });
  const p2 = await ctx2.newPage();
  p2.on("dialog", (d) => d.accept());
  await p2.goto(BASE);
  await p2.getByRole("button", { name: "サンプル（架空）" }).click();
  await p2.locator("nav").getByRole("button", { name: /セルフケア選択/ }).click();
  await p2.getByRole("button", { name: "五十肩", exact: true }).click();
  await p2.locator("ul > li button[aria-pressed]", { hasText: "振り子運動" }).click();
  await p2.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  await p2.waitForSelector("#print-root [data-broken-image]");
  const pre = await p2.getByTestId("preflight").innerText();
  check("画像の欠落を検出して印刷前チェックに表示", pre.includes("画像を読み込めません") && pre.includes("顎引き"));
  check("画像のない種目を案内する", pre.includes("振り子運動") && pre.includes("画像がありません"));
  await ctx2.close();

  // ---------- サイト内AI: 先読み・2段階生成・速さ表示（AIモデルの代わりにテスト用の偽物を使う） ----------
  // 実際のAIモデルはこの環境では動かせないため、localProvider の読み込みを偽物に差し替えて画面の動きを確認する。
  const FAKE_LOCAL = `
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let ready = false;
    export const checkWebGPU = async () => ({ ok: true, adapter: "fake", shaderF16: true });
    export const isModelDownloaded = async () => true;
    export const isLocalModelReady = () => ready;
    export async function loadLocalModel(id, onProgress) {
      if (ready) return {};
      for (let i = 1; i <= 6; i++) { await sleep(250); onProgress && onProgress({ progress: i / 6, text: "" }); }
      ready = true; return {};
    }
    export const interruptLocalGeneration = () => {};
    export const deleteDownloadedModel = async () => {};
    export const buildLocalPrompt = () => "";
    const patient = { schemaVersion: "2.0", karte: {}, unresolvedExercises: [], patient: { goal: "架空の目標です", currentPoints: ["架空の今の状態"], idealPoints: ["架空の理想の状態"], posture: "side-forward-head", focusAreas: ["neck"], pointsToMind: [{ icon: "desk", text: "架空の意識すること" }], selfcare: [] } };
    const karte = { schemaVersion: "2.0", patient: { currentPoints: [], idealPoints: [], pointsToMind: [] }, karte: { chiefComplaint: "架空の主訴（テスト）" }, confirmations: ["架空の確認事項"] };
    export function createLocalProvider() {
      return { id: "fake", label: "fake", mode: "local", buildRequest: () => "", parseResponse: () => ({ ok: false, errors: [] }),
        async generate(input, opts) {
          await loadLocalModel("x", opts.onLoadProgress);
          for (let i = 1; i <= 14; i++) { await sleep(250); opts.onToken(i * 40, "patient"); }
          opts.onPartial("patient", JSON.stringify(patient));
          for (let i = 1; i <= 24; i++) { await sleep(250); opts.onToken(i * 45, "karte"); }
          opts.onPartial("karte", JSON.stringify(karte));
          return JSON.stringify({ ...patient, ...karte });
        } };
    }`;
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await routeImages(ctx3);
  await ctx3.route(/\/assets\/localProvider-[^/]+\.js$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_LOCAL }));
  const p3 = await ctx3.newPage();
  p3.on("dialog", (d) => d.accept());
  await p3.goto(BASE);
  const warmTexts = [];
  await p3.getByTestId("warm-status").waitFor({ timeout: 10000 });
  warmTexts.push(await p3.getByTestId("warm-status").innerText());
  await p3.getByText("✓ AIの準備ができています").waitFor({ timeout: 10000 });
  warmTexts.push(await p3.getByTestId("warm-status").innerText());
  check("C: 画面を開いた時点でAIを先に準備し、完了を表示する", warmTexts[0].includes("準備しています") && warmTexts[1].includes("準備ができています"), warmTexts.map((t) => t.slice(0, 20)).join(" → "));

  await p3.getByRole("button", { name: "サンプル（架空）" }).click();
  await p3.getByTestId("local-ai").getByRole("button", { name: "AIでカルテ・資料を作成" }).click();
  const prog = p3.getByTestId("local-progress");
  await prog.getByText("ステップ1/2：患者資料を作成中").waitFor({ timeout: 5000 });
  await prog.getByText(/文字\/秒.*残り 約/).waitFor({ timeout: 6000 });
  const step1Text = await prog.innerText();
  check("E: 生成中に速さ（文字/秒）と残り時間の目安を表示する", /約[\d.]+文字\/秒/.test(step1Text) && /残り 約/.test(step1Text), step1Text.replace(/\n/g, " ").slice(0, 80));

  await prog.getByText("ステップ2/2：カルテを作成中").waitFor({ timeout: 8000 });
  const patientDoneShown = await prog.getByText("患者資料は完成しています").isVisible();
  await p3.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  const goalWhileKarte = await p3.locator("[data-doc-goal]").innerText().catch(() => "");
  await p3.locator("nav").getByRole("button", { name: /カルテ確認/ }).click();
  const karteWhile = await p3.locator('[data-karte-field="chiefComplaint"]').inputValue();
  check(
    "B: 患者資料が先に完成して④に反映され、その間カルテは作成中",
    patientDoneShown && goalWhileKarte.includes("架空の目標です") && karteWhile === "",
    `④の目標「${goalWhileKarte.replace(/\s+/g, "")}」/ ③の主訴「${karteWhile}」`,
  );
  await p3.locator("nav").getByRole("button", { name: /カルテ入力/ }).click();
  const stillRunning = await prog.isVisible();
  await p3.getByText("カルテと患者資料を作成しました").waitFor({ timeout: 15000 });
  await p3.locator("nav").getByRole("button", { name: /カルテ確認/ }).click();
  const karteAfter = await p3.locator('[data-karte-field="chiefComplaint"]').inputValue();
  check("B: タブを移動しても生成は続き、完了後にカルテが反映される", stillRunning && karteAfter === "架空の主訴（テスト）", `戻ったとき作成中表示=${stillRunning} / 主訴「${karteAfter}」`);
  await ctx3.close();

  // 片方の段階（患者資料）が失敗したとき: カルテは反映され、失敗の理由が表示される
  const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await routeImages(ctx4);
  const FAKE_FAIL = FAKE_LOCAL.replace(
    'opts.onPartial("patient", JSON.stringify(patient));',
    'opts.onPartial("patient", "<think>\\n\\n</think>\\n\\n{\\"patient\\": {\\"goal\\": \\"途中", "患者資料の生成結果を読み取れませんでした。もう一度お試しいただくか、「ChatGPT／Claudeにコピー」をお使いください。");',
  );
  await ctx4.route(/\/assets\/localProvider-[^/]+\.js$/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_FAIL }));
  const p4 = await ctx4.newPage();
  p4.on("dialog", (d) => d.accept());
  await p4.goto(BASE);
  await p4.getByRole("button", { name: "サンプル（架空）" }).click();
  await p4.getByText("✓ AIの準備ができています").waitFor({ timeout: 10000 });
  await p4.getByTestId("local-ai").getByRole("button", { name: "AIでカルテ・資料を作成" }).click();
  const errBox = p4.locator("[data-screen=input]").getByRole("alert").filter({ hasText: "一部を作成できませんでした" });
  await errBox.waitFor({ timeout: 20000 });
  const errText = await errBox.innerText();
  await p4.locator("nav").getByRole("button", { name: /カルテ確認/ }).click();
  const karteF = await p4.locator('[data-karte-field="chiefComplaint"]').inputValue();
  check(
    "片方の段階が失敗しても、もう片方は反映し、失敗の理由を表示する",
    errText.includes("患者資料の生成結果を読み取れませんでした") && karteF === "架空の主訴（テスト）",
    errText.replace(/\n/g, " ").slice(0, 70),
  );
  await ctx4.close();

  // ---------- 臨床チェック（元メモとの照合・施術者の承認） ----------
  const ctx6 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await routeImages(ctx6);
  const p6 = await ctx6.newPage();
  const dialogs6 = [];
  p6.on("dialog", (d) => {
    dialogs6.push(d.message());
    d.accept();
  });
  await p6.goto(BASE);
  await p6.getByRole("button", { name: "サンプル（架空）" }).click();
  await p6.getByRole("tab", { name: "ChatGPT／Claudeにコピー" }).click();
  await p6.getByRole("button", { name: "返答例（架空）を貼る" }).click();
  await p6.getByRole("button", { name: "③ 取り込む" }).click();
  await p6.locator("nav").getByRole("button", { name: /カルテ確認/ }).click();
  const karteScreen = p6.locator("[data-screen=karte]");
  const noWarn = (await karteScreen.getByText("元メモとの照合で、指摘はありませんでした").count()) === 1;
  const memoShown = (await karteScreen.getByTestId("memo-view").innerText()).includes("頸椎回旋 右45度");
  const badges = await karteScreen.getByText("臨床仮説", { exact: true }).count();
  check("元メモどおりの内容では指摘が出ず、元メモと情報の種類（申告・事実・仮説など）が表示される", noWarn && memoShown && badges >= 1);

  // メモに無い数値・実施していない検査を書き込むと「要確認」になり、確認が済むまで確定できない
  await karteScreen.locator('[data-karte-field="effect"]').fill("頸椎右回旋 45°→70°、NRS 6→2");
  await karteScreen.locator('[data-karte-field="examination"]').fill("頸椎回旋 右45° 左60°\nSLR test 陰性");
  const review = karteScreen.getByTestId("review-karte");
  const reviewText = await review.innerText();
  const confirmBtn = karteScreen.getByTestId("confirm-karte");
  const disabledBefore = await confirmBtn.isDisabled();
  check(
    "元メモに無い数値（70°・NRS）と実施記録の無い検査（SLR）を「要確認」として表示し、確定できない",
    reviewText.includes("数値「70」") && reviewText.includes("数値「6」") && reviewText.includes("検査「SLRテスト」") && disabledBefore,
  );
  // 「該当箇所を直す」で入力欄へ移動する
  await review.locator("li", { hasText: "検査「SLRテスト」" }).getByRole("button", { name: "該当箇所を直す" }).click();
  const focused = await p6.evaluate(() => document.activeElement?.getAttribute("data-karte-field"));
  check("「該当箇所を直す」で該当する入力欄に移動する", focused === "examination", `フォーカス: ${focused}`);
  // 修正（SLR を消す）と承認（数値は確認済みにする）で確定できるようになる
  await karteScreen.locator('[data-karte-field="examination"]').fill("頸椎回旋 右45° 左60°");
  const pending = review.getByRole("button", { name: "確認したので問題なし" });
  for (let i = 0; i < 10 && (await pending.count()) > 0; i++) await pending.first().click();
  const enabledAfter = await confirmBtn.isEnabled();
  await confirmBtn.click();
  const confirmedShown = await karteScreen.getByTestId("confirmed-karte").isVisible();
  check("修正または「確認したので問題なし」で、カルテを確認済みにできる", enabledAfter && confirmedShown);

  // 患者資料: 評価していない姿勢・原因の断定を指摘する。確認前に PDF 出力しようとすると確認を求める
  await p6.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  await p6.locator('[data-doc-field="currentPoints"]').fill("骨盤の歪みがすべての原因です\n首を右に向ける動きに制限がみられました");
  const docReview = await p6.getByTestId("review-patient").innerText();
  check(
    "患者資料: 評価記録の無い姿勢（骨盤の歪み）と原因の断定を「要確認」として表示する",
    docReview.includes("骨盤の歪み・左右差") && docReview.includes("原因の断定"),
  );
  dialogs6.length = 0;
  await p6.evaluate(() => {
    window.print = () => {};
  });
  await p6.getByRole("button", { name: "PDFを出力（印刷）" }).click();
  await p6.waitForTimeout(500);
  check("確認が済んでいない資料を出力しようとすると、確認を求める", dialogs6.some((m) => m.includes("まだ済んでいません")), dialogs6[0] ?? "ダイアログなし");
  await ctx6.close();

  // ---------- 操作性: 工程表示・次へ・上書き確認・お気に入り・検索・目的の追記 ----------
  const ctx7 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx7.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE.slice(0, -1) });
  await routeImages(ctx7);
  const p7 = await ctx7.newPage();
  const dialogs7 = [];
  p7.on("dialog", (d) => {
    dialogs7.push(d.message());
    d.accept();
  });
  await p7.goto(BASE);
  const stepDone = async () =>
    p7.getByTestId("workflow-steps").locator("button[data-step]").evaluateAll((els) => els.map((e) => (e.getAttribute("data-done") === "true" ? "✓" : "・")).join(""));
  const steps0 = await stepDone();
  await p7.getByRole("button", { name: "サンプル（架空）" }).click();
  const steps1 = await stepDone();
  await p7.getByRole("tab", { name: "ChatGPT／Claudeにコピー" }).click();
  await p7.getByRole("button", { name: "返答例（架空）を貼る" }).click();
  await p7.getByRole("button", { name: "③ 取り込む" }).click();
  const steps2 = await stepDone();
  const step3Text = await p7.getByTestId("workflow-steps").locator("button[data-step='3']").innerText();
  // サンプルはセルフケア選択済みのため、読み込み直後に④も完了。取り込み後は「確認待ちの運動」があるため④は未完了に戻る
  check("工程表示: 入力 → AI作成 の進み具合と、未確認・確認待ちを表示する", steps0 === "・・・・・" && steps1 === "✓・・✓・" && steps2 === "✓✓・・・" && step3Text.includes("未確認"), `${steps0} → ${steps1} → ${steps2} / ${step3Text.replace(/\n/g, " ")}`);

  // 作成済みの内容がある状態で取り込み直すと、上書きの確認が出る
  dialogs7.length = 0;
  await p7.getByRole("button", { name: "③ 取り込む" }).click();
  check("作成済みの内容をAIの結果で上書きする前に確認する", dialogs7.some((m) => m.includes("上書き")), dialogs7[0] ?? "ダイアログなし");

  // 次へボタンで、業務の順番に画面を移動できる
  await p7.getByRole("button", { name: "次へ：作成した内容を確認する →" }).click();
  const onKarte = await p7.locator("[data-screen=karte]").isVisible();
  await p7.getByTestId("confirm-karte").click();
  await p7.getByRole("button", { name: "次へ：セルフケアを選ぶ →" }).click();
  const onSelfcare = await p7.locator("[data-screen=selfcare]").isVisible();
  check("「次へ」ボタンで カルテ確認 → セルフケア選択 と進める", onKarte && onSelfcare);

  // 検索の言い換え
  await p7.getByLabel("キーワード検索").fill("胸のストレッチ");
  const firstHit = await p7.locator("[data-screen=selfcare] ul > li").first().locator("span.font-bold").first().innerText();
  await p7.getByLabel("キーワード検索").fill("太もも裏");
  const hamHit = await p7.locator("[data-screen=selfcare] ul > li", { hasText: "ハムストリングス" }).count();
  check("検索: 「胸のストレッチ」で胸筋ストレッチが先頭、「太もも裏」でハムストリングスが出る", firstHit === "胸筋ストレッチ" && hamHit === 1, `先頭「${firstHit}」`);
  await p7.getByLabel("キーワード検索").fill("");

  // お気に入り・最近使った運動
  await p7.getByRole("button", { name: "胸筋ストレッチ をお気に入りに追加" }).click();
  await p7.locator("[data-screen=selfcare] ul > li button[aria-pressed=false]", { hasText: "クラムシェル" }).first().click();
  const favRow = await p7.getByTestId("fav-row").innerText();
  const recentRow = await p7.getByTestId("recent-row").innerText();
  check("お気に入り・最近使った運動が一覧の上に表示される", favRow.includes("胸筋ストレッチ") && recentRow.includes("クラムシェル"), `${favRow.replace(/\n/g, " ")} / ${recentRow.replace(/\n/g, " ")}`);

  // 運動の目的（ライブラリ）・部位の表示と、目的の追記
  const purposeBox = await p7.getByTestId("purpose-kata-chest-stretch").innerText();
  await p7.getByLabel("胸筋ストレッチ の目的の追記").fill("胸の前側をゆっくり伸ばし、肩を動かしやすくするための運動です（架空）");
  await p7.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  const docPurpose = await p7.locator("[data-doc-exercise=kata-chest-stretch] [data-doc-purpose]").innerText();
  check(
    "セルフケア: どこを動かす運動か・目的（ライブラリ）を表示し、追記した目的が資料に反映される",
    purposeBox.includes("どこを動かす運動か") && purposeBox.includes("大胸筋") && docPurpose.includes("肩を動かしやすくするための運動です（架空）"),
  );

  // 仕上げ: 資料画面からカルテのコピーと PDF 出力ができ、工程がすべて完了になる
  await p7.getByTestId("confirm-patient").click();
  // 確認待ちの運動（AIが挙げた「壁を使ったドリル」）を、確認したうえで消す
  await p7.locator("nav").getByRole("button", { name: /カルテ入力/ }).click();
  const clearPending = p7.locator("[data-screen=input]").getByRole("button", { name: "確認済みにして消す" });
  for (let i = 0; i < 5 && (await clearPending.count()) > 0; i++) await clearPending.first().click();
  await p7.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
  await p7.evaluate(() => {
    window.print = () => {};
  });
  await p7.locator("[data-screen=document]").getByRole("button", { name: /カルテをコピー/ }).click();
  const copied = await p7.evaluate(() => navigator.clipboard.readText());
  await p7.locator("[data-screen=document]").getByRole("button", { name: /PDFを出力/ }).click();
  await p7.waitForTimeout(500);
  const stepsEnd = await stepDone();
  check("資料画面からカルテのコピーと PDF 出力ができ、5つの工程がすべて完了になる", copied.startsWith("【プラン・頻度】") && stepsEnd === "✓✓✓✓✓", `工程 ${stepsEnd}`);

  // ページを開き直すと、お気に入りは残り、患者の入力内容は残らない
  await p7.reload();
  const favAfter = await p7.locator("[data-screen=selfcare]").getByTestId("fav-row").innerText().catch(() => "");
  const memoAfter = await p7.getByLabel("施術メモ").inputValue();
  check("開き直すと、お気に入りは残り、患者の入力内容は残らない", favAfter.includes("胸筋ストレッチ") && memoAfter === "", `お気に入り「${favAfter.replace(/\n/g, " ").slice(0, 30)}」/ メモ「${memoAfter}」`);
  await ctx7.close();

  // ---------- セルフケアの種目数ごとのレイアウト・情報が無い項目・長文 ----------
  const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await routeImages(ctx5);
  const p5 = await ctx5.newPage();
  p5.on("dialog", (d) => d.accept());
  await p5.goto(BASE);
  await p5.getByRole("button", { name: "サンプル（架空）" }).click();
  await p5.getByRole("tab", { name: "ChatGPT／Claudeにコピー" }).click();
  await p5.getByRole("button", { name: "返答例（架空）を貼る" }).click();
  await p5.getByRole("button", { name: "③ 取り込む" }).click();
  const toggleExercise = async (name, on) => {
    await p5.locator("nav").getByRole("button", { name: /セルフケア選択/ }).click();
    await p5.getByLabel("キーワード検索").fill(name);
    await p5.locator(`[data-screen=selfcare] ul > li button[aria-pressed=${on ? "false" : "true"}]`, { hasText: name }).first().click();
    await p5.getByLabel("キーワード検索").fill("");
  };
  const openDoc = async () => {
    await p5.locator("nav").getByRole("button", { name: /患者説明資料/ }).click();
    await p5.waitForTimeout(800);
  };

  // 1種目: 横長のカードで、空白の列が出ない
  await toggleExercise("顎引き", false);
  await toggleExercise("胸椎伸展", false);
  await openDoc();
  const m1 = await docMetrics(p5);
  const pc1 = await p5.getByTestId("page-count").innerText();
  const den1 = await p5.locator("#doc-content").getAttribute("data-density");
  const pdf1 = await printPdf(p5, path.join(OUT, "patient-document-1item.pdf"));
  check("画面に表示するページ数が実際の PDF と一致する（1種目・説明すべてあり）", pc1.includes(pdf1.pages === 1 ? "1枚" : `${pdf1.pages} ページ`), `画面「${pc1}」/ PDF ${pdf1.pages}ページ / 詰め具合 ${den1}`);
  check(
    "セルフケア1種目: 横長のカードで幅いっぱいに表示（空白の列なし）",
    m1.cards.length === 1 && m1.cards[0].layout === "wide" && m1.cards[0].wMm >= m1.contentWmm - 1 && m1.qrMm[0] >= 22,
    `カード幅 ${m1.cards[0]?.wMm}mm / 本文幅 ${m1.contentWmm}mm / QR ${m1.qrMm[0]}mm / PDF ${pdf1.pages}ページ`,
  );

  // 2種目: 2列
  await toggleExercise("顎引き", true);
  await openDoc();
  const m2 = await docMetrics(p5);
  const pdf2 = await printPdf(p5, path.join(OUT, "patient-document-2items.pdf"));
  const split2 = cardsNotSplit(pdfPageTexts(pdf2.file), cardInfo(["kata-chest-stretch", "kubi-chin-tuck"]));
  check(
    "セルフケア2種目: 2列で横に並び、カードが分かれない",
    m2.cards.length === 2 && m2.cards.every((c) => c.layout === "card") && m2.cards[0].top === m2.cards[1].top && split2.every((c) => c.ok),
    `${m2.cards.map((c) => `${c.wMm}mm`).join(" / ")} / PDF ${pdf2.pages}ページ`,
  );

  // 情報が無い項目は表示しない（施術前後の変化・HOPE）
  await openDoc();
  while ((await p5.getByTestId("changes-editor").getByRole("button", { name: "削除" }).count()) > 0) {
    await p5.getByTestId("changes-editor").getByRole("button", { name: "削除" }).first().click();
  }
  await p5.getByLabel(/あなたの目標/).fill("");
  await p5.waitForTimeout(500);
  const mEmpty = await docMetrics(p5);
  const hopeMissing = await p5.getByTestId("hope-missing").isVisible();
  check(
    "情報が無い項目は資料に出さない（変化の記録なし・HOPE未確認）",
    !mEmpty.sections.includes("changes") && (await p5.locator("[data-doc-goal]").count()) === 0 && hopeMissing,
    `表示中: ${mEmpty.sections.join(",")} / HOPE未確認の表示=${hopeMissing}`,
  );

  // 6種目＋手順＋長文: 文字を縮小せず2ページ以上に分け、カードは途中で分かれない
  for (const name of ["胸椎伸展", "ふくらはぎストレッチ", "ハムストリングスストレッチ", "クラムシェル"]) await toggleExercise(name, true);
  await openDoc();
  const longLine = "右の首から肩にかけて負担がかかりやすく、夕方になると張りが強くなり、首を右に向ける動きにも制限がみられました";
  await p5.getByLabel("今のお身体の状態").fill(`${longLine}\n頭が前に出た姿勢の傾向がみられました\n背中の上のほうが丸くなりやすい傾向がみられました`);
  await p5.getByText("やり方（手順）の文章も載せる").click();
  await p5.waitForTimeout(1200);
  const m6 = await docMetrics(p5);
  const pageText6 = await p5.getByTestId("page-count").innerText();
  const pdf6 = await printPdf(p5, path.join(OUT, "patient-document-6items.pdf"));
  check("画面に表示するページ数が実際の PDF と一致する（6種目）", pageText6.includes(`${pdf6.pages} ページ`), `画面「${pageText6}」/ PDF ${pdf6.pages}ページ`);
  const slugs6 = ["kata-chest-stretch", "kubi-chin-tuck", "kubi-thoracic-extension", "calf-stretch", "hamstring-stretch", "clamshell"];
  const split6 = cardsNotSplit(pdfPageTexts(pdf6.file), cardInfo(slugs6));
  const overflow6 = await p5.evaluate(() => {
    const s = document.querySelector('[data-testid="a4-sheet"]').getBoundingClientRect();
    return Array.from(document.querySelectorAll("#doc-content *")).filter((el) => el.getBoundingClientRect().right > s.right + 1).length;
  });
  check(
    "6種目＋手順＋長文: 文字を縮小せず複数ページに分け、運動カードは途中で分かれない",
    pdf6.pages >= 2 && split6.every((c) => c.ok) && m6.minFontPt >= 8 && m6.zoomStyle === "" && overflow6 === 0 && pageText6.includes("ページ"),
    `PDF ${pdf6.pages}ページ / 最小 ${m6.minFontPt}pt / はみ出し ${overflow6} / ${split6.map((c) => `${c.title}:p${c.titlePage + 1}${c.ok ? "" : "✗"}`).join(", ")}`,
  );

  // 内容を減らすと、写真の大きさが標準に戻る
  await p5.getByText("やり方（手順）の文章も載せる").click();
  for (const name of ["胸椎伸展", "ふくらはぎストレッチ", "ハムストリングスストレッチ", "クラムシェル", "顎引き"]) await toggleExercise(name, false);
  await openDoc();
  await p5.getByLabel("今のお身体の状態").fill("首を右に向ける動きに制限がみられました");
  await p5.waitForTimeout(1000);
  const backDensity = await p5.locator("#doc-content").getAttribute("data-density");
  const pcBack = await p5.getByTestId("page-count").innerText();
  check("内容を減らすと、1枚に収まり、写真は必要な場合だけ小さくする", pcBack.includes("1枚") && ["0", "1"].includes(backDensity ?? ""), `「${pcBack}」/ 詰め具合 ${backDensity}`);
  const pdf1b = await printPdf(p5, path.join(OUT, "patient-document-1item-short.pdf"));
  const pc1b = await p5.getByTestId("page-count").innerText();
  check("画面に表示するページ数が実際の PDF と一致する（1種目）", pc1b.includes(pdf1b.pages === 1 ? "1枚" : `${pdf1b.pages} ページ`), `画面「${pc1b}」/ PDF ${pdf1b.pages}ページ`);
  await ctx5.close();

  // ---------- 画面幅への対応 ----------
  const previewScales = [];
  for (const vp of [
    { name: "pc-1600-2col", width: 1600, height: 1000 },
    { name: "pc-1440", width: 1440, height: 900 },
    { name: "ipad-landscape-1180", width: 1180, height: 820 },
    { name: "ipad-portrait-820", width: 820, height: 1180 },
    { name: "phone-390", width: 390, height: 844 },
  ]) {
    const c = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await routeImages(c);
    const p = await c.newPage();
    p.on("dialog", (d) => d.accept());
    await p.goto(BASE);
    await p.getByRole("button", { name: "サンプル（架空）" }).click();
    const tabs = ["カルテ入力", "カルテ確認", "セルフケア選択", "患者説明資料"];
    let ok = true;
    const bad = [];
    for (const t of tabs) {
      await p.locator("nav button", { hasText: new RegExp(`${t}$|${t}\\d*$`) }).first().click();
      const r = await p.evaluate(() => {
        const W = window.innerWidth;
        return {
          over: document.documentElement.scrollWidth - W,
          els: [...document.querySelectorAll("body *")]
            .filter((e) => e.getBoundingClientRect().right > W + 1 && !e.closest(".overflow-x-auto, nav"))
            .slice(0, 3)
            .map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`),
        };
      });
      const current = await p.locator('nav button[aria-current="page"]').innerText();
      if (!current.replace(/\d/g, "").trim().endsWith(t)) {
        ok = false;
        bad.push(`${t}: アクティブなタブ表示が「${current}」`);
      }
      if (t === "患者説明資料") {
        const fit = await p.evaluate(() => {
          const sheet = document.querySelector('[data-testid="a4-sheet"]').getBoundingClientRect();
          const box = document.querySelector(".fit-to-width").getBoundingClientRect();
          return { ok: sheet.left >= box.left - 1 && sheet.right <= box.right + 1 && sheet.right <= window.innerWidth, scale: document.querySelector(".fit-to-width").dataset.previewScale };
        });
        if (!fit.ok) {
          ok = false;
          bad.push(`資料プレビューが表示エリアからはみ出している（縮小率 ${fit.scale}）`);
        }
        previewScales.push(`${vp.width}px→${fit.scale}`);
      }
      if (r.over > 1) {
        ok = false;
        bad.push(`${t}: ${r.els.join(", ")}`);
      }
      await p.screenshot({ path: path.join(OUT, `${vp.name}-${tabs.indexOf(t) + 1}.png`) });
    }
    check(`画面幅 ${vp.width}px で横にはみ出さない（全4画面）`, ok, bad.join(" / "));
    await c.close();
  }
  check("患者資料のプレビューが横スクロールなしで全体表示される（画面に合わせて縮小）", previewScales.length === 5, previewScales.join(" / "));
} catch (e) {
  check("E2E 実行中に例外", false, e instanceof Error ? e.stack : String(e));
} finally {
  await browser.close();
  stop();
}

const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(OUT, "e2e-results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} 件成功`);
process.exit(failed.length ? 1 : 0);
