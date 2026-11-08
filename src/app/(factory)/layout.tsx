import { redirect } from "next/navigation";
import { isOwner } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function FactoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isOwner())) redirect("/login");
  return children;
}
