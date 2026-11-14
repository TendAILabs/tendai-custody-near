import { connection } from "next/server";
import { handleVisitorBind } from "../../../../lib/visitor/bind";

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleVisitorBind(request);
}
