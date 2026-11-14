import { handleSupport } from "@/lib/support/handler";

export async function POST(request: Request): Promise<Response> {
  return handleSupport(request);
}