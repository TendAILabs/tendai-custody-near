const rpc = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";

async function query(params) {
  let response;
  try {
    response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "kit",
        method: "query",
        params: { finality: "final", ...params },
      }),
    });
  } catch {
    console.log("rpc-failed");
    process.exit(2);
  }
  if (response.status === 429) {
    console.log("rate-limit");
    process.exit(75);
  }
  const body = await response.json();
  if (body.error) {
    const name = body.error.cause && body.error.cause.name;
    const data = String(body.error.data || body.error.message || "");
    if (/rate limit|too many requests|429/i.test(data)) {
      console.log("rate-limit");
      process.exit(75);
    }
    if (name === "UNKNOWN_ACCOUNT" || data.includes("does not exist")) {
      console.log("missing");
      return null;
    }
    console.log("rpc-error");
    process.exit(2);
  }
  return body.result;
}

function textResult(result) {
  const bytes = result && result.result;
  if (!bytes) return "";
  return Buffer.from(bytes).toString("utf8");
}

const [command, ...args] = process.argv.slice(2);

if (command === "code") {
  const result = await query({ request_type: "view_account", account_id: args[0] });
  if (!result) process.exit(0);
  console.log(result.code_hash || "none");
} else if (command === "keys") {
  const result = await query({ request_type: "view_access_key_list", account_id: args[0] });
  if (!result) process.exit(0);
  for (const key of result.keys || []) {
    const permission = key.access_key.permission;
    if (permission === "FullAccess") {
      console.log(`${key.public_key}\tFullAccess`);
      continue;
    }
    const call = permission.FunctionCall;
    const methods = (call.method_names || []).slice().sort().join(",");
    console.log(`${key.public_key}\t${call.receiver_id}\t${methods}`);
  }
} else if (command === "call") {
  const [contract, method, jsonArgs] = args;
  const result = await query({
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(jsonArgs).toString("base64"),
  });
  if (!result) process.exit(0);
  process.stdout.write(textResult(result));
} else {
  console.error("Usage: node near-view.mjs <code|keys|call> ...");
  process.exit(2);
}
