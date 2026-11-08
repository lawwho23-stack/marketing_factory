import { FactoryApp } from "@/components/factory-app";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <FactoryApp section="tasks" initialTaskId={(await params).id} />;
}
