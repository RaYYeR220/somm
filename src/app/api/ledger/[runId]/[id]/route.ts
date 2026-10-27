export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string; id: string }> }) {
  const { runId, id } = await params;
  return api().getLedgerEntry(runId, id);
}
