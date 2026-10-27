import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ReportView } from "@/components/report/report-view";
import { getAgentDeps } from "@/server/agent/deps";
import type { DiligenceResult } from "@/server/agent/diligence";
import type { ScoutResult } from "@/server/agent/scout";

export const dynamic = "force-dynamic";

function titleOf(kind: string, input: unknown, result: unknown): string {
  if (kind === "scout") return (result as ScoutResult | null)?.property.name ?? (input as { input?: { property?: { name?: string } } })?.input?.property?.name ?? "Sponsor report";
  return `${(result as DiligenceResult | null)?.brand.name ?? (input as { brand?: { name?: string } })?.brand?.name ?? "Brand"} offer review`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const run = getAgentDeps().store.get((await params).id);
  return { title: run ? titleOf(run.kind, run.input, run.result) : "Report" };
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = getAgentDeps().store.get(id);
  if (!run) notFound();
  const workspace = (await cookies()).get("somm_ws")?.value;
  return (
    <div className="mx-auto max-w-[1320px] px-4 py-10 sm:px-6 sm:py-14">
      <ReportView
        initial={{ id: run.id, kind: run.kind, status: run.status, result: run.result, mine: Boolean(workspace) && workspace === run.workspace, title: titleOf(run.kind, run.input, run.result) }}
      />
    </div>
  );
}
