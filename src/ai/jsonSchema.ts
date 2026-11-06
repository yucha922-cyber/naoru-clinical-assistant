import { KARTE_KEYS } from "../domain/karte";
import { AI_SCHEMA_VERSION } from "./schema";

// 端末内AI（WebLLM）に「この形の JSON しか出力できない」よう制約をかけるための JSON Schema。
// 取り込み時は従来どおり src/ai/schema.ts（zod）で検証する。
export function buildOutputJsonSchema(selectedSlugs: string[]): Record<string, unknown> {
  const str = { type: "string" };
  const strList = { type: "array", items: str };
  const selfcareItem =
    selectedSlugs.length > 0
      ? {
          type: "object",
          properties: { slug: { type: "string", enum: selectedSlugs }, point: str },
          required: ["slug", "point"],
          additionalProperties: false,
        }
      : str;
  return {
    type: "object",
    properties: {
      schemaVersion: { type: "string", enum: [AI_SCHEMA_VERSION] },
      karte: {
        type: "object",
        properties: Object.fromEntries(KARTE_KEYS.map((k) => [k, str])),
        required: KARTE_KEYS,
        additionalProperties: false,
      },
      patient: {
        type: "object",
        properties: {
          currentState: str,
          idealState: str,
          pointsToMind: strList,
          selfcare: { type: "array", items: selfcareItem, maxItems: selectedSlugs.length },
        },
        required: ["currentState", "idealState", "pointsToMind", "selfcare"],
        additionalProperties: false,
      },
      unresolvedExercises: strList,
      confirmations: strList,
    },
    required: ["schemaVersion", "karte", "patient", "unresolvedExercises", "confirmations"],
    additionalProperties: false,
  };
}
