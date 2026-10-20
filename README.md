# ふたりの暮らし（Futari Kurashi）

**家事も、お金も、ふたりで。**

同棲カップル2人向けの生活管理PWAです。Phase 1・項目1のPWA対応は、iPhone 16 / iOS 26.2での実機検証まで完了しました。Phase 1・項目2の認証機能も、実装・自動検証・検証公開・一連の実機確認まで完了しました。世帯作成・招待・参加は検証用公開済みで、2026-10-20にiPhone＋Mac／Chrome・テスト用2アカウントでの共有確認まで完了しました。ホーム・6画面のナビゲーションも2026-10-20にiPhoneの本人確認まで完了しました。ToDoも2026-10-20にiPhone＋Macの全確認手順が成功し、完了しました。繰り返し家事や買い物などはこれから実装します。

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
| `npm run test:pwa`           | ChromiumでSW・オフライン・新旧ビルドの更新を検証           |
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
- [実装記録](./docs/implementation-log/README.md): 各作業の目的・判断理由・検証結果・指摘と対応
- [認証の検証手順](./docs/auth-verification.md): Auth Emulator・メール確認・実機の認証維持と再設定
- [PWAの検証手順](./docs/pwa-verification.md): PCでの再現・検証用公開・iPhoneでの確認
- [設計方針](./docs/architecture.md): アプリ構成・データ・セキュリティ・PWA
- [Firebaseセットアップ](./docs/firebase-setup.md): Console・環境変数・Emulator・公開
- [Codex向けガイド](./AGENTS.md): 次回作業時の参照順と開発ルール

GitHub Actionsは`npm ci`と`npm run check`を実行します。PWAの実ブラウザーテストは、別途Chromiumをインストールして`npm run test:pwa`で実行します。専用Firebaseプロジェクト`futari-kurashi-5fcab9`を作成済みです。GitHub Privateリポジトリの作成・remoteの設定・pushは未実施です。Hostingの検証公開状況は[実装記録0003](./docs/implementation-log/0003-pwa-iphone.md)に記録します。

実装ごとの理由は[実装記録](./docs/implementation-log/README.md)から確認できます。指摘するときは、チャットで「0003のD1について、こう変えたい」のように伝えてください。Codexが対象の記録に指摘・対応・再検証を追記します。

## 世帯機能のローカル検証

JDK 21とChromiumを用意し、`npm run test:integration`でRules・認証・世帯のEmulatorテストを実行します。`test:rules`・`test:household`で個別検証も可能です。Authテストも世帯表示に進むためAuth＋Firestore Emulatorを使用します。通常のクラウド設定で試す前に、[世帯検証手順](./docs/household-verification.md)を参照してください。項目5でFirestoreのクラウド準備・Rules反映・検証用Hosting公開を実施しました。

世帯権限は2世帯の隔離・直接改ざん・競合・拒否後の不変性までローカル検証済みです。許可／拒否の仕様と実行方法は[権限表](./docs/firestore-permissions.md)、判断理由は[実装記録0006](./docs/implementation-log/0006-firestore-permissions.md)に記載しています。

## iPhone＋PCでの共有確認

[共有確認手順](./docs/realtime-sharing-verification.md)に沿って進めます。共有確認は完了済みで、同じURLは現在cleaning-checkに更新されています（2026-10-27 14:25、日本時間まで有効）。世帯を作るのはAだけ、Bは招待から参加します。プレビュー期限後もデータは保持します。実施した設定と公開情報は[記録0007](./docs/implementation-log/0007-realtime-sharing.md)に残しています。

## ホームと6画面の操作

世帯に所属するとホームへ進み、下部のメニューから家事・買い物・片付け・家計・設定を開きます。未実装機能は準備中です。メール・世帯・招待・ログアウトは設定にあります。home-checkをpwa-checkへ検証公開し、2026-10-20にiPhoneの全確認手順が成功しました。[確認手順](./docs/home-verification.md)と[実装記録0008](./docs/implementation-log/0008-home-navigation.md)を参照してください。

## ToDoと今日の一覧

家事画面からToDoを追加・編集・削除・完了/解除できます。担当は未担当・自分・相手・2人、日付期限と優先度を指定できます。2人担当でもどちらかの操作で完了します。ホームは日本時間の今日が期限の未完了を表示します。todo-checkを既存pwa-checkへ検証公開済みで、2026-10-27 11:56（日本時間）まで有効です。2026-10-20にiPhone＋Macの全確認手順が成功しました。[検証手順](./docs/task-verification.md)と[実装記録0009](./docs/implementation-log/0009-tasks.md)を参照してください。

## 繰り返し家事と履歴

家事画面のToDo/繰り返し/履歴から毎日・毎週・毎月の家事を管理します。未完了は1件持ち越し、直近の完了だけ取消可能。停止・再開や設定変更は以前の完了を取り消さず、履歴を保持します。通常ToDoは従来どおりです。[確認手順](./docs/recurring-verification.md)と[記録0010](./docs/implementation-log/0010-recurring-tasks.md)を参照してください。実装・自動検証・検証公開に加え、2026-10-20にiPhone＋Macの①〜⑤すべてを本人確認済みで、項目8Aは完了です。期限は2026-10-27 12:30（日本時間）です。

## 掃除スケジュールと担当交代

家事→掃除で今日/今週と場所別に確認できます。繰り返し家事の場所を設定すると掃除になり、2人世帯・担当1人では完了ごとの交代も選べます。直近取消で予定と担当を復元し、週間の未来分は参考予定として表示します。`npm run test:cleaning`で新しい権限とブラウザーフローを確認できます。cleaning-checkを既存pwa-checkへ検証公開し、2026-10-20にiPhone＋Macの①〜⑤を本人確認済みで項目8Bは完了です。期限2026-10-27 14:25（日本時間）。[確認手順](./docs/cleaning-verification.md)と[記録0011](./docs/implementation-log/0011-cleaning.md)を参照してください。
