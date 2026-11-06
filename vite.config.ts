import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 完全クライアントサイドのアプリです。サーバー側で患者情報を受け取る処理はありません。
// dev / preview サーバーはローカル（localhost）でのみ待ち受けます。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
  },
});
