# リポジトリ構造 spec

- 作成日: 2026-05-21
- 開発体制: 実装 3 人 + PO 1 人 = 計 4 人
- スコープ: リポジトリのトップレベル構成、`app/` 配下の構造、コンポーネント共通化、BE 処理の責務分離、補助系(型・スタイル・パス alias・lint/format)
- スコープ外: コード規約の詳細、開発フロー、認証プロバイダの選定、DB スキーマ設計、認可ルールの詳細、外部連携の詳細設計、監視等(別 spec)

---

## 1. 全体ツリー図

```
praha-agile/
├── app/
│   ├── (public)/                # 未ログインで見られる範囲
│   │   └── login/page.tsx
│   ├── (student)/               # 受講生ログイン必須
│   │   ├── layout.tsx           # 受講生用 layout + 認可ガード
│   │   ├── _components/         # (student) 内の複数 page で共有する UI
│   │   └── <feature>/
│   │       ├── page.tsx
│   │       ├── actions.ts       # page 専用の Server Actions
│   │       └── *.test.ts
│   ├── (admin)/                 # 運営ログイン必須(構造は (student) と同じ)
│   ├── api/                     # Route Handlers(webhook / OAuth / Cron 等)
│   ├── globals.css
│   └── layout.tsx
├── components/                  # 複数 Route Group から使う UI
├── lib/
│   ├── db/                      # Drizzle 基盤(client + schema)
│   │   ├── index.ts             # Drizzle client(`import { db } from "@/lib/db"`)
│   │   └── schema.ts            # Drizzle schema(テーブル定義)
│   ├── auth/                    # 認証基盤(認証プロバイダのラッパー)
│   │   └── session.ts           # verifySession(認証 + 退会者ブロック)
│   ├── dal/                     # Data Access Layer(認可付きデータアクセス)
│   │   ├── assignments.ts
│   │   └── users.ts
│   ├── integrations/            # 外部サービスの SDK ラッパー(server-only)
│   │   ├── stripe.ts
│   │   ├── slack.ts
│   │   ├── notion.ts
│   │   └── google.ts
│   └── <domain>/                # ドメイン固有の制約と入力検証
│       ├── rules.ts             # ドメインルール(純粋関数)
│       └── schema.ts            # Zod スキーマ
├── public/                      # 静的ファイル
├── .github/
│   └── workflows/
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── vitest.config.ts
├── biome.json
├── drizzle.config.ts
├── vercel.json
├── package.json
├── .gitignore
├── .env.example
└── README.md
```

`types/` `hooks/` `constants/` は必要になってから作る。

---

## 2. ADR-1: アプリは単一 Next.js + Route Groups で構成する

このプロジェクトは単一 Next.js アプリで構成し、`(public)` / `(student)` / `(admin)` の 3 つの Route Groups に分割する。各 Route Group の `layout.tsx` で認可ガードを行う。Vercel project は 1 つ、deploy も 1 つ。

**LP / 募集サイトの扱い**:

- プラハチャレンジの LP / 募集サイトは Studio で別管理。本アプリは認証後の機能に集中する
- 本 spec で扱うのは認証後のアプリ部分のみ

**ディレクトリ構造**:

```
app/
  (public)/
    login/page.tsx
  (student)/
    layout.tsx          # session を検証し、role が student でなければリダイレクト
    assignments/page.tsx
  (admin)/
    layout.tsx          # session を検証し、role が admin でなければリダイレクト
    users/page.tsx
```

**実装イメージ**:

```tsx
// app/(student)/layout.tsx
import { redirect } from "next/navigation"
import { verifySession } from "@/lib/auth/session"

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (session.role !== "student") redirect("/login")
  return <>{children}</>
}
```

**対案**:

| 方針 | メリット | デメリット |
|---|---|---|
| monorepo + apps 分割(`apps/web` と `apps/admin`) | 完全な独立 deploy / bundle 分離 / admin と student で異なる依存ライブラリ / チーム分業しやすい | Turborepo or pnpm workspaces の設定コスト / CI キャッシュ戦略 / 共通コードのバージョン管理 / Vercel project が複数 |
| 単一アプリ + ディレクトリで論理分離(Route Groups なし) | 最もシンプル / Next.js の特殊機能を覚えなくて良い | `layout.tsx` 認可ガード不可 / 各 page で個別チェックが必要 / 論理境界が命名規約のみ |
| ネストした Route Groups(`(authed)/(student)`) | 認証チェックを 1 箇所に集約 | ファイル階層が深い / URL ↔ ファイル対応が読みにくい / 現状 2 つしかないため、共通化の利益より階層の読みにくさが上回る |
| **単一アプリ + Route Groups(採用)** | layout で認可表現 / MVP 規模に最適 / 後から monorepo へ移行可能 | Route Groups の仕様を覚える必要 / admin と student が同一 bundle |

