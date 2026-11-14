import { connection } from "next/server";
import { handleDemoConfig } from "../../../../lib/demo/config-handler";

export async function GET(request: Request): Promise<Response> {
  await connection();
  return handleDemoConfig(request);
}
