import type { Metadata } from "next";
import { OwnerInbox } from "./owner-inbox";

export const metadata: Metadata = { title: "Kit inbox", robots: { index: false } };

export default async function OwnerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params;
  const { k } = await searchParams;
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-12 sm:px-6 lg:py-16">
      <OwnerInbox slug={slug} token={k ?? ""} />
    </div>
  );
}
