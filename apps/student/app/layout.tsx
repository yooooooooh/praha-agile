import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "プラハチャレンジ (受講生)",
  description: "プラハチャレンジ 受講生向けアプリ",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