**選んだ理由**:

- 利用者 50 人以下、実装 3 人 + PO 1 人の MVP 段階で monorepo の設定コストは過剰
- ディレクトリ分離だけでは認可ガードを layout に集約できず、漏れのリスクが高い
- Route Groups は構造化と運用負担の中間として最も適合する
- 現状の認可境界(student / admin の 2 つ)に対してネスト構造は過剰

**ルート `/` の挙動**:

- 未ログイン → ログイン画面にリダイレクト
- ログイン済み → role に応じて `/student` or `/admin` にリダイレクト
- LP は当面持たない(LP は Studio で別管理)

**注意**:

- `layout.tsx` での認可ガードは UX のためであり、セキュリティ境界ではない
- [CVE-2025-29927](https://github.com/advisories/GHSA-f82v-jwr5-mffw) が示したように middleware / layout の認可チェックは迂回されうる
- 本物の認可は ADR-4 の DAL で行う

**昇格・見直し条件**:

- admin だけ独立 deploy したい要件が出た時 → monorepo への移行を検討(詳細は「monorepo 分離の計画条件」)
- 認可境界が student / admin の 2 つから増えた時(例: 退会者専用ページが必要になった、メンター role が独立した等)→ Route Groups の構造を再設計

---

## 3. ADR-2: トップレベルのディレクトリ構成

ルート直下に `app/` + `components/` + `lib/` + `public/` を配置する。コードを `src/` 配下にまとめることはしない。

**ディレクトリ構造**:

```
praha-agile/
├── app/             # Next.js App Router(ルーティング + UI)
├── components/      # 複数 Route Group から使う UI コンポーネント
├── lib/             # 非 UI 横断ロジック
│   ├── db/          # Drizzle 基盤(client + schema)
│   ├── auth/        # 認証基盤(認証プロバイダのラッパー)
│   ├── dal/         # Data Access Layer(認可付きデータアクセス)
│   ├── integrations/ # 外部サービス連携(Stripe / Slack / Notion / Google 等)
│   └── <domain>/    # ドメインルール・入力スキーマ
├── public/          # 静的ファイル(favicon, og 画像等)
└── (設定ファイル群はルート直下)
```

**`lib/` の責務分界**:

- `lib/db/`: Drizzle の基盤層。client 接続と schema 定義のみ。認可・ビジネスロジックは含まない
- `lib/auth/`: 認証基盤。認証プロバイダ(別 spec で選定)の SDK をラップ。session 取得・退会者ブロックを担う
- `lib/dal/`: 認可付きデータアクセス層。`lib/db/` と `lib/auth/` を組み合わせて、認可済みのリソース操作関数を提供
- `lib/integrations/`: 外部サービス(Stripe / Slack / Notion / Google)の SDK ラッパー。webhook signature 検証や API クライアントを集約
- `lib/<domain>/`: ドメインルール(純粋関数)と入力検証スキーマ

**依存方向**:

- `lib/dal/` → `lib/db/`, `lib/auth/`(単方向)
- `lib/<domain>/` は他のいずれにも依存しない(純粋関数のため)
- `lib/integrations/` は独立(外部 API のみに依存)

**実装イメージ**: 設定ファイルの配置のみ。

```
next.config.ts        # Next.js 設定
tsconfig.json         # TypeScript 設定(paths: { "@/*": ["./*"] })
tailwind.config.ts    # Tailwind 設定
postcss.config.js     # PostCSS 設定
vitest.config.ts      # Vitest 設定
biome.json            # Biome 設定(formatter + linter)
drizzle.config.ts     # Drizzle 設定(migrations 出力先等)
vercel.json           # Vercel 設定
.env.example          # 環境変数のキー一覧(値はダミー)
```

**対案**:

| 方針 | メリット | デメリット |
|---|---|---|
| `src/` 配下に全コードをまとめる | ルート直下が設定ファイルだけになって整理される / 大規模化に強い / 他言語プロジェクトとの慣習が揃う | Next.js 公式ドキュメントと階層がズレる / `app/` が一段深くなる / import パスがわずかに長い |
| すべてを `app/` 配下に閉じ込める(`app/_lib/` で共通ロジックを持つ) | 横断ロジックも routing と一緒に管理 | Route Group をまたいで参照する構造が読みにくい |
| `hooks/` `types/` `constants/` を最初から切る | 役割別に整理されて拡張時に迷わない | 空ディレクトリが増える / 最初は `lib/` 同居で足りる |
| `lib/db/` と `lib/dal/` を 1 つにまとめる(全部 `lib/dal/`) | ディレクトリが浅い | 「DB 基盤」と「認可付きアクセス層」の責務が混ざる / Next.js 公式コード例(`import { db } from "@/lib/db"`)と乖離 |
| `lib/integrations/` を切らず、`lib/stripe/` `lib/slack/` のようにドメインと同列配置 | ファイル数が浅い | 自前 DB(`db/`)と外部 API(integrations)の境界が物理的に見えない / 認可レビュー時に区別しにくい |
| **`app/` + `components/` + `lib/(db + auth + dal + integrations + domain)` + `public/`(採用)** | `create-next-app` デフォルトと一致 / 公式コード例と import パスが揃う / 各層の責務が物理的に分離 | ディレクトリが増える(`lib/` 配下が 5 つ) |

**選んだ理由**:

- `create-next-app` が生成するデフォルト構造と一致し、新規参加者が迷わない
- Next.js 公式の Data Security ガイドが示すサンプルコード(`import { db } from "@/lib/db"`, `import { auth } from "@/lib/auth"`)と import パスが一致する。公式ドキュメントを読みながら実装する時の摩擦が最小
- `lib/db/` `lib/auth/` `lib/dal/` を分けることで、「DB 基盤」「認証基盤」「認可付きアクセス層」の責務が物理的に明示される
- `lib/dal/` と `lib/integrations/` を分けることで、「自前 DB へのアクセス」と「外部 API 呼び出し」の境界が見える
- `src/` のメリット(整理感、規約統一)は MVP 段階では薄い
- `hooks/` 等を最初から切るのは YAGNI、必要になってから切り出す

**`components/` と `lib/` の責務分界**:

- `components/`: UI コンポーネント
- `lib/`: それ以外(DB 基盤、認証、DAL、外部連携、ドメインルール、入力検証スキーマ、ユーティリティ)

**`lib/integrations/<service>/` の内部構造**:

- 各サービスは単一ファイル(`lib/integrations/stripe.ts` 等)で始める
- 肥大化したらディレクトリに昇格(`lib/integrations/stripe/` + サブファイル)
- ADR-3 / ADR-4 で確立した昇格パターン(専用 → 隣、共有 → 上位、肥大化 → 切り出し)を踏襲

**昇格・見直し条件**:

- `lib/` 直下が肥大化したら `lib/<domain>/` への切り出しを進める(ADR-4 参照)
- 外部サービス連携が複雑化したら `lib/integrations/<service>/` をディレクトリに昇格
- 開発者が増えてルート直下の見通しが悪化したら `src/` 移行を検討

---

## 4. ADR-3: コンポーネントの共通化

UI コンポーネントは利用範囲に応じて 3 段階に配置する。1 page でしか使わないものは page の隣、1 つの Route Group 内で複数 page から使うものは `(group)/_components/`、複数 Route Group から使うものはトップレベル `components/` に置く。

**ディレクトリ構造**:

```
app/
  (student)/
    _components/                  # (student) 内の複数 page で共有
      AssignmentCard.tsx
    assignments/
      page.tsx
      AssignmentForm.tsx          # この page でしか使わない
  (admin)/
    _components/
      UserTable.tsx
components/                       # 複数 Route Group から使う
  Button.tsx
  Header.tsx
```

**実装イメージ**:

```tsx
// app/(student)/assignments/page.tsx
import { AssignmentCard } from "../_components/AssignmentCard"  // (student) 内共有
import { AssignmentForm } from "./AssignmentForm"               // page 専用
import { Button } from "@/components/Button"                    // 横断

export default function Page() {
  return (
    <>
      <AssignmentCard />
      <AssignmentForm />
      <Button>Submit</Button>
    </>
  )
}
```

**昇格ルール**:

- 1 page でしか使わない → page の隣にコロケーション
- 1 つの Route Group 内の複数 page で使う → `app/(group)/_components/`
- 複数 Route Group から使う → トップレベル `components/`

**対案**:

| 方針 | メリット | デメリット |
|---|---|---|
| 専用も横断もすべてトップレベル `components/` に集約 | 配置ルールが 1 つ / import 元が 1 箇所 | 規模が大きくなると肥大化 / 専用と横断が命名でしか区別できない |
| すべての共有コンポーネントを `components/` に置き Route Group 内 `_components/` を使わない | 単一ルール「共有 = `components/`」 | `(admin)` 専用の共通も上に上がりノイズ / Route Group 境界が UI で表現できない |
| ドメイン単位(`components/assignments/` 等)で分ける | ドメインで整理されて拡張時に迷わない | 横断ドメインの置き場が曖昧 / 最初から細分化すると空フォルダ |
| **3 段階配置(採用)** | 使用範囲と物理位置が一致 / Route Group 境界が UI でも有効 / 認可レビューしやすい | ルールが 3 つあり判断が要る |

**選んだ理由**:

- 「使われる範囲」と「物理位置」を一致させるのが構造として最も読みやすい
- `(admin)/_components/UserTable.tsx` を見れば admin 以外から import されない前提だと一目で分かる
- `_` プレフィックスは Next.js のプライベートフォルダ規約([公式ドキュメント](https://nextjs.org/docs/app/getting-started/project-structure))で routing 対象外、UI 専用置き場として安全
- Route Group 境界が UI レベルでも有効である方が、認可レビューや影響範囲の把握に効く

**昇格・見直し条件**:

- 専用で書いたコンポーネントが複数 page から使われ始めたら、`_components/` または `components/` へ昇格
- 昇格時はコンポーネントの抽象度を見直す。同名でも実態が違うなら、昇格させずコピペする選択もあり
- 規模が拡大して `components/` 直下が肥大化したら、ドメイン単位のサブディレクトリ化を検討

---

## 5. ADR-4: BE 処理は DB + Auth + DAL + ドメインルール + Server Actions の層構成にする

BE 処理(データの読み書き・認可・ドメインルール・ユースケースの実行)を以下の層で構成する。**Server Actions** が外部エントリポイントとなり、**DAL (Data Access Layer)** が `lib/db/` と `lib/auth/` を組み合わせて認可付きデータアクセスを提供する。**ドメインルール** が業務制約を純粋関数として保持する。

**用語定義**:

- **DAL (Data Access Layer)**: 認可付きデータアクセスを提供する server-only な層
- `lib/db/` と `lib/auth/` を組み合わせて、データ取得・変更の関数を提供
- すべての関数の入口で `verifySession` を呼び、認可チェックを行う
- `"server-only"` directive で client からの import を防ぐ
- Next.js 公式が新規プロジェクトに対して推奨するアプローチ
  - 根拠: [How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions), [Guides: Data Security](https://nextjs.org/docs/app/guides/data-security)

**前提技術**:

- ORM は Drizzle を採用(詳細は別 spec)
- 認証プロバイダは別 spec で選定(本 spec では `lib/auth/session.ts` の責務のみ定義)

**ディレクトリ構造**:

```
lib/
  db/                           # Drizzle 基盤(server-only)
    index.ts                    # Drizzle client(export const db)
    schema.ts                   # Drizzle schema(テーブル定義)
  auth/                         # 認証基盤(server-only)
    session.ts                  # verifySession(認証 + 退会者ブロック)
  dal/                          # 認可付きデータアクセス(server-only)
    assignments.ts              # assignment の読み書き(認可チェック込み)
    users.ts                    # user の読み書き(認可チェック込み)
  <domain>/                     # ドメイン固有のロジック
    rules.ts                    # ドメインルール(純粋関数)
    schema.ts                   # Zod スキーマ(入力検証)
app/
  (student)/assignments/
    page.tsx                    # Server Component(DAL から読む)
    actions.ts                  # Server Actions(オーケストレーション)
```

**実装イメージ**:

```ts
// lib/db/index.ts
import "server-only"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

const queryClient = postgres(process.env.DATABASE_URL!)
export const db = drizzle(queryClient, { schema })
```

```ts
// lib/db/schema.ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core"

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  content: text("content").notNull(),
  deadline: timestamp("deadline").notNull(),
  submittedAt: timestamp("submitted_at"),
})
// 他のテーブル定義...
```

```ts
// lib/auth/session.ts
import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"

// 認証 + 退会者ブロックを 1 箇所に集約
// DAL の各関数からこの関数を呼べば、退会者は自動的に弾かれる
export const verifySession = cache(async () => {
  const session = await getSessionFromCookie()  // 認証プロバイダ依存(別 spec)
  if (!session) redirect("/login")
  // 退会者 / 休会者は session レベルで弾く(各 DAL 関数で重複させない)
  if (session.status === "resigned") redirect("/resigned")
  return {
    userId: session.userId,
    role: session.role,
    status: session.status,
  }
})
```

```ts
// lib/dal/assignments.ts
import "server-only"
import { cache } from "react"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { assignments } from "@/lib/db/schema"
import { verifySession } from "@/lib/auth/session"

export const getAssignment = cache(async (id: string) => {
  const session = await verifySession()
  const [assignment] = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id))
    .limit(1)
  if (!assignment) return null
  // 認可: 受講生は自分の課題のみ、運営は全件アクセス可
  if (session.role === "student" && assignment.userId !== session.userId) {
    throw new Error("Forbidden")
  }
  return assignment
})

export async function submitAssignment(input: { id: string; content: string }) {
  const session = await verifySession()
  // 認可は getAssignment 内で実行される
  const assignment = await getAssignment(input.id)
  if (!assignment) throw new Error("Not found")
  await db
    .update(assignments)
    .set({ content: input.content, submittedAt: new Date() })
    .where(eq(assignments.id, input.id))
}
```

```ts
// lib/assignments/rules.ts (純粋関数、副作用なし)
export function isOverdue(assignment: { deadline: Date }): boolean {
  return assignment.deadline < new Date()
}

export function isAlreadySubmitted(assignment: { submittedAt: Date | null }): boolean {
  return assignment.submittedAt !== null
}
```

```ts
// lib/assignments/schema.ts
import { z } from "zod"

export const submitAssignmentSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1).max(10000),
})

export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>
```

```ts
// app/(student)/assignments/actions.ts (Server Actions = オーケストレーション)
"use server"
import { submitAssignmentSchema, type SubmitAssignmentInput } from "@/lib/assignments/schema"
import { isOverdue, isAlreadySubmitted } from "@/lib/assignments/rules"
import { getAssignment, submitAssignment } from "@/lib/dal/assignments"

// 型付き引数の Server Action(JS 有効時の通常呼び出し)
export async function submitAssignmentAction(input: SubmitAssignmentInput) {
  const validated = submitAssignmentSchema.parse(input)
  const assignment = await getAssignment(validated.id)  // 認可は DAL 内で実行
  if (!assignment) throw new Error("Not found")
  if (isOverdue(assignment)) throw new Error("期限切れ")
  if (isAlreadySubmitted(assignment)) throw new Error("既に提出済み")
  await submitAssignment(validated)
}
```

```tsx
// app/(student)/assignments/page.tsx (Server Component で直接 DAL を呼ぶ)
import { listMyAssignments } from "@/lib/dal/assignments"

export default async function Page() {
  const assignments = await listMyAssignments()
  return <AssignmentList items={assignments} />
}
```

**責務分界**:

- Server Components (`page.tsx`): UI レンダリング、DAL からデータを読み取って渡す
- Server Actions (`actions.ts`): オーケストレーション(入力検証 + ルールチェック + DAL 呼び出し)
- DAL (`lib/dal/`): 認可付きデータアクセス。`lib/db/` と `lib/auth/` を組み合わせる。`"server-only"` 明示
- 認証基盤 (`lib/auth/`): 認証プロバイダのラッパー + 退会者ブロック。`"server-only"` 明示
- DB 基盤 (`lib/db/`): Drizzle client と schema 定義。認可・ビジネスロジックを含まない。`"server-only"` 明示
- ドメインルール (`lib/<domain>/rules.ts`): 業務制約(期限・状態遷移等)、純粋関数
- 入力スキーマ (`lib/<domain>/schema.ts`): Zod での入力検証、`z.infer` で型を導出

**対案**:

| 方針 | メリット | デメリット |
|---|---|---|
| Server Actions に全部書く(DAL・ルール・スキーマを分けない) | ファイル数が最小 / 薄いコードでは読みやすい | 認可漏れリスク(各 action で個別記述) / ドメインルールが複数 action に重複 / テストが書きにくい |
| DAL を導入せず Service 層(`lib/<domain>/service.ts`)に集約 | ドメイン単位で全責務が揃う / DDD 的に整理しやすい | Next.js 公式が推奨する DAL パターンから外れる / 認可とドメインロジックが同居して責務が混ざる |
| 厳密なオニオン(domain / application / infrastructure を物理レイヤー分け) | テスタビリティ最高 / 依存方向が完全に統制される | MVP には過剰 / ファイル数が大幅増 / Server Components 直書きと相性が悪い |
| 認可を middleware に集約 | 認可ロジックが 1 箇所に集まる | CVE-2025-29927 で middleware は迂回されうる / ORM の Edge runtime 制約 / 本物の認可境界として信頼できない |
| **DB + Auth + DAL + ドメインルール + Server Actions(採用)** | 公式推奨パターン / 各層の責務が物理的に分離 / 認可漏れリスクを構造的に下げる / ドメインルールのテストが書きやすい | レイヤー判断が必要 / DAL という用語の学習コスト |

**選んだ理由**:

- Next.js 公式が明確に推奨する DAL パターンに準拠する
- 認可を DAL に集約することで「データを取る関数 = 認可をする関数」となり、認可漏れリスクが構造的に下がる
- 退会者ブロック(本アプリの中核課題)が `verifySession` の中で 1 箇所に集約され、各 DAL 関数で重複させずに済む
- `lib/db/` `lib/auth/` `lib/dal/` を分けることで、Next.js 公式コード例の import パスがそのまま使える
- Server Actions を薄いオーケストレーション層に保てる
- ドメインルールを純粋関数として分離することで、業務制約のテストが書きやすい
- オニオン的な厳密レイヤリングは MVP には過剰、Server Components 直書きという App Router の流儀とも衝突する

**データ取得は Server Components で直書き**:

- 読み取りロジックは Server Component 内で DAL を呼ぶ
- 共有が必要な読み取りは DAL に集約されるため、別途 `queries.ts` のような層は設けない
- 「データを取る経路は DAL のみ」というシンプルな構造が保てる

**Server Actions は public API として扱う**:

- Next.js 公式([directives: use server](https://nextjs.org/docs/app/api-reference/directives/use-server))が明記する通り、Server Actions は公開 API エンドポイントと同等のセキュリティ考慮が必要
- 本 spec では DAL での認可チェックがこれを担保する
- Server Actions の呼び出し形式は型付き引数を基本とし、フォームから直接呼ぶ場合のみ `formData` を受け取る(プログレッシブエンハンスメント用)

**Route Handlers の扱い**:

- webhook / OAuth callback / Cron 等、Server Actions で表現できない用途に限定し、`app/api/` に集約
- **webhook は session を持たないため、DAL の認可前提が成立しない**(session ベースの認可チェックが動かない)
- webhook 用には以下のいずれかの設計を別 spec で確定する:
  - signature 検証後に「system 権限」として DAL を呼ぶ
  - 認可不要な専用関数(`lib/integrations/<service>/` 内)を呼ぶ
- 冪等性確保(event id でロック)・リトライ戦略は外部連携 spec で扱う

**昇格・見直し条件**:

- `actions.ts` 内のドメインルールが薄ければそのまま記述、複雑化したら `lib/<domain>/rules.ts` に切り出す
- `lib/<domain>/` のファイル数が増えてきたら、`rules.ts` を `rules/` ディレクトリに分割する
- 認証プロバイダの選定(別 spec)で `lib/auth/session.ts` の中身が具体化される
- 退会者ブロックのルール(本アプリの中核課題)の詳細は認可 spec で決定

---

## 6. ADR-5: 補助系(型・スタイル・パス alias・lint/format)

補助的な決定事項を以下に定める。

**型**:

- アンビエント型(`.d.ts`)のみトップレベル `types/` に置く
- ドメイン型は使う場所にコロケーション(`lib/<domain>/schema.ts` から `z.infer` で導出する等)
- `types/` ディレクトリは必要になってから作る(空ディレクトリは作らない)
- 根拠: `.d.ts` は「使う場所の近く」という発想が合わない(グローバル宣言・ライブラリ拡張)ため隔離が自然。ドメイン型は実装と密結合するためコロケーション

**スタイル**:

- Tailwind CSS を採用
- `app/globals.css` に Tailwind directives と最小限のグローバルスタイル
- `tailwind.config.ts` と `postcss.config.js` はルート直下
- 根拠: `create-next-app --tailwind` が生成するデフォルト構造と一致。コミュニティ標準と整合
- デザインシステム・テーマ設計は別 spec(フロントエンド設計 spec)で扱う

**パス alias**:

- `@/*` 一本のみ設定(`tsconfig.json` の `paths` で `{ "@/*": ["./*"] }`)
- ディレクトリごとに細かく分けない
- 根拠: Next.js + `create-next-app` のデフォルトと一致。Next.js 公式コード例(`import { db } from "@/lib/db"` 等)もこの alias 前提

**lint / format**:

- Biome を採用(formatter + linter を 1 ツールで担う)
- Prettier / ESLint は使わない
- 設定ファイルは `biome.json` をルート直下に配置
- 根拠:
  - 設定ファイルが 1 つで済み、4 人開発の認知負荷が低い
  - Rust 製で高速、CI 時間に効く
  - Next.js 標準の `eslint-config-next` を捨てることになるが、本 spec のコーディング原則は人間レビューで担保する方針なので問題にならない
- 注意点:
  - `eslint-plugin-boundaries` のような依存方向の lint 強制は使えないため、コーディング原則(後述)で守る
  - Next.js 固有の lint ルール(`@next/eslint-plugin-next`)は適用されないため、Core Web Vitals 関連の警告は Vercel 側の Analytics で検知する
  - `<img>` / `<a href>` のチェックは lint で強制されないため、コーディング原則で人間が守る

---

## 7. コーディング原則

リポジトリ構造を維持するために守るルール。lint で強制せず、人間レビューで担保する。

**構造の規律**:

- Route Group の境界を超えた import を避ける。`(student)` から `(admin)/_components/` の import は禁止。両方から使うものはトップレベル `components/` に昇格させる
- `_components/` `_lib/` の `_` プレフィックスは Next.js のプライベートフォルダ規約(routing 対象外)として尊重する。命名で代用しない
- ページ専用のコンポーネント・Server Actions は page の隣にコロケーション。複数 page で共有されたら `(group)/_components/` または `lib/` へ昇格
- コンポーネント昇格時は抽象度を見直す。同名でも実態が違うなら昇格させずコピペする選択もあり
- `lib/` 直下に新規ファイルを置く前に、`lib/db/` `lib/auth/` `lib/dal/` `lib/integrations/` `lib/<domain>/` のいずれかへの分類を検討する。雑多な `lib/utils.ts` 等を作らない
- テストファイルはソースファイルの隣に `*.test.ts` でコロケーションする

**BE 処理の規律**:

- データ取得は Server Component 内で DAL を呼ぶ。`queries.ts` のような中間層は作らず、共有読み取りは DAL に集約する
- データ変更は Server Actions で実装し、DAL を経由する。Route Handlers は外部 webhook / OAuth コールバック / Cron 等、Server Actions で表現できない用途に限定する
- `lib/db/` `lib/auth/` `lib/dal/` `lib/integrations/` 以下のファイルは必ず `import "server-only"` を冒頭に置く。Client Component から誤って import するとビルドエラーになる
- 依存方向を守る。`lib/dal/` は `lib/db/` と `lib/auth/` に依存してよいが、逆方向の依存(`lib/db/` から `lib/dal/` を呼ぶ等)は禁止
- ドメインルール(`lib/<domain>/rules.ts`)は純粋関数として書く。DB アクセス・認証・副作用を含めない
- DAL 内では React の `cache()` のみ使用してよい(同一リクエスト内 dedup)。`unstable_cache` / `"use cache"` directive で認可情報を含むデータをキャッシュしてはいけない(リクエスト跨ぎで別 session の認可情報が混ざるため)

**Next.js 固有の規律**(Biome では検知されないため人間レビューで守る):

- 画像は `next/image` の `<Image>` を使う。`<img>` を直接書かない
- 内部リンクは `next/link` の `<Link>` を使う。`<a href>` で内部遷移を書かない

---

## 8. monorepo 分離の計画条件

ADR-1 の「単一 Next.js アプリ」決定を覆して monorepo + apps 分割に移行する判断基準。

**移行を検討するトリガ**:

- admin と student で独立した deploy サイクルが必要になった時
- admin と student で大きく異なる依存ライブラリ群を持つようになった時
- 開発者が増え、admin / student で完全に分業する体制になった時
- admin だけ別の認証基盤・別の Vercel project にしたい要件が出た時

**移行先の想定構成**:

```
praha-agile/
├── apps/
│   ├── web/        # 受講生向け(現 (student) + (public))
│   └── admin/      # 運営向け(現 (admin))
├── packages/
│   ├── ui/         # 共通 UI(現 components/)
│   ├── db/         # Drizzle 基盤(現 lib/db/)
│   ├── auth/       # 認証基盤(現 lib/auth/)
│   ├── dal/        # DAL(現 lib/dal/)
│   ├── integrations/ # 外部連携(現 lib/integrations/)
│   ├── domain/     # ドメインルール・スキーマ(現 lib/<domain>/)
│   └── config/     # 共通設定
└── ...
```

**移行時に必要な作業**:

- pnpm workspaces または Turborepo の導入
- `lib/db/` を `packages/db/` へ切り出し
- `lib/auth/` を `packages/auth/` へ切り出し
- `lib/dal/` を `packages/dal/` へ切り出し
- `lib/integrations/` を `packages/integrations/` へ切り出し
- `lib/<domain>/` を `packages/domain/` へ切り出し
- `components/` を `packages/ui/` へ切り出し
- Vercel project を 2 つに分け、それぞれの root directory を設定
- インフラ spec の CI/CD workflow を 2 アプリ対応に書き換える

**移行しない判断もありうる**:

- 上記トリガが発生しても、Route Groups と DAL で十分に分離できる場合は移行しない
- monorepo は構造の独立性を上げるが、共通コードのバージョン管理や CI のキャッシュ戦略といった別のコストを生む

**将来の構造検査強化(参考)**:

- Route Group 境界の自動検査(`grep` ベースの簡易スクリプトを CI に組み込む等)は将来の選択肢として残す
- MVP 期間中は人間レビューで担保する

---

## 9. 対象外

本 spec では決定しない。

- **コード規約の詳細**(命名規則、import 順序、`"use client"` `"use server"` の使い分けの詳細ルール、エラーハンドリング方針、TypeScript の strict 設定、Biome のルールセット詳細) → 別 spec または README
- **開発フロー**(ブランチ運用、PR テンプレ、commit 規約、CODEOWNERS) → 別 spec(インフラ spec で merge 方式のみ決定済み)
- **テスト戦略の詳細**(どのレイヤーをテストするか、モック方針、カバレッジ目標等) → 別 spec。本 spec では「Vitest、コロケーション、`*.test.ts`、E2E なし」のみ決定
- **Suspense / Streaming パターンの使い分け**(`loading.tsx` / `error.tsx` / 並列データフェッチ等) → 別 spec
- **デザインシステム・テーマ設計**(デザイントークン、ダークモード、コンポーネントライブラリの選定) → フロントエンド設計 spec
- **認証プロバイダの選定**(Clerk / Auth.js / Auth0 等) → 別 spec。本 spec では `lib/auth/session.ts` の責務(認証 + 退会者ブロック)のみ定義
- **DB スキーマ設計**(テーブル定義、リレーション、migration 戦略) → 別 spec。本 spec では Drizzle を採用すること、および `lib/db/schema.ts` の配置のみ定義
- **認可モデルの詳細**(role / status / 退会者ブロックの具体的なルール) → 別 spec。本 spec では DAL が認可を担うことと、`verifySession` で status チェックを集約することのみ決定
- **外部連携の詳細設計**(Stripe webhook の signature 検証手順 / 冪等性確保 / リトライ戦略 / Slack 通知の送信タイミング / Notion OAuth フロー等) → 外部連携 spec。本 spec では `lib/integrations/<service>/` を配置することのみ決定
- **監視・ログ設計** → 別 spec
- **依存パッケージのバージョン管理戦略**(Biome を含むツール群の版固定・アップグレード方針) → 別 spec
