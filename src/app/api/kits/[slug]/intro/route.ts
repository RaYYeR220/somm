export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  return api().postIntro((await params).slug, request);
}
