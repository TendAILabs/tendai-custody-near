import assert from "node:assert/strict";
import { test } from "node:test";
import { parseKeyList, readContractDirectory } from "./directory.ts";

const CONTRACT = "rr191f8afd-contract.testnet";
const OWNER = "rr191f8afd-owner.testnet";

function callResult(value: unknown): { result: number[] } {
  return { result: [...Buffer.from(JSON.stringify(value))] };
}

test("function-call keys keep method names and the contract full-access key is upgradable", () => {
  const keys = parseKeyList(
    {
      keys: [
        { public_key: "ed25519:CgB8znYNQ7wKiNAep2G53MH223XakFtRAXWJqYRAEZoV", access_key: { permission: "FullAccess" } },
        {
          public_key: "ed25519:CXHgVhKiNyGWUo8ubZsyzENA5D6Pa82ucK2319M5E3rn",
          access_key: {
            permission: {
              FunctionCall: {
                allowance: "1",
                receiver_id: CONTRACT,
                method_names: ["create_record", "request_referral"],
              },
            },
          },
        },
      ],
    },
    true,
  );
  assert.equal(keys[0]?.label, "upgradable");
  assert.deepEqual(keys[1]?.methods, ["create_record", "request_referral"]);
  const actorKeys = parseKeyList(
    { keys: [{ public_key: "ed25519:B4vQvV1XgyF5hU6iCTnZpTkchunqzb1MU1NV3NpbtvU3", access_key: { permission: "FullAccess" } }] },
    false,
  );
  assert.equal(actorKeys[0]?.label, "full access");
});

test("a directory read uses view calls, caches the result, and fails closed", async () => {
  let calls = 0;
  const rpc = async (_host: string, params: Record<string, unknown>) => {
    calls += 1;
    if (params.request_type === "view_account") return { code_hash: "7yoEaxs7NvbbHSAw6wY91M1eMV488DocVXyBN5bQaxcz" };
    if (params.request_type === "view_access_key_list" && params.account_id === CONTRACT) {
      return { keys: [{ public_key: "ed25519:CgB8znYNQ7wKiNAep2G53MH223XakFtRAXWJqYRAEZoV", access_key: { permission: "FullAccess" } }] };
    }
    if (params.request_type === "view_access_key_list") {
      return {
        keys: [
          {
            public_key: "ed25519:CXHgVhKiNyGWUo8ubZsyzENA5D6Pa82ucK2319M5E3rn",
            access_key: { permission: { FunctionCall: { method_names: ["request_open"], receiver_id: CONTRACT, allowance: "1" } } },
          },
        ],
      };
    }
    const args = JSON.parse(Buffer.from(String(params.args_base64), "base64").toString());
    if (params.method_name === "get_owner") return callResult(OWNER);
    if (params.method_name === "list_actors") {
      assert.equal(args.limit, 50);
      return callResult([{ account_id: "rr191f8afd-pulsefit.testnet", role: "App", display_name: "PulseFit", active: true }]);
    }
    throw new Error("unexpected");
  };
  const cache = new Map();
  const first = await readContractDirectory({ rpc, contractId: CONTRACT, cache, now: 1_000, hosts: ["https://rpc.example"] });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.owner, OWNER);
  assert.equal(first.contractKeys[0]?.label, "upgradable");
  assert.equal(first.actors[0]?.displayName, "PulseFit");
  assert.deepEqual(first.actors[0]?.keys[0]?.methods, ["request_open"]);
  assert.equal(JSON.stringify(first).includes("enc_pubkey"), false);
  const after = calls;
  const second = await readContractDirectory({ rpc, contractId: CONTRACT, cache, now: 1_000 + 30_000, hosts: ["https://rpc.example"] });
  assert.equal(second.ok, true);
  assert.equal(calls, after);

  const down = new Map();
  const failed = await readContractDirectory({
    rpc: async () => {
      throw new Error("down");
    },
    contractId: CONTRACT,
    cache: down,
    now: 5_000,
    hosts: ["https://rpc.example"],
  });
  assert.equal(failed.ok, false);
  if (failed.ok) return;
  assert.match(failed.error, /could not be read/);
  assert.match(failed.explorerUrl, /nearblocks\.io/);
});
