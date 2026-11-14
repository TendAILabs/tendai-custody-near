export type AttackLine = {
  id: string;
  title: string;
  where: string;
  text: string;
  tx: string | null;
};

export const ATTACK_INTRO =
  "These lines are copied from the attack-demo table in this repo (testnet, 2026-11-14, 11 of 11 passed, attack share 14). This page does not run the attacks. A recorded result is not a fresh check.";

export const ATTACK_LIMIT =
  "Testnet only, with fictional data. This list is not a stamp of approval, and it does not say every possible attack was tried. Revoke cannot erase a copy already downloaded.";

export const ATTACK_LINES: AttackLine[] = [
  {
    id: "create_record",
    title: "Clinic creates a record",
    where: "On the testnet contract",
    text: "Clinic create_record was accepted and returned record 8.",
    tx: "EPR5jHDRpxJSLdqCjg9a8EP6d93QKiyeeMgG2doZa2Eg",
  },
  {
    id: "share",
    title: "Clinic requests a referral",
    where: "On the testnet contract",
    text: "Clinic request_referral to the hospital was accepted and returned share 14.",
    tx: "2uJt3QZrsrabGMqkxsptbGaENZSX6dY8cPg7ybegui8t",
  },
  {
    id: "unauthorized",
    title: "Someone else tries to open",
    where: "On the testnet contract",
    text: "A clinic that is not the recipient called request_open. The contract refused with ERR_UNAUTHORIZED.",
    tx: "C5oaSkJTX61yDwc4y6H3wyKdXL1AnPcFrQ8Mbjn5Yi6k",
  },
  {
    id: "approve",
    title: "Patient approves",
    where: "On the testnet contract",
    text: "Patient approve_share with 1 yoctoNEAR was accepted.",
    tx: "B2XvGsCzWiZRkvbg4auKCUFQEnxB96JQUjXUvcai4mUn",
  },
  {
    id: "ticket",
    title: "Hospital opens the active share",
    where: "On the testnet contract",
    text: "Hospital request_open on the active share was accepted.",
    tx: "DxkQ7GPqtr8sX384sKM5vMmuoRFTMk1ARhNkCvYoSUqn",
  },
  {
    id: "replay",
    title: "The same open ticket is used twice",
    where: "Inside the script, not a new transaction",
    text: "The first local open was HTTP 200. The same nonce was HTTP 403 replay.",
    tx: null,
  },
  {
    id: "key",
    title: "A different encryption key is offered",
    where: "Inside the script, not a new transaction",
    text: "The script offered an encryption key that does not match the on-chain directory. The code kept the on-chain key.",
    tx: null,
  },
  {
    id: "swap",
    title: "One byte of the encrypted file is flipped",
    where: "Inside the script, not a new transaction",
    text: "A ciphertext with one flipped byte was rejected.",
    tx: null,
  },
  {
    id: "reply",
    title: "A consult reply is recorded",
    where: "On the testnet contract",
    text: "Hospital submit_reply was accepted and returned reply 16. The reply text was not stored, only a hash.",
    tx: "CrMs24p6wUp3fbLv3PcSkMnkYMEonW4pPMq5o7oTc67Y",
  },
  {
    id: "revoke",
    title: "Patient revokes",
    where: "On the testnet contract",
    text: "Patient revoke_share with 1 yoctoNEAR was accepted. Revoke cannot erase a copy already downloaded.",
    tx: "6BUCRw2VQ6xndpbgyLAczDPzrLSZ2EmRcFggMSoyT9HA",
  },
  {
    id: "revoked",
    title: "An open after revoke",
    where: "On the testnet contract",
    text: "A later hospital request_open panicked ERR_REVOKED.",
    tx: "CGaCe4yTiSc5uc9Rtwuc82BFy72bZ5sbdwq8r4QjGf8L",
  },
];
