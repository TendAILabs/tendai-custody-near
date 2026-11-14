const NEAR_CONNECT =
  " https://rpc.testnet.near.org https://rpc.mainnet.near.org https://test.rpc.fastnear.com https://free.rpc.fastnear.com https://near-testnet.drpc.org https://api.fastnear.com https://api.nearblocks.io https://*.near.org https://*.near.ai https://api.near.ai wss://*.near.org https://raw.githubusercontent.com https://cdn.jsdelivr.net";

export function contentSecurityPolicy(env: string | undefined): string {
  const toolbar = env === "preview" || env === "development";
  const toolbarScript = toolbar ? " https://vercel.live" : "";
  const toolbarConnect = toolbar ? " https://vercel.live https://*.vercel.live wss://ws-us3.pusher.com" : "";
  const toolbarFrame = toolbar ? " https://vercel.live" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${toolbarScript}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${NEAR_CONNECT}${toolbarConnect}`,
    `frame-src 'self' https://*.near.org https://wallet.meteorwallet.app https://*.hot-labs.org https://*.meteorwallet.app https://app.mynearwallet.com https://mynearwallet.com${toolbarFrame}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
