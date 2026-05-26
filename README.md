# praha-agile
疑似アジャイル開発課題用のリポジトリ

## インストール(Node.js, pnpm)

```bash
brew install mise

echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc

mise trust          
mise install 
```

```bash
corepack enable
```

> [asdf](https://asdf-vm.com/)を使う場合
>
> ```bash
> asdf plugin add nodejs
> asdf plugin add pnpm
> asdf install
> ```

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
