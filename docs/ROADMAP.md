# ROADMAP

このリポジトリの「どこまでが土台として固まっているか」「どこから先は機能担当が裁量で決めるか」を分離するためのドキュメント。

- **進んだ (= push 済み)** に挙げる項目は、開発者が前提として使ってよい。再議論せずに乗っかる。
- **未確定 (= 機能担当が裁量で決める)** に挙げる項目は、各機能担当が必要になったタイミングで判断する。各項目に「現状の暫定方針」を 1-2 文で記載しているが、これは拘束ではなく出発点。変える判断もアリ。

## 方針メモ (この時点での設計スタンス)

機能要件が未定の段階で具体的な技術選定 / domain 仮定を baseline に押し込むと、後から剥がすコストが高い (進んだ項目は「再議論せず乗っかる」と宣言したものなので)。本ブランチは **framework-level の skeleton (monorepo / Next.js / TypeScript / Tailwind / Drizzle scaffold / CI) のみ** を「進んだ」とし、**domain を含む決定 (最初の table、認証戦略、role の有無、error UI、2-app split の妥当性 etc.) はすべて「未確定」** に置いた。

## 進んだ (push 済み)

- **monorepo セットアップ**: Turborepo + pnpm catalog + Biome、Node 22.22.2 / pnpm 9.15.0 をファイル固定 (`.nvmrc` / `.tool-versions` / `package.json#engines` + `package.json#packageManager` + Corepack)。
- **packages/db (Drizzle scaffold)**: drizzle-orm + drizzle-kit 0.31.10 + Postgres 18 ローカル (`compose.yml`)、`pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` のワークフロー。`packages/db/src/schema.ts` は **空** (最初の table は機能担当が定義する)。
- **2 アプリの最小ガワ**: Next.js 16.2.6 + React 19.2.4 + Tailwind v4、`app/layout.tsx` / `app/page.tsx` / `app/globals.css` のみ。`(authed)` グループ / `login/` / `error.tsx` / `global-error.tsx` / `app/api/` は置いていない (機能要件確定後に追加する)。
- **DAL 層の置き場 (空)**: `apps/{name}/data/` ディレクトリ自体は確保 (`.gitkeep`)。最初の data 関数は機能担当が `apps/{name}/data/<entity>.ts` に書く。AGENTS.md の DAL ルール (server-only / 認可ロジックは data/ 内で完結) は前提として効いている。
- **AI agent / 開発者向けルール**: ルート [AGENTS.md](../AGENTS.md) に Next.js 16 の破壊的変更ガイド + DAL 層の置き場ルール。
- **CI**: GitHub Actions ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) で push (main) と PR に対して `typecheck` / `lint` / `test` を matrix で並列実行。第三者 actions は full commit SHA で pin、`permissions: contents: read` / `persist-credentials: false` / `--frozen-lockfile` でセキュリティを担保。main は走り切らせ、それ以外は新しい push でキャンセル。

## 未確定 (機能担当が裁量で決める)

### 1. 最初の Drizzle schema (どんな entity から始めるか)

`packages/db/src/schema.ts` は空。最初の table を定義するタイミングで domain が固まる。

**現状の暫定方針**: ない。「ユーザ」「ロール」「課題」「セッション」など、いずれの table が最初に来るかは要件次第。Drizzle scaffold + Postgres 18 ローカル + migration ワークフローは整っているので、`pnpm db:generate` → `pnpm db:migrate` の流れに乗ればよい。

### 2. 認証ライブラリ選定と verifySession の実装

現状 `data/auth.ts` は **存在しない**。`(authed)` ルーティング / `login/` ページ / `Session` 型もすべて未配置。

**現状の暫定方針**: 認証ライブラリ (Auth0 / Lucia / next-auth など) 未選定。実装時は `apps/{name}/data/auth.ts` を新規追加し、`verifySession()` を `cache()` で wrap した上で各 data 関数の冒頭で呼ぶ DAL-only パターンに従う (Next.js 16 公式が「layout で auth check しない」と明記しているため、`(authed)/layout.tsx` で role check するパターンは採用しない)。`proxy.ts` (旧 middleware) も作らない。

### 3. error 境界 (error.tsx / global-error.tsx) の戦略

