import { BLOB_MAX_BYTES } from "./store.ts";

export function contentLengthOverLimit(header: string | null, max = BLOB_MAX_BYTES): boolean {
  if (!header) return false;
  const first = header.split(",")[0]?.trim() ?? "";
  if (!/^\d+$/.test(first)) return false;
  return Number(first) > max;
}

export async function readBodyAtMost(body: ReadableStream<Uint8Array> | null, max = BLOB_MAX_BYTES): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // cancel() already released the lock
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
