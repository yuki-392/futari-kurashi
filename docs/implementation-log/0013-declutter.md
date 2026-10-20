# 0013: 共有断捨離リスト

- 作成日: 2026-10-20（日本時間）
- 更新日: 2026-10-20
- フェーズ: Phase 1・項目10
- 実装状態: 完了（実装・自動検証・検証公開・本人確認済み）
- ユーザー確認: 確認済み
- 関連記録: [0012 買い物](./0012-shopping.md)、[0009 ToDo](./0009-tasks.md)

## 目的と対象要件

[製品仕様の断捨離・持ち物管理](../product-spec.md)と、今回承認された項目10の計画に従い、2人が処分候補・所有者・方法・期限・処分状況を共有する。写真・買い替え候補・売却金額・買い物/家計連携は対象外。前項目0012に未対応の不具合指摘はない。繰り返し家事の削除は0011 R5の後続項目に残す。

## 実装前の方針

片付けに登録/編集と未処分/処分済み一覧を追加する。ホームは今日までが期限の未処分5件までを表示し、操作は片付け画面で行う。検証済みの認証・世帯・日付・Firestore初期化を再利用する。テストを先に失敗させ、単体・Rules・2ブラウザー・PWA検証後に既存プレビューへ公開する。本番Hostingを変更せず、実機結果が残れば確認待ちで止める。

## 判断と理由

### D1: 期限の派生ソート値を保存する

- 採用する方法: dueDateは日付/null、sortDueDateは同じ日付/`~`。未処分はsortDueDate昇順・createdAt降順、処分済みはcompletedAt降順。方法もサーバー条件へ含め、一覧101件/ホーム6件から追加分を判定する。
- 理由: 期限なしを末尾に保ち、ホームで期限のある対象だけを取得できる。Rulesで元の日付との一致を強制する。
- 代案・制約: クライアントで並べ替え/絞り込みすると取得上限外を見落とす。派生値を持つ分、整合性テストが必要になる。
- 判断の状態: 採用中。

### D2: 完了情報は最新状態だけを記録する

- 採用する方法: 保留の完了を拒否。完了時にサーバー時刻と操作UIDを記録し、通常編集は保持、解除時のみnullへ戻す。全履歴は作らない。
- 理由: 所有者と記録者を区別し、過去の実施者を推測しないため。今回の範囲で必要な完了状態に限定する。
- 制約: 解除・再完了・完全削除後に過去情報を復元できない。削除確認に明記する。
- 判断の状態: 採用中。

### D3: 既存の世帯権限と版照合を引き継ぐ

- 採用する方法: 世帯配下declutterItemsへ保存し、transactionで表示時の版を照合。Rulesはスキーマ・世帯所属・監査・完了遷移を検証する。削除の版照合はサービス側、Rulesは所属権限を検証する。
- 理由: 他端末の変更を古い画面で上書きしない。UIを通らない直接操作にも権限制御を適用する。
- 制約: 通信断中の書き込みは行わない。永続オフラインキャッシュは使用しない。
- 判断の状態: 採用中。

### D4: 既存の検証基盤とプレビューを使う

- 採用する方法: demo-futari-kurashi・既存JDK21/Emulatorと独立した2ブラウザーで架空データだけを検証。Browserプラグインが利用可能一覧にないため既存Playwrightを使う。Rules/インデックスの現状を保存・照合した後、declutter-checkを専用プロジェクトのpwa-checkへ7日間公開する。
- 理由: 既存データと本番Hostingを保ち、継続利用中の同じURLで本人確認できる。
- 制約: 自動テストでiPhone実機確認を代替しない。プレビュー期限後もFirestoreとRules・データは残る。
- 判断の状態: 採用中。

## 実際の変更

