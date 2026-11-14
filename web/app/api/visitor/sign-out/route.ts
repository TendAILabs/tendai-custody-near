import { connection } from "next/server";
import { handleVisitorSignOut } from "../../../../lib/visitor/bind";

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleVisitorSignOut(request);
}
