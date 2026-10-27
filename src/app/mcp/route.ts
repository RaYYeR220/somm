export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { mcp } from "@/server/api/instance";

export const GET = (request: Request) => mcp(request);
export const POST = (request: Request) => mcp(request);
export const DELETE = (request: Request) => mcp(request);
