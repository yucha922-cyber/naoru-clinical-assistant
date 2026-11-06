import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", ".cache", "artifacts", "test-results"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // 患者データをログに出さないため、console の利用を禁止（warn/error は開発時の警告用に許可）
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    extends: [js.configs.recommended],
    files: ["scripts/**/*.mjs", "*.config.{js,ts}"],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
  },
  {
    // E2E は page.evaluate 内でブラウザのコードを実行する
    files: ["scripts/e2e.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
