import { connection } from "next/server";
import { readContractDirectory } from "../../../../lib/near/directory";

export async function GET(): Promise<Response> {
  await connection();
  const body = await readContractDirectory();
  return Response.json(body, {
    headers: { "cache-control": body.ok ? "public, max-age=30, s-maxage=60" : "no-store" },
  });
}
