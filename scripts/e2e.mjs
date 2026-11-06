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

import { spawn } from "node:child_process";
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

  // カルテ
  await page.getByRole("button", { name: /カルテ$/ }).click();
  const karteOut = await page.getByTestId("karte-output").innerText();
  check("カルテが NAORU フォーマットで表示される", karteOut.startsWith("【プラン・頻度】") && karteOut.includes("【主訴】") && !karteOut.includes("【離反理由】"));
  await page.locator('[data-karte-field="history"]').fill("特記なし（架空）");
  await page.getByRole("button", { name: "カルテをコピー" }).click();
  const copiedKarte = await page.evaluate(() => navigator.clipboard.readText());
  check("カルテを編集してコピーできる", copiedKarte.includes("【既往歴・通院歴】\n特記なし（架空）") && copiedKarte === (await page.getByTestId("karte-output").innerText()));
  check("AIの確認事項が表示される", await page.getByText("確認事項（AIからの指摘）").isVisible());

  // セルフケア選択
  await page.getByRole("button", { name: /セルフケア選択/ }).click();
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
  await page.waitForSelector("img[data-qr]");
  check("QRコードが生成される", (await page.locator("img[data-qr]").count()) === 4);
  check("注意事項が表示される", (await page.getByText("注意事項", { exact: true }).count()) >= 1);

  // 患者資料
  await page.getByRole("button", { name: /患者説明資料/ }).click();
  const sheet = page.getByTestId("a4-sheet");
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("#print-root img"));
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  const sheetText = await sheet.innerText();
  check("資料に4セクションが表示される", ["今のお身体の状態", "理想のお身体の状態", "意識していくこと", "今日のセルフケア"].every((t) => sheetText.includes(t)));
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
    local: localStorage.length,
    session: sessionStorage.length,
    idb: indexedDB.databases ? (await indexedDB.databases()).length : 0,
    cookie: document.cookie,
  }));
  check("ブラウザのストレージに保存しない", storage.local === 0 && storage.session === 0 && storage.idb === 0 && storage.cookie === "", JSON.stringify(storage));
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
  await p2.getByRole("button", { name: /セルフケア選択/ }).click();
  await p2.getByRole("button", { name: "五十肩", exact: true }).click();
  await p2.locator("ul > li button[aria-pressed]", { hasText: "振り子運動" }).click();
  await p2.getByRole("button", { name: /患者説明資料/ }).click();
  await p2.waitForSelector("#print-root [data-broken-image]");
  const pre = await p2.getByTestId("preflight").innerText();
  check("画像の欠落を検出して印刷前チェックに表示", pre.includes("画像を読み込めません") && pre.includes("顎引き"));
  check("画像のない種目を案内する", pre.includes("振り子運動") && pre.includes("画像がありません"));
  await ctx2.close();

  // ---------- 画面幅への対応 ----------
  for (const vp of [
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
    const tabs = ["カルテ入力", "セルフケア選択", "カルテ", "患者説明資料"];
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
      if (r.over > 1) {
        ok = false;
        bad.push(`${t}: ${r.els.join(", ")}`);
      }
      await p.screenshot({ path: path.join(OUT, `${vp.name}-${tabs.indexOf(t) + 1}.png`) });
    }
    check(`画面幅 ${vp.width}px で横にはみ出さない（全4画面）`, ok, bad.join(" / "));
    await c.close();
  }
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
