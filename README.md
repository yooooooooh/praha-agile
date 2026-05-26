# praha-agile
疑似アジャイル開発課題用のリポジトリ

## 前提

- **Node.js 22.22.2**
- **pnpm 9.15.0**

- pnpm のバージョンは [`package.json`](package.json) の `packageManager: "pnpm@9.15.0"` と [Corepack](https://nodejs.org/api/corepack.html) によって強制されます (`corepack enable` 済みなら自動で 9.15.0 が使われる)。
- Node のバージョンは [`.tool-versions`](.tool-versions) / [`package.json`](package.json) の `engines.node` で揃えています。


## インストール

### 1. Node.js — mise でディレクトリ移動時に自動切替

```bash
# インストール（macOS）
brew install mise

# シェル設定（~/.zshrc に追記、bash なら ~/.bashrc）
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc

# このリポジトリでの初回設定
cd /path/to/praha-agile-test
mise trust          # .tool-versions の読み込みを許可（mise のセキュリティ仕様）
mise install        # .tool-versions を読んで Node 22.22.2 を自動取得
```

> **mise 以外を使う場合**:
> - [fnm](https://github.com/Schniz/fnm)
> - [nvm](https://github.com/nvm-sh/nvm)
> - [Volta](https://volta.sh/)

### 2. pnpm — Corepack

```bash
corepack enable
```

## セットアップ

```bash
pnpm install
cp packages/db/.env.example packages/db/.env
docker compose up -d          # Postgres 18 を 5432 で起動
pnpm dev                      # student=:3000, admin=:3001
```

- 学生用: http://localhost:3000
- 管理者用: http://localhost:3001


## スクリプト

- `pnpm dev` / `pnpm build`
- `pnpm lint` / `pnpm lint:fix` / `pnpm format`
- `pnpm typecheck` / `pnpm test`
- `pnpm db:generate`
- `pnpm db:migrate`（生成済み migration を DB に適用。dev/CI/本番で共通）
