export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, { params }: Ctx) {
  return api().getDeals((await params).slug, request);
}

export async function PATCH(request: Request, { params }: Ctx) {
  return api().patchDeal((await params).slug, request);
}
