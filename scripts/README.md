# Scripts

From the repo root, with Node 24.22.1+ and `near` 0.31.1 on `PATH`:

```bash
node --experimental-strip-types scripts/setup-testnet.ts
node --experimental-strip-types scripts/e2e-cli.ts
node --experimental-strip-types scripts/phi-scan.ts
```

`setup-testnet.ts` creates throwaway testnet accounts, deploys the relay contract, adds clinic function-call keys, registers actors, and seeds Maya's record. Keys stay in `.env`. `e2e-cli.ts --tee` runs a verified NEAR AI summary when `NEARAI_API_KEY` is set, and exits before any request when it is missing. The summary asks for 3072 tokens and de-identification asks for 4096, both with documented `reasoning_effort: "low"`, streamed, then `verifyResponse`. De-identification calls NEAR AI only when that key is set. Spend stops before an estimate passes $4. The stop is the in-memory counter, or Redis when that store is configured. A missing local ledger file starts that file at zero.

`attack-demo.ts` is still later.
