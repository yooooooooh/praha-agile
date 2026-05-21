import { redirect } from "next/navigation"
import { verifySession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (session.role !== "admin") redirect("/login")
  return <>{children}</>
}
