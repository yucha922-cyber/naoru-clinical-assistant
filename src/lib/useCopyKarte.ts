import { useCallback } from "react";
import { useApp } from "../state";
import { formatKarte } from "../domain/karte";
import { copyText } from "./clipboard";

/** カルテを SalonOne 用の形式でコピーする（カルテ確認画面・患者説明資料画面の両方から使う） */
export function useCopyKarte() {
  const { session, dispatch, notify } = useApp();
  return useCallback(async () => {
    const output = formatKarte(session.karte);
    if (output === "") {
      notify("カルテが空です");
      return;
    }
    if (
      !session.review.karteConfirmed &&
      !window.confirm("カルテの内容の確認（カルテ確認画面の「内容の確認」）がまだ済んでいません。このままコピーしますか？")
    )
      return;
    const ok = await copyText(output);
    if (ok) dispatch({ type: "markOutput", kind: "karteCopied" });
    notify(ok ? "カルテをコピーしました。SalonOne に貼り付けてください" : "コピーできませんでした");
  }, [session.karte, session.review.karteConfirmed, dispatch, notify]);
}
