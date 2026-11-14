import { connection } from "next/server";
import { handleSign } from "../../../lib/near/sign-handler";

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleSign(request);
}
