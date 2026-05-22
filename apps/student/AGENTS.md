# student アプリ - AI Agent Context

このファイルは student アプリ(受講生向け)の設計と開発フローを記載しています。
リポジトリ全体の設計判断は [docs/superpowers/specs/2026-05-22-monorepo-repository-design.md](../../docs/superpowers/specs/2026-05-22-monorepo-repository-design.md) を参照。

## アーキテクチャ

Next.js App Router + Server Actions + Data Access Layer (DAL) パターン。
ドメインの不変条件と DTO 型を `model/` (isomorphic) に閉じ込め、DB アクセスと認可を `data/` (server-only) に集約、`app/<route>/actions.ts` を薄いオーケストレーションに保つ。

```
apps/student/
├── app/                          # Next.js App Router
│   ├── login/page.tsx
│   ├── (authed)/                 # 認証必須グループ
│   │   ├── layout.tsx
│   │   └── lessons/[lessonId]/
│   │       ├── page.tsx
│   │       ├── actions.ts
│   │       ├── CompleteLessonButton.tsx
│   │       └── error.tsx
│   ├── api/                      # Route Handlers
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── data/                         # 認可付きデータアクセス (server-only)
│   ├── auth.ts
│   └── lessons.ts
├── model/                        # エンティティ定義 (型・Zod・ドメインの不変条件・DTO 変換、isomorphic)
│   └── lessons.ts
├── components/                   # アプリ内横断 UI
├── public/
└── package.json
```

## 層と依存方向

| 層 | 責務 | 依存方向 |
|---|---|---|
| **app** | Next.js routing、薄い page / actions / layout / error | → data, model, components |
| **data** | DB アクセス + 認可 (server-only) | → model |
| **model** | エンティティ定義 (Server / Client Component 両方から import 可) | なし |
| **components** | アプリ内横断 UI | → model |

**重要**: 上位層は下位層に依存できるが、下位層は上位層に依存してはいけない。特に `model/` から `data/` を import すると `server-only` コードが Client bundle に混入するため厳禁。

## 技術スタック

| 用途 | ライブラリ |
|---|---|
| フレームワーク | Next.js 16 (App Router, Server Actions) |
| UI | React 19 |
| 言語 | TypeScript 5 |
| スタイル | Tailwind CSS v4 |
| DB / ORM | Drizzle ORM (`@praha-agile/db` 経由) |
| 入力検証 | Zod |
| アクセシブル UI | Radix UI |
| テスト | Vitest |
| lint / format | Biome |

## ルーティング

`app/` 配下のディレクトリ構造がそのまま URL になる。`login/` はフラットに置き、認証必須ページは `(authed)/` グループに集約する。

```
app/
├── login/page.tsx              # /login
├── (authed)/
│   ├── layout.tsx              # 認証ガード
│   └── lessons/[lessonId]/page.tsx
├── api/
└── page.tsx                    # /
```

page.tsx は **薄い Server Component**。`data/` から生データを取得し、`model/` の `toXDto()` で DTO に変換してから Client Component に渡す。

```tsx
// app/(authed)/lessons/[lessonId]/page.tsx
import { notFound } from "next/navigation"
import { getLesson } from "@/data/lessons"
import { toLessonDto } from "@/model/lessons"
import { CompleteLessonButton } from "./CompleteLessonButton"

export default async function Page({ params }: { params: { lessonId: string } }) {
  const lesson = await getLesson(params.lessonId)
  if (!lesson) notFound()
  const lessonDto = toLessonDto(lesson)
  return (
    <article>
      <h1>{lessonDto.title}</h1>
      <p>{lessonDto.description}</p>
      <CompleteLessonButton lessonId={lessonDto.id} completed={lessonDto.completed} />
    </article>
  )
}
```

`(authed)/layout.tsx` は `data/auth.ts` の `verifySession` を呼び、未ログインなら `/login` にリダイレクトする。

- `data/` から生データ取得 → `model/` の `toXDto()` で DTO 化して Client Component に渡す
- 派生計算は `model/` の純粋関数で行う
- 認可コードを page 内に書かない (DAL で完結)

