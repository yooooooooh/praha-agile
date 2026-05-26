import "server-only"

// TODO(認証ライブラリ選定後): session を検証し、未認証なら redirect("/login") する
export async function verifySession(): Promise<void> {
  throw new Error("not implement")
}
