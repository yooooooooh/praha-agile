import { redirect } from "next/navigation"
import { verifySession } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (session.role !== "student") redirect("/login")
  return <>{children}</>
}
