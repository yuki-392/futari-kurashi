# 開発計画と実装状況

更新日: 2026-10-20

## 実装の進め方

各作業は、着手前に目的・判断理由を[実装記録](./implementation-log/README.md)へ記載し、完了時に変更・検証・未解決事項を追記します。ユーザーの指摘と修正の経緯も同じ場所から追えるようにします。Phase 1・項目1のPWA実機確認は完了しました。項目2の認証機能も、実装・自動検証・検証公開と一連の実機確認まで完了しました。項目3の世帯機能と項目4の権限検証はローカル検証を完了し、項目5でFirestoreとRulesを準備して検証公開しました。2026-10-20にiPhone＋Mac／Chrome・テスト用2アカウントでの共有確認が完了しました。各項目で一区切りとし、次の項目へ自動で進みません。

## 環境構築（今回）

- React / TypeScript / Vite / Tailwind CSSの基盤
- Firebase設定検証と、Auth / Firestoreクライアントの遅延初期化
- Firebase未設定でも表示できる起動確認画面
- PWA manifest / アイコン / Service Worker / 更新確認UI
- Firebase Hosting / Emulator / Firestoreルールの設定ファイル
- ESLint / Prettier / Vitest / TypeScript / GitHub Actions
- 製品仕様・開発ガイド・設計方針の文書化
- ローカルGitの初期化

これらは環境構築時に用意した開発基盤です。その後の認証・世帯機能の進捗は以下のPhase 1を参照してください。環境構築時点では各種リスト・ダッシュボードは未実装でした。環境構築後に専用Firebaseプロジェクトを作成し、PWA確認用のビルドAをHostingプレビューチャネルへ公開しました（[実装記録0003](./implementation-log/0003-pwa-iphone.md)）。GitHub Privateリポジトリの作成・接続、本番公開は未実施です。

### 環境構築時の検証結果

以下は環境構築当時の結果です。PWAの最新の検証結果は[0003](./implementation-log/0003-pwa-iphone.md)を参照してください。

- Node.js 24.21.0で`npm run check`が成功（ESLint・Prettier・Vitest 7件・TypeScript・本番ビルド）。
- Firebase CLI 15.34.0の起動を確認。制限された実行環境では一時的な`XDG_CONFIG_HOME`を指定して確認した。
- 生成されたPWA manifest・192/512px PNG・maskableアイコン・Service Workerを確認。
- ブラウザー操作ツールが応答しなかったため、実際の画面描画・Service Worker登録・更新操作は未検証。iPhone実機での確認も今後行う。
- Java Runtimeがないため、Firestore Emulator本体の起動・ルールの実行検証は未実施。
- `npm audit`で11件（high 7件、moderate 4件）の依存関係警告を確認。Firebase SDK配下の`@grpc/grpc-js`、Firebase CLI配下の`chokidar` / `braces`・`@opentelemetry/core`・`gaxios` / `uuid`が主な原因。直接依存は環境構築時の最新安定版を使用している。推奨される`--force`はSDK/CLIの大幅なダウングレードを含むため実行していない。上流の修正・互換性を確認して更新する。機能追加・公開前にも再監査する。

## Phase 1：MVP

以下の順で進めます。各段階でテスト・実機確認を行います。

