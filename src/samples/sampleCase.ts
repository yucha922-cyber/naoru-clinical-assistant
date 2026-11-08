import type { Session } from "../domain/session";
import { emptyKarte } from "../domain/karte";
import { emptyPatientDoc } from "../domain/session";

// ★★ 架空のサンプルデータです ★★
// 実在の患者さんとは一切関係ありません。動作確認・デモ・自動テスト専用です。
// このファイルに実患者の情報を書かないでください。

export const SAMPLE_SESSION: Session = {
  meta: {
    visitDate: "2026-11-06",
    therapistName: "サンプル担当",
    patientName: "架空 花子",
  },
  memo: `【架空のサンプル】
40代女性 デスクワーク 1日8時間PC作業。初回来院。
主訴 右の首から肩にかけての張り、夕方に強くなる。3か月前から。
副主訴 たまに後頭部の重さ。
来院理由 マッサージに通っていたがすぐ戻るため根本的に良くしたい。
HOPE 仕事終わりも肩を気にせず過ごしたい。趣味のヨガを再開したい。
問診 しびれなし。夜間痛なし。頭痛は月2回程度で市販薬で改善。
検査 立位で頭部前方位、右肩甲骨挙上・外転位。頸椎回旋 右45度 左60度 右回旋時に右頸部の張り感。
きょうさにゅうとつきん 右圧痛あり。小胸筋 右短縮傾向。胸椎伸展の可動性低下。スパーリングテスト陰性。
施術 右小胸筋・胸鎖乳突筋のリリース、胸椎モビライゼーション、肩甲骨周囲の徒手療法。
効果 施術直後 頸椎右回旋45度→55度、張り感 10→4。
セルフケア 胸筋ストレッチ、顎引き、胸椎伸展を指導。壁を使ったドリルも少し説明した。
次回 1週間後。頸椎回旋と肩甲骨位置を再評価。
プラン 週1回×4回で集中、その後2週に1回。
仕事 繁忙期で残業多め。`,
  selections: [
    { slug: "kata-chest-stretch", dosage: "左右20秒×2回／1日2セット", note: "", purposeNote: "" },
    { slug: "kubi-chin-tuck", dosage: "10回／仕事の合間に", note: "", purposeNote: "" },
    { slug: "kubi-thoracic-extension", dosage: "10回／お風呂上がり", note: "", purposeNote: "" },
  ],
  pendingExercises: [],
  karte: emptyKarte(),
  patientDoc: emptyPatientDoc(),
  confirmations: [],
};

/** 上のメモをAIに渡したときの返答例（架空）。取り込み機能のテスト・デモ用 */
export const SAMPLE_AI_RESPONSE = `以下が整理結果です。

\`\`\`json
{
  "schemaVersion": "3.0",
  "karte": {
    "planFrequency": "週1回×4回（集中期）→ 以降2週に1回",
    "chiefComplaint": "右頸部〜肩部の張り感（夕方に増悪）。発症3か月前。",
    "secondaryComplaint": "後頭部の重さ（時々）",
    "presentIllness": "約3か月前より右頸部〜肩部の張り感が出現。デスクワーク（PC作業 1日約8時間）後の夕方に増悪。しびれ・夜間痛なし。頭痛は月2回程度、市販薬で改善（本人申告）。",
    "reasonForVisit": "マッサージでは症状がすぐ戻るため、根本的な改善を希望して来院。",
    "hope": "仕事終わりも肩を気にせず過ごしたい。趣味のヨガを再開したい。",
    "shortTermGoal": "頸部の張り感の軽減、頸椎右回旋可動域の改善",
    "midTermGoal": "",
    "examination": "【観察】立位にて頭部前方位、右肩甲骨挙上・外転位。\\n【可動域】頸椎回旋 右45° / 左60°、右回旋時に右頸部の張り感。\\n【触診】右胸鎖乳突筋に圧痛。右小胸筋に短縮傾向。\\n【その他】胸椎伸展の可動性低下。Spurling test 陰性。",
    "assessment": "頭部前方位・右肩甲骨挙上外転位により、右胸鎖乳突筋・小胸筋の短縮および胸椎伸展可動性の低下が、頸部の張り感と頸椎右回旋制限に関与している可能性がある。Spurling test 陰性・しびれなしより、神経根症状を示唆する所見は現時点で認めない。",
    "treatment": "右小胸筋・右胸鎖乳突筋のリリース、胸椎モビライゼーション、肩甲骨周囲の徒手療法。",
    "effect": "【即時効果】頸椎右回旋 45°→55°、張り感 NRS 10→4。\\n※長期的な改善は次回以降に再評価。",
    "currentSelfcare": "胸筋ストレッチ（左右20秒×2回／1日2セット）\\n顎引きエクササイズ（10回／仕事の合間に）\\n胸椎伸展エクササイズ（10回／お風呂上がり）",
    "nextEvaluation": "頸椎回旋可動域、肩甲骨位置",
    "nextPlan": "1週間後。再評価の結果をもとに施術内容を調整。",
    "privateWork": "仕事が繁忙期で残業多め。",
    "history": "",
    "precautions": "",
    "review": "",
    "membershipNotes": "",
    "dropoutReason": ""
  },
  "patient": {
    "goal": "仕事終わりも肩を気にせず過ごしたい",
    "currentPoints": [
      "首を右に向ける動きに制限がみられました",
      "頭が前に出た姿勢の傾向がみられました",
      "右の首の前側に、押すと痛む部分がありました"
    ],
    "changes": [
      { "item": "首を右に向ける動き", "before": "45°", "after": "55°" },
      { "item": "首から肩の張り（10段階）", "before": "10", "after": "4" }
    ],
    "idealPoints": [
      "仕事終わりも首や肩を楽に動かせる",
      "夕方になっても肩の張りが気になりにくい",
      "趣味のヨガを再開できる"
    ],
    "posture": "side-forward-head",
    "focusAreas": ["neck", "shoulder"],
    "pointsToMind": [
      { "icon": "break", "text": "30〜60分を目安に一度立ち上がる" },
      { "icon": "desk", "text": "画面の高さを目線に近づける" },
      { "icon": "breath", "text": "夕方につらくなる前に、セルフケアで体をほぐす" }
    ],
    "selfcare": [
      { "slug": "kata-chest-stretch", "point": "胸の前が気持ちよく伸びる強さで" },
      { "slug": "kubi-chin-tuck", "point": "首の後ろが伸びるのを感じて" },
      { "slug": "kubi-thoracic-extension", "point": "腰ではなく背中の上を反らす" }
    ],
    "nextGoal": "3つのセルフケアを無理のない範囲で続け、仕事終わりの肩の状態を確かめましょう。",
    "nextCheck": "首を回す動きと肩の位置をもう一度確認します"
  },
  "unresolvedExercises": ["壁を使ったドリル"],
  "confirmations": [
    "メモの「きょうさにゅうとつきん」は「胸鎖乳突筋」と解釈しました。",
    "頭痛は月2回程度とのことです。頻度の増加や性状の変化があれば医療機関の受診を検討してください。",
    "中期目標はメモに記載がないため空欄にしています。"
  ]
}
\`\`\`
`;
