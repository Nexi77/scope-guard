export const MAX_OFFER_FORM_BYTES = 512 * 1024;
export const MAX_OFFER_ITEMS_JSON_BYTES = 256 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readBoundedFormData(request: Request, maxBytes = MAX_OFFER_FORM_BYTES) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new TypeError("Request body is unavailable.");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const replayRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: new Blob(chunks),
  });
  return replayRequest.formData();
}

export function exceedsUtf8ByteLimit(value: string, maxBytes: number) {
  return new TextEncoder().encode(value).byteLength > maxBytes;
}
