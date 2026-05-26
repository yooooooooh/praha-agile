import "server-only"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set")
}

// TODO: 最初の data 関数が DB を読むタイミングで drizzle({ client: postgres(process.env.DATABASE_URL) }) に差し替え
export const db: never = new Proxy({} as never, {
  get() {
    throw new Error("DB client is not configured")
  },
})
