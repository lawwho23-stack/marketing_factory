import { notFound } from "next/navigation";
import { FactoryApp } from "@/components/factory-app";
const sections = [
  "scripts",
  "video-editor",
  "tasks",
  "crm",
  "finance",
  "campaigns",
  "activity",
  "settings",
];
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <FactoryApp section={section} />;
}
