export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { api } from "@/server/api/instance";

export const GET = () => api().health();
