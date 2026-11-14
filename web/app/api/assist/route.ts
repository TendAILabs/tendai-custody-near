import { connection } from "next/server";
import { handleAssist } from "../../../lib/assist/handler.ts";
import { assistCompletion } from "../../../lib/assist/live.ts";

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleAssist(request, {
    secret: process.env.DEMO_SESSION_SECRET ?? "",
    keyConfigured: Boolean(process.env.NEARAI_API_KEY?.trim()),
    answer: assistCompletion,
  });
}
