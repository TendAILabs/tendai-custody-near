import { connection } from "next/server";
import { handleVisitorStatus } from "../../../lib/visitor/status";

export async function GET(request: Request): Promise<Response> {
  await connection();
  return handleVisitorStatus(request);
}
