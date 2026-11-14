import { connection } from "next/server";
import { handleVisitorStart } from "../../../../lib/visitor/start";

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleVisitorStart(request);
}