| ファイル・関数                                                                        | 変更内容                                                                      | 判断   |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| src/features/declutter/                                                               | モデル/完了遷移・Firestore transaction/購読・フォーム/一覧/ホーム・単体テスト | D1〜D3 |
| src/app/HomeShell.tsx、src/features/home/HomePanel.tsx                                | 片付け画面と今日以前の未処分最大5件                                           | D1     |
| firestore.rules、firestore.indexes.json                                               | 同世帯の限定権限・完了遷移・4クエリ形状のインデックス                         | D1〜D3 |
| scripts/test-declutter-rules.mjs、test-declutter.mjs、run-emulators.mjs、package.json | 直接SDK/2ブラウザー検証とCI経由の実行                                         | D4     |
| docs/*、README.md、AGENTS.md                                                          | スキーマ・権限表・確認手順・進捗の更新                                        | D1〜D4 |

既存の認証/所属/招待/ToDo/繰り返し/掃除/買い物のデータは変更しない。

## 検証結果

- RED: model/serviceの未実装を2スイートのimport失敗で確認し、その後8テスト成功。UIも未実装のimport失敗を確認してから実装した。
- Rules RED: 全拒否の段階で正常作成allow 1がpermission-deniedとなることを確認した。実装後は18正常/89拒否が成功。拒否後の保存状態不変と同時完了/編集の整合性を確認した。
- npm run check成功: ESLint・Prettier・TypeScript・23ファイル120単体テスト・本番ビルド。断捨離17テストを追加（モデル4・サービス4・UI9）。日本時間の日付変更/前面復帰と1人世帯/再試行も確認。
- Browserプラグインが一覧にないため既存Playwrightを使用。最初のブラウザー追試は既存ページタイトルのテスト期待値が誤って失敗し修正。次に架空データの保留品が1件ある状態で空を期待したテストを修正（正常な表示、製品コードの修正なし）。追加の追試では期限順の初回100件に入らない期限なし品を無絞り込みで期待して失敗し、保留のサーバー絞り込みで保存維持を確認するようテストを修正した。製品コードの回避変更はしていない。最終の全統合テストで成功。
- 公開前の読み取り: 現行Rulesはrulesets/883074a4-c777-4bfd-81d3-de4f8eb18226、SHA256 593ce748fd43b0ff0a5f9c29e53ec18f1d93661d6efd6a5f201335b3a8f5e207で前項目と一致。9インデックスすべてREADY、fieldOverrides=[]、billingEnabled=false。変更前Rulesと参照情報をGit対象外.tools.local/rules-backups/0013-beforeへ保存した。

| 最終検証                                      | 結果・限界                                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run test:integration                      | 成功。旧22シナリオ: 追加正常29/拒否601。declutterItemsの旧拒否48件を専用テストへ移管。ToDo13/66・繰り返し31/90・掃除27/57・買い物14/84・断捨離18/89の正常/拒否検証成功                                                                        |
| Auth＋Firestore Emulator・独立した2ブラウザー | 成功。既存の認証/世帯/ToDo/繰り返し/掃除/買い物と断捨離の共有/CRUD/完了監査/解除/再完了/ホーム/方法絞り込み/103+103件追加/競合編集・削除/通信復帰/再読み込み/ログアウト再ログイン。実クラウドのアカウント作成・メール送信・データ書き込みなし |
| 幅320/390/1280px                              | 横はみ出しなし、フッターと下部ナビの余白あり。390/1280pxのスクリーンショットを目視確認。iPhone実機とキーボードは別途本人確認                                                                                                                  |
| npm run test:pwa                              | 成功。Service Worker/静的キャッシュ/Aのオフライン再起動/A→Bの通知・延期・前面再通知・適用。実行時/consoleエラーなし                                                                                                                           |
| npm audit                                     | 依存変更なし。既存の12件（high8/moderate4/critical0）を再確認。force修正を行わない方針は0005 D6を維持                                                                                                                                         |

公開画面の画像は/tmp/futari-declutter-public-390.png / futari-declutter-public-1280.png。390pxを目視確認（認証前の表示制御・重なりなし）。

画像証跡はGit対象外の一時ディレクトリ`/var/folders/tf/cdp8q_q56qjdgbq5jp_ft8lc0000gn/T/`のfutari-declutter-mobile.png / futari-declutter-desktop.png。Browserプラグインは利用可能一覧になく、既存Playwrightで検証した。

## クラウド反映（検証公開の準備）

- 反映前: Rules/参照情報を.tools.local/rules-backups/0013-beforeへ保存（Git対象外）。既存9インデックスREADY、fieldOverrides=[]、請求先未接続を確認。
- 検証済みRulesを明示プロジェクトIDで反映。公開rulesets/614f1a45-8e89-47cb-92a9-fae75982f445、更新2026-10-20T06:56:09.451997Z。SHA256 f7e3b4f1c88d4ad09d7c40d954cc6f344fe409ba4633a717f3f83f9d7752c4d0、ローカルソースと完全一致。旧Rulesの他機能の定義は保持。
- 断捨離の4複合インデックスを追加。既存9件を維持、13件すべてREADYを読み戻し確認。生成中は公開を待ち、READY確認後に検証公開した。fieldOverrides=[]とbillingEnabled=falseも維持。
- Emulator=false・declutter-check・専用プロジェクトを環境検査し、同じ環境でnpm run check（120単体テスト含む）と本番ビルドが成功。個人データをService Workerへ追加しない。既存データの削除/移行・Auth設定・本番Hostingの変更は行わない。

### 追加インデックスと公開情報

| ID           | フィールド                                       | 読み戻し |
| ------------ | ------------------------------------------------ | -------- |
| CICAgJiUpoMJ | completed↑ / completedAt↓                        | READY    |
| CICAgLjy8IAK | completed↑ / method↑ / completedAt↓              | READY    |
| CICAgLiIkYMK | completed↑ / method↑ / sortDueDate↑ / createdAt↓ | READY    |
| CICAgNjp5ZMK | completed↑ / sortDueDate↑ / createdAt↓           | READY    |

- 検証URL: [https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app](https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app)
- 識別子: declutter-check、Emulator接続=false。
- プロジェクト: futari-kurashi-5fcab9、チャネル: pwa-check（本番liveは未変更）。
- Hostingバージョン: 9522053e0ae6cb06。
- 期限: 2026-10-27 16:01（日本時間）、API値2026-10-27T07:01:28.419962139Z。
- プレビュー期限後もFirestore/Rules/インデックス/既存データを保持する。実クラウドの自動アカウント作成・メール送信・データ書き込みは行わない。

```sh
VITE_USE_FIREBASE_EMULATORS=false VITE_APP_BUILD_LABEL=declutter-check npm run check
CI=1 npm run firebase -- deploy --only firestore:indexes --project futari-kurashi-5fcab9 --non-interactive --json
CI=1 npm run firebase -- deploy --only firestore:rules --project futari-kurashi-5fcab9 --non-interactive --json
CI=1 npm run firebase -- hosting:channel:deploy pwa-check --expires 7d --project futari-kurashi-5fcab9 --no-authorized-domains --non-interactive --json
```

上記は実行済みコマンド。インデックス/Rulesのクラウド反映はローカルのcheck・全統合・PWA検証成功後に実施し、READY/ソース一致を確認してからHostingを公開した。公開用checkも成功している。

## ユーザーに確認してほしい点

2026-10-20にiPhone 16 / iOS 26.2＋Mac／Chrome・既存のテスト用2アカウントで①〜⑤「すべてok」と本人確認済み。反映時間は未申告。項目10完了。共有・閲覧者基準の所有者・保留の完了拒否・方法決定・完了記録者と通常編集時の保持・解除/再完了・期限順/方法絞り込み/ホーム反映・削除のキャンセル/確定・再起動/ログアウト再ログインを確認した。反映時間を即時と推測して記録しない。実キーボードの個別検証・ホーム6件以上の案内は今回の必須本人確認に含めていない。

## 指摘と対応

まだ指摘はありません。

## 未解決事項・次の作業

実装・自動検証・クラウド反映・検証公開・本人確認まで完了。反映時間とMac OS/Chromeの詳細バージョンは未申告。買い替え・定期購入品・繰り返し削除・本番公開など次の機能へ自動で進まない。

## 変更履歴

- 2026-10-20: 実装前の方針を作成。作業ツリーに既存の未コミット変更がないことを確認。

- 2026-10-20: 断捨離機能・Rules・自動検証を実装し、check・全統合・PWAの成功とモバイル/PC画像を確認。クラウド変更前を保存。

- 2026-10-20: 公開Rules完全一致・全13インデックスREADYとSpark維持を確認し、declutter-checkをpwa-checkへ7日間公開。本人確認待ちで一区切り。

- 2026-10-20: 本人から確認手順①〜⑤に「すべてok」と回答あり。これを根拠に実装記録・確認表・進捗・関連文書を完了へ更新する。反映時間は未申告のまま残す。コード/クラウド変更は予定しない。

- 2026-10-20: ①〜⑤すべて成功の本人結果を反映し、項目10を完了へ更新。変更は文書のみ、追加実装・再公開・データ削除なし。

- 2026-10-20: 本人確認の文書反映後にnpm run checkが成功（ESLint・Prettier・120単体テスト・TypeScript・ビルド）。文書以外の追加変更と再公開は行っていない。
