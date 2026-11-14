import { connection } from "next/server";
import { handleVisitorDemo } from "../../../../lib/visitor/demo";

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleVisitorDemo(request);
}
