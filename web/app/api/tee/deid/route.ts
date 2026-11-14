import { connection } from "next/server";
import { liveDeidClient } from "../../../../lib/tee/live";
import { handleTeeDeid } from "../../../../lib/tee/deid-handler";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  await connection();
  return handleTeeDeid(request, {
    secret: process.env.DEMO_SESSION_SECRET ?? "",
    keyConfigured: Boolean(process.env.NEARAI_API_KEY?.trim()),
    createClient: () => liveDeidClient(),
  });
}