根拠:
- "For new projects, we recommend creating a dedicated Data Access Layer (DAL)... A Data Access Layer should: Only run on the server. Perform authorization checks. Return safe, minimal Data Transfer Objects (DTOs)." — [Next.js: Data Security](https://nextjs.org/docs/app/guides/data-security#data-access-layer)

## コンポーネントの粒度

利用範囲ごとに 3 段階に配置する。

| 利用範囲 | 配置 |
|---|---|
| 1 つの route のみ | `app/<route>/<Component>.tsx` (コロケーション) |
| アプリ内の複数 route | `apps/student/components/<Component>.tsx` |
| 両アプリ (student + admin) | `packages/ui/` に昇格 (現状なし、必要時に新設) |

- **Server Component が default**。`"use client"` を書いたファイルだけ Client Component
- インタラクティブ要素 (`useState` / イベントハンドラ / ブラウザ専用 API) が必要な部分だけ `"use client"`
- Client Component の props は serializable のみ (`toXDto` で絞り込んだ DTO を渡す)

根拠:
- "By default, Next.js uses Server Components. This allows you to automatically implement server rendering with no additional configuration, and you can opt into using Client Components when needed." — [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

## Server Actions

mutation は Server Action で実装し、route 隣の `actions.ts` に配置する。

```ts
// app/(authed)/lessons/[lessonId]/actions.ts
"use server"
import { revalidatePath } from "next/cache"
import { completeLessonInputSchema, canComplete } from "@/model/lessons"
import { getLesson, completeLesson } from "@/data/lessons"

export async function completeLessonAction(formData: FormData) {
  const parsedInput = completeLessonInputSchema.parse({
    lessonId: formData.get("lessonId"),
  })
  const lesson = await getLesson(parsedInput.lessonId)
  if (!lesson) throw new Error("Not found")
  if (!canComplete(lesson)) throw new Error("既に完了しています")
  await completeLesson(parsedInput.lessonId)
  revalidatePath(`/lessons/${parsedInput.lessonId}`)
}
```

- 冒頭に `"use server"`
- 入力は **必ず Zod schema で `parse`** (= 検証 + 許可フィールドの抜き出しを同時実施)。`Object.fromEntries(formData)` を DAL に渡さない (mass assignment 防止)
- DAL (`data/<entity>.ts`) 経由でデータ操作。Drizzle の `db` を直接 import しない
- ドメインの不変条件 (`canComplete` 等) は `model/` の純粋関数で呼ぶ
- 複数エンティティをまたぐ操作はここで `data/` の関数を並列に並べる (spec §3.4 参照)
- 最後に `revalidatePath` / `revalidateTag` でキャッシュ無効化

根拠:
- "Always validate input from client, as they can be easily modified... Server Actions can be invoked via a direct POST request, not just through your application's UI." — [Next.js: Data Security](https://nextjs.org/docs/app/guides/data-security#validating-client-input)
- "DTOのようにデータベースに近いところで制御するのではなく、Viewの直前で制御した方が良さそうに思いました" — [DTOクラスはやり過ぎ (Zenn)](https://zenn.dev/naofumik/articles/c699deb688ac04)

## エラーハンドリング

- ドメインの不変条件違反や認可失敗は `throw new Error(...)` で投げる
- 投げられたエラーは `app/<route>/error.tsx` boundary で捕捉して fallback UI を表示
- 認証エラー (`verifySession` 内で session 不在) は `redirect("/login")` で遷移
- Form 入力エラーは Zod の検証結果を UI に反映 (フォームライブラリ採用は別 spec)
- neverthrow / ts-pattern 等は現段階で採用しない

```tsx
// app/(authed)/lessons/[lessonId]/error.tsx
"use client"
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert">
      <p>エラーが発生しました: {error.message}</p>
      <button type="button" onClick={reset}>もう一度試す</button>
    </div>
  )
}
```

根拠:
- [Next.js: error.tsx](https://nextjs.org/docs/app/getting-started/error-handling)

## 開発フロー

### A. 新機能を追加する時

新機能 (例: 受講生が課題を完了する) を追加する時は、ドメイン (`model/`) → 認可付きデータアクセス (`data/`) → 画面 (`app/`) の順に下から積み上げる。

```
apps/student/
├── app/(authed)/lessons/[lessonId]/
│   ├── page.tsx
│   ├── actions.ts
│   ├── CompleteLessonButton.tsx
│   └── error.tsx
├── data/lessons.ts
└── model/
    ├── lessons.ts
    └── lessons.test.ts
```

実装順は **model → data → actions → Client Component → page → error**。

#### 1. `model/lessons.ts` を整える

- 生の型 (`packages/db` の Drizzle schema から `InferSelectModel` で導出)
- DTO 型 (`Pick<...>` で公開してよいフィールドを定義) と `toLessonDto()` 変換関数
- 入力検証用 Zod schema (Server Action とフォームで再利用)
- ドメインの不変条件 (`canComplete` 等、引数で必要な値を全て受け取る純粋関数)
- 隣に `lessons.test.ts` でルールのユニットテスト

#### 2. `data/lessons.ts` を整える

- 冒頭 `import "server-only"`
- read 関数: `verifySession` → DB → 認可 → 生 row 返却 (`cache()` でラップ)
- write 関数: `verifySession` → 認可 → DB 更新
- **`cache()` の引数は必ずプリミティブで渡す** (オブジェクトリテラルは参照同一性で比較されるため毎回新参照になり memo 化が効かない)

#### 3. `app/<route>/actions.ts` を作る

- `"use server"` 冒頭
- Zod parse → DAL fetch → 不変条件 check → DAL mutate → `revalidatePath`

#### 4. `app/<route>/<X>.tsx` (Client Component) を作る

- `"use client"` 冒頭
- form の `action` 属性で Server Action を呼ぶ

#### 5. `app/<route>/page.tsx` を作る

- Server Component、`data/` から取得 → `toLessonDto()` で DTO 化 → Client Component に渡す

#### 6. `app/<route>/error.tsx` を作る

- `"use client"` 冒頭、`error.tsx` boundary で throw を捕捉

### B. DB schema を変更する時

```
packages/db/
├── src/schema.ts
└── drizzle/0001_add_lessons_completed_at.sql

apps/student/
├── model/lessons.ts
└── data/lessons.ts
```

#### 1. `packages/db/src/schema.ts` を編集

テーブル / カラム / 制約を変更する。

#### 2. migration を生成

リポジトリルートで `pnpm db:generate` を実行し、`packages/db/drizzle/*.sql` を生成。PR にコミットする。

#### 3. 影響する `model/` `data/` を追従

`InferSelectModel` 由来の型は自動更新されるが、`toXDto()` 関数や Zod schema、DAL の query/mutation で参照しているカラム名を必要に応じて調整する。

#### 4. 本番適用 (リリース時、手動)

リリース担当者がローカルから `DATABASE_URL=<prod> pnpm db:migrate` を実行する。順序は **migration → deploy**。

### C. 共有要素を昇格する時

route 隣に書いた要素が複数 route から使われ始めたら引き上げる。

UI コンポーネントの昇格:
```
apps/student/
├── app/(authed)/lessons/LessonCard.tsx   # 移動元
└── components/LessonCard.tsx             # 移動先
```

型 / Zod / ルールの昇格:
```
apps/student/
├── app/(authed)/lessons/complete-schema.ts   # 移動元
└── model/lessons.ts                          # 移動先 (集約)
```

両アプリ横断への昇格 (`packages/ui/` を新設):
```
packages/ui/src/Button.tsx
apps/student/components/Button.tsx   # 移動元
apps/admin/components/Button.tsx     # 移動元
```

抽象度を再確認する。同名でも実態が違うものを無理に共通化しない (コピペで複数箇所に残す選択肢もあり)。

### D. 複数エンティティをまたぐ操作 / トランザクション

- **複数エンティティの操作は `actions.ts` でオーケストレーション** (`data/` 同士の依存は禁止)
- **同期的・不可分な更新が必要な場合のみ `data/` 内で `db.transaction` を許容** (単一ファイル内に閉じる)

詳細は spec §3.4 / §3.5 を参照。

## 参考リンク

- [Monorepo Repository Design Spec](../../docs/superpowers/specs/2026-05-22-monorepo-repository-design.md)
- [Next.js: Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js: error.tsx](https://nextjs.org/docs/app/getting-started/error-handling)
- [React: cache](https://react.dev/reference/react/cache)
- [Drizzle ORM: Infer model types](https://orm.drizzle.team/docs/goodies#type-api)
- [Drizzle ORM: Transactions](https://orm.drizzle.team/docs/transactions)
- [Zod](https://zod.dev/)
- [Radix UI](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Biome](https://biomejs.dev/)
