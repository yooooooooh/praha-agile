import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"

export type Session = {
  userId: string
  role: "admin"
}

export const verifySession = cache(async (): Promise<Session> => {
  // 認証プロバイダ未設定。実装時に session 取得 → 不在なら /login へリダイレクト
  redirect("/login")
})
