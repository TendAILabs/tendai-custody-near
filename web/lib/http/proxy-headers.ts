const REQUEST_ALLOW = new Set([
  "content-type",
  "accept",
  "x-signing-algo",
  "x-client-pub-key",
  "x-model-pub-key",
  "x-encryption-version",
  "x-no-aliasing",
  "x-encrypt-all-fields",
]);

const RESPONSE_DROP = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "set-cookie",
  "keep-alive",
]);

export function upstreamRequestHeaders(incoming: Headers, authorization: string | null): Headers {
  const headers = new Headers();
  for (const [key, value] of incoming) {
    if (REQUEST_ALLOW.has(key.toLowerCase())) headers.set(key, value);
  }
  if (authorization) headers.set("authorization", authorization);
  headers.set("accept-encoding", "identity");
  return headers;
}

export function upstreamResponseHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const [key, value] of incoming) {
    if (RESPONSE_DROP.has(key.toLowerCase())) continue;
    headers.set(key, value);
  }
  return headers;
}
