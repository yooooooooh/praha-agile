import "server-only"

export const db: never = new Proxy({} as never, {
  get() {
    throw new Error("DB client is not configured")
  },
})
