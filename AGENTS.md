<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# data 層の置き場

両アプリ (`apps/student`, `apps/admin`) で **DB アクセスと認可は `apps/{name}/data/`** に集約する。Next.js 公式の DAL (Data Access Layer) パターンに従う。

- ファイル冒頭に `import "server-only"` を必ず書く (Client bundle への混入を防ぐ)
- 認可・認証ロジックは `data/` 内で完結させる (page / `app/<route>/actions.ts` / `layout.tsx` に書かない)
  - 認証が実装される時は `data/auth.ts` の `verifySession()` を各 data 関数の冒頭で呼ぶ前提
  - Next.js 16 公式は「layout は navigation で再レンダリングされず session が検証されないので、layout で auth check しない」と明記 (DAL-only)
- `react` の `cache()` で wrap する場合、引数はプリミティブのみ (オブジェクトリテラルは参照比較で memo が効かない)
- Route Groups (例: `(authed)`) は URL を変えずに layout を整理する用途のみ。auth boundary としては使わない (Next.js 16 公式 `01-app/03-api-reference/03-file-conventions/route-groups.md` の use cases に auth boundary は含まれず、`01-app/02-guides/authentication.md` も layout での auth check を非推奨)。認可は `data/` の `verifySession()` で担保する

`data/` を超えるレイヤー (`model/`, `app/<route>/actions.ts` の薄さ、DTO 変換、ドメイン不変条件の置き場、認証ライブラリ選定、最初の schema) は Next.jsでは明確に指示はされていない。
