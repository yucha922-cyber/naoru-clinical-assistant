// アプリ全体の設定。患者情報は絶対にここへ書かないでください（ソースコードはGitHubに保存されます）。
export const APP_CONFIG = {
  clinicName: "NAORU整体",
  appName: "NAORU Clinical Assistant",
  /** 患者資料のフッターに表示する注意文 */
  documentDisclaimer:
    "本資料は施術時の評価にもとづくセルフケアのご案内です。医学的な診断ではありません。痛みやしびれが強くなる場合は中止し、担当セラピストにご相談ください。",
  /** 患者資料に1種目あたり載せる画像の最大枚数 */
  maxImagesPerExercise: 3,
} as const;
