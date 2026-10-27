export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return api().getKit((await params).slug);
}
