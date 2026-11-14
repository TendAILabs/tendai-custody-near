# E2E log

Testnet run at 2026-11-10T04:39:41.664Z. NEAR AI was called with e2ee. provider_tee is required for the summary. Private keys are not in this log.

```
server http://127.0.0.1:3417
tee requested=true
create_record id=3 tx=78w8SuGgtd8yKjPaGLDH6ruBUX1kUb4ukyFdLE9zgszK
request_referral id=4 tx=CX8y7e9yoMvbmfyE4UCdL2MgGAPdxyg4jPCupsQS5Paq
request_owner_open tx=9R8VaLANpydPzeMVEpdLPB7vLYRaQucfVJ5uzTunjCWo
owner fetch status=200 envelopes=5
owner decrypt history match=true
owner decrypt meds match=true
owner decrypt labs match=true
owner decrypt imaging match=true
owner decrypt notes match=true
tee stage=attesting
tee stage=encrypting
tee stage=in TEE
tee stage=verifying
tee model=z-ai/glm-5.3-flash signatureKind=provider_tee verified=provider_tee
tee signer=ed25519 5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff
tee gateway tcb=UpToDate signer=ed25519 40599fb284f43953bb356b09080fd803c960fc10285ad90eca462ca711ad4acb tls=attested
tee models=1 tcb=UpToDate gpu=verified signer=ed25519 5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff
tee latencyMs=2985 promptTokens=174 completionTokens=83 summaryChars=335
tee true
approve_share tx=4sPytqRadSWhXm5HgYX7YLxbBGejFmEsQ5Pc13QAFzGd
request_open tx=5cCBaiExiRTWKBa5eX1DqMZDk9eP9DdoQZoNGUv9Khai
hospital fetch status=200
hospital decrypt tee=true sections=history,meds,labs
create_share SecondOpinion id=5 tx=9oY4jXaHz3FhmUp9wp9q2b4R4NabpXfuRwEyxBDTfhHN
deid stage=attesting
deid stage=encrypting
deid stage=in TEE
deid stage=verifying
deid localOnly=false fixture_name_left=false
create_share DeidApp id=6 tx=HKiboXRFUrg3GDm2Fp3k6HpM1DK2YXtFB1t8UgEoYXZr
stored a ticket and left it unfetched
revoke_share tx=3nHVJEUHisc4ywFArb2Co489VMPiALGNuj46XtfpLpCc
revoke visible status=Revoked waitedMs=121
old ticket within 120s status=403 error=revoked
revoked open error contains ERR_REVOKED=true
replayed nonce fetch status=403 error=replay
revoked fresh nonce fetch status=403 error=revoked
e2e ok
```
