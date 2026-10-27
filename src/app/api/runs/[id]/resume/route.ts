export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api().resume((await params).id, request);
}
