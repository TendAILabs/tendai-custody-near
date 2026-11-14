# TendAI Custody web

Next.js app for TendAI Custody. This commit is the scaffold, the NEAR AI proxy, envelope crypto, and the local de-identification scrub.

From this directory, with Node 24.22.1 or newer:

```bash
pnpm test:crypto
pnpm build
```

The proxy at `app/api/nearai/v1/[...path]` does not run during `pnpm build`. Do not call it without an explicit decision to spend NEAR AI credits.

See the repository README for the contract tests and the honest limits.
