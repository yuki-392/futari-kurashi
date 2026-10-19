# 開発計画と実装状況

更新日: 2026-10-19

## 環境構築（今回）

- React / TypeScript / Vite / Tailwind CSSの基盤
- Firebase設定検証と、Auth / Firestoreクライアントの遅延初期化
- Firebase未設定でも表示できる起動確認画面
- PWA manifest / アイコン / Service Worker / 更新確認UI
- Firebase Hosting / Emulator / Firestoreルールの設定ファイル
- ESLint / Prettier / Vitest / TypeScript / GitHub Actions
- 製品仕様・開発ガイド・設計方針の文書化
- ローカルGitの初期化

これらは開発基盤です。実際のログイン、世帯共有、各種リスト・ダッシュボードはまだ実装していません。Firebaseクラウドプロジェクトの作成、GitHub Privateリポジトリの作成・接続、本番公開も未実施です。

### 環境構築時の検証結果

- Node.js 24.21.0で`npm run check`が成功（ESLint・Prettier・Vitest 7件・TypeScript・本番ビルド）。
- Firebase CLI 15.34.0の起動を確認。制限された実行環境では一時的な`XDG_CONFIG_HOME`を指定して確認した。
- 生成されたPWA manifest・192/512px PNG・maskableアイコン・Service Workerを確認。
- ブラウザー操作ツールが応答しなかったため、実際の画面描画・Service Worker登録・更新操作は未検証。iPhone実機での確認も今後行う。
- Java Runtimeがないため、Firestore Emulator本体の起動・ルールの実行検証は未実施。
- `npm audit`で11件（high 7件、moderate 4件）の依存関係警告を確認。Firebase SDK配下の`@grpc/grpc-js`、Firebase CLI配下の`chokidar` / `braces`・`@opentelemetry/core`・`gaxios` / `uuid`が主な原因。直接依存は環境構築時の最新安定版を使用している。推奨される`--force`はSDK/CLIの大幅なダウングレードを含むため実行していない。上流の修正・互換性を確認して更新する。機能追加・公開前にも再監査する。

## Phase 1：MVP

以下の順で進めます。各段階でテスト・実機確認を行います。

- [ ] PWAのiPhone Safari実機確認（インストール・再起動・更新）
- [ ] メール・パスワード認証、ログアウト、認証状態の表示
- [ ] 世帯作成・招待・参加、メンバー上限2人
- [ ] 世帯単位のFirestore Security RulesとEmulatorでの権限テスト
- [ ] 2つのアカウント・端末によるリアルタイム共有確認
- [ ] アプリのナビゲーションとホーム画面
- [ ] ToDoの追加・編集・削除・担当・期限・優先度・完了
- [ ] 繰り返し家事・履歴・掃除スケジュール・担当ローテーション
- [ ] 買い物リスト
- [ ] 断捨離リスト
- [ ] Firebase Hosting公開・無料枠内の利用量確認

## Phase 2：生活管理機能の充実

- [ ] 手動の収入・支出・カテゴリ管理
- [ ] 月間・カテゴリ別予算
- [ ] 支払者・負担割合・立替金の精算
- [ ] 家のルール・合意・変更履歴
- [ ] 買い物と支出登録の連携

## Phase 3：利便性・分析機能

- [ ] 家事達成率・支出分析のグラフ
- [ ] 家事・支出の履歴分析
- [ ] CSV / JSONエクスポート
- [ ] バックアップ・データ復元

将来の追加候補は [製品仕様](./product-spec.md) を参照してください。
