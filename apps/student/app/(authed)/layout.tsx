import { verifySession } from "@/data/auth"

export const dynamic = "force-dynamic"

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  await verifySession()
  return <>{children}</>
}
