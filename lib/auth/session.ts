import "server-only"
import { cache } from "react"

export type Session = {
  userId: string
  role: "student" | "admin"
  status: "active" | "resigned"
}

export const verifySession = cache(async (): Promise<Session> => {
  throw new Error("Auth provider is not configured")
})
