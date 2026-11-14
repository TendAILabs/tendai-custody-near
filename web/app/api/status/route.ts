import { connection } from "next/server";
import { readPublicStatus, STATUS_CACHE_CONTROL } from "../../../lib/status/public";

export async function GET(): Promise<Response> {
  await connection();
  const body = await readPublicStatus();
  return Response.json(body, { headers: { "cache-control": STATUS_CACHE_CONTROL } });
}
