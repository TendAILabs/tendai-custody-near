# Attack demo result

Schema 2 testnet contract. Owner `rr191f8afd-owner.testnet`. `list_actors` returned 6 active actors: four Clinic (Riverbend Family Clinic, St. Aster Hospital, Northgate Heart Institute, Lakeside Family Medicine), one App (PulseFit), and one Patient. The clinic, hospital, and patient signer accounts in this run are those three actors.

The scripts called that contract. `RELAY_CONTRACT_ID` matched the account.

Fictional payloads only. No deploy. Times are Bangkok (UTC+7).

## Suite

`pnpm attack-demo` (`scripts/attack-demo.ts`) on 2026-11-14, 17:05:17 to 17:06:41, after rebasing onto `546f5ce`. Attack share 14. 11 of 11 passed.

`unauthorizedReader` is shared by selftest and this script. It prefers the second-opinion function-call key, which may call `request_open` and is not the hospital share's recipient. This environment has no second-opinion key, so the helper used the hospital key on a share addressed to the clinic. The unit test with the second-opinion key set still signs `request_open` as that account.

Explorer links use `https://testnet.nearblocks.io/txns/<hash>`.

| Case | Expected | Actual | Transaction | Result |
| --- | --- | --- | --- | --- |
| create_record | Clinic `create_record` is accepted and returns a record id | record 8 | [EPR5jHDRpxJSLdqCjg9a8EP6d93QKiyeeMgG2doZa2Eg](https://testnet.nearblocks.io/txns/EPR5jHDRpxJSLdqCjg9a8EP6d93QKiyeeMgG2doZa2Eg) | pass |
| share | Clinic `request_referral` to the hospital is accepted | share 14 | [2uJt3QZrsrabGMqkxsptbGaENZSX6dY8cPg7ybegui8t](https://testnet.nearblocks.io/txns/2uJt3QZrsrabGMqkxsptbGaENZSX6dY8cPg7ybegui8t) | pass |
| unauthorized open | A clinic that is not the recipient gets `ERR_UNAUTHORIZED` | `ERR_UNAUTHORIZED` | [C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k](https://testnet.nearblocks.io/txns/C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k) | pass |
| approve | Patient `approve_share` with 1 yoctoNEAR is accepted | accepted | [B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn](https://testnet.nearblocks.io/txns/B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn) | pass |
| ticket open | Hospital `request_open` on the active share is accepted | accepted | [DxkQ7GPqtr8sX384sKM5vMmuoRFTMk1ARhNkCvYoSUqn](https://testnet.nearblocks.io/txns/DxkQ7GPqtr8sX384sKM5vMmuoRFTMk1ARhNkCvYoSUqn) | pass |
| nonce replay | First local open is HTTP 200. The same nonce is HTTP 403 `replay` | first 200 second 403 replay | none. This check is local | pass |
| key substitution | An offered encryption key that differs from the actor directory is not used | Server offered an encryption key that does not match the on-chain directory. Wrapping to the on-chain key. | none. This check is local | pass |
| envelope swap | A ciphertext with one flipped byte is rejected | flipped byte rejected | none. This check is local | pass |
| consult reply | Hospital `submit_reply` is accepted and returns a reply id | reply 16 | [CrMs24p6wUp3fbLv3PcSkMnkYMEonW4pPMq5o7oTc67Y](https://testnet.nearblocks.io/txns/CrMs24p6wUp3fbLv3PcSkMnkYMEonW4pPMq5o7oTc67Y) | pass |
| revoke | Patient `revoke_share` with 1 yoctoNEAR is accepted | accepted | [6BUCRw2VQ6xndpbgyLAczDPzrLSZ2EmRcFggMSoyT9HA](https://testnet.nearblocks.io/txns/6BUCRw2VQ6xndpbgyLAczDPzrLSZ2EmRcFggMSoyT9HA) | pass |
| revoked open | A later hospital `request_open` panics `ERR_REVOKED` | `ERR_REVOKED` | [CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L](https://testnet.nearblocks.io/txns/CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L) | pass |

The fallback creates a second referral addressed to the clinic, then the hospital calls `request_open` on it. The patient declines that referral afterward so it does not stay pending. Those two calls are not scored cases: referral [GvxcAPU4rTEkjU4StAwsznxPxz6PtQyeuuAQSfFfHZPC](https://testnet.nearblocks.io/txns/GvxcAPU4rTEkjU4StAwsznxPxz6PtQyeuuAQSfFfHZPC), decline [C6k2Ro9sciocLkk7r2Q5syjiW8u9Bq1HrbQK5yAPc7WC](https://testnet.nearblocks.io/txns/C6k2Ro9sciocLkk7r2Q5syjiW8u9Bq1HrbQK5yAPc7WC).

## Earlier run

The same suite at 16:47:59 to 16:49:04, before the harness change, passed 10 of 11. `unauthorized open` failed with `sign failed`. The clinic function-call key on this contract may call only `create_record` and `request_referral`. `request_open` from that key never reaches the contract (`AccessKeyMethodNameMismatchActionError`). A rerun at 16:52:24 to 16:53:47 also passed 11 of 11, on attack share 9, before this rebase.

## phi-scan

`pnpm phi-scan` on 2026-11-14, 16:54:57 to 16:57:44, against the same contract.

`phi-scan coverage actors=6 records=7 shares=13 events=0 status=complete`

`schema=2 terms=50 hits=0 logs=docs/e2e-log.md,.data/server.log,.data/ui-server.log`

`phi-scan found zero fixture identifiers`

Schema 2 has no `get_timeline`, so `events=0` with `status=complete` is the expected coverage. The client reports that missing view as `Contract method is not found`. The scan treats that phrase as a missing method and continues.
