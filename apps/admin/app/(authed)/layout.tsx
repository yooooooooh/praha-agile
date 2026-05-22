import { redirect } from "next/navigation"
import { verifySession } from "@/data/auth"

export const dynamic = "force-dynamic"

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (session.role !== "admin") redirect("/login")
  return <>{children}</>
}
