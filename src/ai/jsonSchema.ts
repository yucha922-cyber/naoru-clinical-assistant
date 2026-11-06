import { KARTE_KEYS } from "../domain/karte";
import { AI_SCHEMA_VERSION } from "./schema";
import { BODY_AREA_KEYS, MIND_ICON_KEYS, POSTURE_KEYS } from "../doc/postures";

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
          goal: str,
          currentPoints: { type: "array", items: str, maxItems: 3 },
          idealPoints: { type: "array", items: str, maxItems: 3 },
          posture: { anyOf: [{ type: "string", enum: POSTURE_KEYS }, { type: "null" }] },
          focusAreas: { type: "array", items: { type: "string", enum: BODY_AREA_KEYS }, maxItems: 3 },
          pointsToMind: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              properties: { icon: { type: "string", enum: MIND_ICON_KEYS }, text: str },
              required: ["icon", "text"],
              additionalProperties: false,
            },
          },
          selfcare: { type: "array", items: selfcareItem, maxItems: selectedSlugs.length },
        },
        required: ["goal", "currentPoints", "idealPoints", "posture", "focusAreas", "pointsToMind", "selfcare"],
        additionalProperties: false,
      },
      unresolvedExercises: strList,
      confirmations: strList,
    },
    required: ["schemaVersion", "karte", "patient", "unresolvedExercises", "confirmations"],
    additionalProperties: false,
  };
}

/** サイト内AI ステップ1（患者資料）用。karte は含めない */
export function buildPatientJsonSchema(selectedSlugs: string[]): Record<string, unknown> {
  const full = buildOutputJsonSchema(selectedSlugs) as { properties: Record<string, unknown> };
  return {
    type: "object",
    properties: {
      patient: full.properties.patient,
      unresolvedExercises: full.properties.unresolvedExercises,
    },
    required: ["patient", "unresolvedExercises"],
    additionalProperties: false,
  };
}

/** サイト内AI ステップ2（カルテ）用。patient は含めない */
export function buildKarteJsonSchema(): Record<string, unknown> {
  const full = buildOutputJsonSchema([]) as { properties: Record<string, unknown> };
  return {
    type: "object",
    properties: {
      karte: full.properties.karte,
      confirmations: full.properties.confirmations,
    },
    required: ["karte", "confirmations"],
    additionalProperties: false,
  };
}
