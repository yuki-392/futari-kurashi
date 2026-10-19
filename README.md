# ふたりの暮らし（Futari Kurashi）

**家事も、お金も、ふたりで。**

同棲カップル2人向けの生活管理PWAです。現在は環境構築まで完了しており、ログイン・世帯共有・各管理機能はこれから実装します。

## 開発を始める

Node.js **24 LTS**、npm、Gitを使用します。nvmを使用している場合:

```sh
nvm use
npm ci
npm run dev
```

初回にNode.js 24がない場合は`nvm install`を実行してください。開発サーバーのURLは通常 [http://localhost:5173](http://localhost:5173) です。Firebaseを設定しなくても確認画面を開けます。

同じWi-FiのiPhoneから確認する場合は、Viteが表示する`Network`のURLを使ってください。HTTPのLANアクセスは画面確認用です。PWAのインストールやService Workerの実機確認はHTTPSでの公開後に行います。

### Firebaseを設定する

```sh
cp .env.example .env.local
```

Firebase ConsoleのWebアプリ設定を`.env.local`に入力し、開発サーバーを再起動します。詳細は [Firebaseセットアップ](./docs/firebase-setup.md) を参照してください。Firebase CLIは開発依存に含まれているため、グローバルインストールは不要です。

確認画面の「Firebase設定済み」は設定値が揃ったことを意味します。クラウドへの接続・認証の成功を検証する表示ではありません。

## コマンド

| コマンド                     | 内容                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `npm run dev`                | 開発サーバー                                               |
| `npm run dev:emulator`       | ローカルEmulator用設定で開発サーバー                       |
| `npm run typecheck`          | TypeScriptの型チェック                                     |
| `npm run lint`               | ESLint                                                     |
| `npm run format`             | Prettierで整形                                             |
| `npm run format:check`       | 整形チェック                                               |
| `npm test`                   | Vitestを1回実行                                            |
| `npm run test:watch`         | テストを監視実行                                           |
| `npm run build`              | 型チェック＋本番ビルド。`dist/`へ出力                      |
| `npm run preview`            | ビルドしたPWAをローカル確認                                |
| `npm run check`              | Lint・整形・テスト・本番ビルドをまとめて実行               |
| `npm run firebase -- <引数>` | リポジトリ内のFirebase CLI                                 |
| `npm run emulators`          | Auth・Firestore・Hosting Emulator（別途Java 21以上が必要） |

PWAは通常の開発サーバーでは有効にしていません。`npm run build`後に`npm run preview`を実行し、[http://localhost:4173](http://localhost:4173) でmanifestとService Workerを確認します。

## ディレクトリ

```text
src/
  app/                 アプリの構成と起動確認画面
  components/          共通UI・PWA更新通知
  lib/firebase/        設定検証・Auth / Firestoreの遅延初期化
  main.tsx             エントリーポイント
  styles.css           Tailwind CSS・共通スタイル
public/                PWA用アイコン
scripts/               アイコン再生成ツール
docs/                  仕様・設計・手順・開発計画
.github/workflows/     CI
```

今後の各機能は`src/features/<feature>/`に追加します。アイコンの再生成は`python3 scripts/generate-icons.py`で実行できます（アプリの実行にPythonは不要）。

## ドキュメント

- [製品仕様](./docs/product-spec.md): 提供いただいた企画・要件の全体
- [開発計画](./docs/roadmap.md): 実装状況・次の作業
- [設計方針](./docs/architecture.md): アプリ構成・データ・セキュリティ・PWA
- [Firebaseセットアップ](./docs/firebase-setup.md): Console・環境変数・Emulator・公開
- [Codex向けガイド](./AGENTS.md): 次回作業時の参照順と開発ルール

GitHub Actionsは`npm ci`と`npm run check`を実行します。ローカルGitは初期化済みですが、GitHub Privateリポジトリの作成・remoteの設定・push・Firebaseへの公開はまだ実施していません。