現状、両アプリとも error 境界ファイル未配置。Next.js のデフォルト error UI が表示される。

**現状の暫定方針**: ない。本番運用前に最低 1 つは error.tsx を置く想定だが、retry UI / digest 露出 / ログ送信先などの方針は要件次第。Next 16 では `unstable_retry: () => void` prop が利用可能 (v16.2.0 で追加、`reset` より推奨)。

### 4. 2-app split (apps/student と apps/admin) の妥当性

現状 2 つの Next.js アプリに分けてあるが、これ自体「異なる audience に別々の UI と routing を提供する」という domain 仮定。

**現状の暫定方針**: 維持。1 つの app に role-based routing で統合する案もあり得るが、開発開始時点では分けたまま進める。auth 実装 + role モデル確定後に再判断する余地あり。

### 5. 共通 UI コンポーネントの置き場

現状 `packages/ui` は存在せず、shadcn 等の共通基盤もない。

**現状の暫定方針**: 各アプリで必要なコンポーネントは `apps/{name}/components/` に直接書く。両アプリで重複が出始めたら `packages/ui` を新設するか、コピペで許容するかを判断する。

### 6. Tailwind v4 のデザイントークン定義方針

現状 `app/globals.css` は `@import "tailwindcss";` のみ。

**現状の暫定方針**: semantic token (`--color-bg` / `--color-accent` 等) は定義しておらず、Tailwind デフォルトトークン (`slate-900`, `blue-600`, ...) を直接使う前提。デザインが固まってきたら `@theme {}` で semantic token を定義する。

### 7. フォーム / バリデーションライブラリ

**現状の暫定方針**: catalog から外してある (`zod` は未登録)。Server Action の入力検証で `zod` を使うか、React Hook Form / Conform / `useActionState` パターンで済ますかは、最初の form を書く担当が決める。

### 8. テスト戦略

**現状の暫定方針**: `vitest` は catalog にあり、`pnpm test` で各 workspace の `vitest run` が走る配線済み。単体テストの粒度、E2E (Playwright 等)、統合テスト (DB を含むテスト) の方針は未決。

### 9. キャッシュ戦略

Next.js 16 のキャッシュ API は `revalidatePath` / `revalidateTag(tag, profile)` / `updateTag(tag)` の 3 種。

**現状の暫定方針**: 機能実装が始まるまで判断材料がない。AGENTS.md のガイド (押した直後に画面に反映したい mutation は `updateTag`、裏での再生成でよいなら `revalidateTag(tag, "max")`) を出発点に、機能ごとに選ぶ。

### 10. ロギング戦略

**現状の暫定方針**: 構造化ロガー (`pino` 等) は未導入。`console.log` / `console.error` を使う。本番運用前に置き換えるかどうかは未確定。

### 11. error handling パターン

**現状の暫定方針**: ドメイン違反は `throw new Error(...)` で投げる単純パターン。`neverthrow` / `ts-pattern` は採用していない。Server Action の戻り値で `{ ok: false, error: ... }` を返すパターンも一部選択肢として残る。`error.tsx` boundary を置くかは #3 と連動。

### 12. API Routes (app/api/) の使用方針

現状 `app/api/` 自体を置いていない。

**現状の暫定方針**: Server Action でほぼカバーする想定。Stripe webhook / Cron / 外部システムからの POST など、URL を晒す必要が出た時に `apps/{name}/app/api/` を新設する。Route Handler は layout の auth ガードが効かない (layout は Server Component レンダリングフェーズで動き、Route Handler は HTTP を直接受け取る) ので、ハンドラ冒頭で auth 関数を必ず呼ぶ。

### 13. model 層の採用判断

ドメインルール / DTO 変換 / Zod 入力検証 schema の置き場。

**現状の暫定方針**: `model/` 層は切っていない。データの形は `packages/db` の Drizzle schema に直接寄せ、入力検証は必要箇所で都度書く想定。機能担当が「`actions.ts` が分厚くなった」「ドメインルールを Server / Client 両方から呼びたい」と感じたら `apps/{name}/model/` を新設するか、別の場所 (例: `actions.ts` 内 inline) に置くかを決める。