- [x] PWAのiPhone Safari実機確認（インストール・再起動・更新）。iPhone 16 / iOS 26.2で導入・独立表示・再起動・更新の延期/再通知/適用・オフライン表示・名前/アイコンをユーザーが確認済み。[記録0003](./implementation-log/0003-pwa-iphone.md)
- [x] メール・パスワード認証、ログアウト、認証状態の表示。新規登録・メール確認・パスワード再設定も実装済み。登録・メール確認・認証維持・ログアウト・再ログイン・パスワード変更を本人確認済み。旧パスワード拒否・新パスワードのログイン成功も本人確認済み。項目2完了。[記録0004 R1](./implementation-log/0004-email-auth.md#r1-新規登録ボタンを押せない)
- [x] 世帯作成・招待・参加、メンバー上限2人（今回のローカル実装・自動検証まで）。指定メールと招待コード、期限・取消・再発行、1人1世帯、原子的参加を実装。項目5で検証公開とiPhone＋PCでの本人確認まで完了。[記録0005](./implementation-log/0005-household.md)
- [x] 世帯単位のFirestore Security RulesとEmulatorでの権限テスト（ローカル）。既存13＋追加9の22シナリオ、追加分の正常29件・拒否745件で2世帯の隔離・直接改ざん・部分更新・競合・拒否後の不変性を検証。招待先メールの空白判定を最小修正。[記録0006](./implementation-log/0006-firestore-permissions.md)
- [x] 2つのアカウント・端末によるリアルタイム共有確認。東京のFirestore作成・テスト済みRules反映・sharing-checkの検証公開まで完了、2026-10-20にiPhone 16 / iOS 26.2＋Mac／Chrome・テスト用2アカウントで招待・ほぼ即時の人数反映・再起動・通信復帰・ログアウト/再ログインを本人確認済み。2台目のiPhoneは対象外・未実施。[記録0007](./implementation-log/0007-realtime-sharing.md)。今後の家事などの権限は各機能追加時に実装する。
- [x] アプリのナビゲーションとホーム画面。6画面・実世帯情報・設定への招待/ログアウト集約を実装・自動検証済み。home-checkを検証公開し、2026-10-20にiPhoneで更新・6画面移動・設定表示と重なりなし・再起動・ログアウト/再ログインを本人確認済み。項目6完了。[記録0008](./implementation-log/0008-home-navigation.md)
- [x] ToDoの追加・編集・削除・担当・期限・優先度・完了。未担当も選択でき、ホームに日本時間の今日の未完了を表示。実装・68単体テスト・Emulator統合・PWA検証済み。Rules/インデックス反映とtodo-check検証公開と2026-10-20のiPhone＋Mac本人確認まで完了。作成・担当編集・今日の一覧・完了/解除・削除・再起動・ログアウト/再ログインが成功し、即時反映を確認（本人の体感）。[記録0009](./implementation-log/0009-tasks.md)
- [x] 項目8A：繰り返し家事・実施履歴。毎日/週/月・1件持ち越し・履歴/直近取消・停止再開を実装・82単体テスト・Emulator統合・PWA検証、Rules/インデックス反映とrecurring-check検証公開済み。2026-10-20にiPhone＋Macの①〜⑤すべて問題なしと本人確認済みで項目8A完了。[記録0010](./implementation-log/0010-recurring-tasks.md)
- [x] 項目8B：掃除場所別スケジュール・担当ローテーション。既存繰り返しを拡張し、今日/今週・場所絞り込み、完了ごとに交代・取消で復元。93単体テスト・全Emulator統合・PWA検証が成功し、Rules/インデックス反映とcleaning-checkの検証公開済み。2026-10-20にiPhone＋Macの①〜⑤すべてokと本人確認し項目8B完了。[記録0011](./implementation-log/0011-cleaning.md)
- [x] 項目9：共有買い物リスト。通常リストとホーム最大5件を実装。103単体テスト・全Emulator統合・PWA検証が成功し、Rules/インデックス反映とshopping-check検証公開済み。2026-10-20にiPhone＋Macの①〜⑤すべてokと本人確認し項目9完了。正確な未購入総件数は今回対象外。定期購入品は別項目、家計連携はPhase 2。[記録0012](./implementation-log/0012-shopping.md)
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

### 項目3の依存関係・ビルド上の確認事項

- rules-unit-testing追加後のnpm auditは12件（high 8 / moderate 4）。既存Firebase依存の警告がテストパッケージにも伝播。メジャーダウングレードを含むforce修正は未実施。記録0005 D6を参照。
- Firestore SDKの遅延チャンクは約582kB（gzip約173kB）、静的PWAキャッシュは約949KiB。Viteの500kB超警告は残る。認証前の初期ロードとは分離し、警告の閾値を上げて隠していない。

## 後続の追加項目（詳細・時期未確定）

- [ ] 繰り返し家事・掃除の削除。項目8B確認後のユーザーの質問を受けて記録。現在は一時停止のみ。実施履歴を残して一覧から外す方式を検討し、完全削除・復元・直近取消との関係は実装前に整理する。追加仕様の決定や実装着手はまだ行っていない。[記録0011 R5](./implementation-log/0011-cleaning.md#r5-繰り返し家事掃除の削除についての質問)

- [ ] 定期的に買う商品の管理。項目9では通常リストのみを実装し、本機能は別項目として未実装。仕様・着手時期は未確定。
