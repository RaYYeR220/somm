export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api().getRun((await params).id, request);
}
