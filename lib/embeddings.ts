import { createHash } from "node:crypto";

export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";
export const LOCAL_EMBEDDING_DIMENSIONS = 64;

export function embeddingTokens(content: string) {
  return String(content || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && token.length < 48)
    .slice(0, 1200);
}

export function createLocalEmbedding(content: string, dimensions = LOCAL_EMBEDDING_DIMENSIONS) {
  const vector = Array(dimensions).fill(0);
  for (const token of embeddingTokens(content)) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest[0] % dimensions;
    const sign = digest[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function parseEmbedding(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += Number(a[index]) * Number(b[index]);
    magnitudeA += Number(a[index]) * Number(a[index]);
    magnitudeB += Number(b[index]) * Number(b[index]);
  }
  if (!magnitudeA || !magnitudeB) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
