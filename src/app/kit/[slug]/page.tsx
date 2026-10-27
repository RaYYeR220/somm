import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/server/api/instance";
import { KitView, type KitData } from "./kit-view";

export const dynamic = "force-dynamic";

async function load(slug: string): Promise<KitData | null> {
  const res = await api().getKit(slug);
  return res.ok ? ((await res.json()) as KitData) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const kit = await load((await params).slug);
  return kit ? { title: kit.title, description: `Who ${kit.property.name}'s fans are and the brands they already love, with Qloo evidence.` } : { title: "Media kit" };
}

export default async function KitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kit = await load(slug);
  if (!kit) notFound();
  return <KitView kit={kit} />;
}
