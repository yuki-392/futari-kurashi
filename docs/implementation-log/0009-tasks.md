# 0009: ToDo管理とホームの今日のToDo

- 作成日: 2026-10-20（日本時間）
- フェーズ: Phase 1・項目7
- 実装状態: 実装・自動検証・検証公開・iPhone＋Mac実機確認完了（2026-10-20）
- ユーザー確認: 確認済み（案内した①〜⑤）
- 関連記録: [0008 ホーム](./0008-home-navigation.md)、[0006 権限](./0006-firestore-permissions.md)

## 目的と対象要件

承認済み項目7と製品仕様のToDo管理に対応。追加・編集・削除・未担当/自分/相手/2人・日付期限・優先度・完了/解除と今日の未完了一覧を実装する。繰り返し・カテゴリ・掃除予定・通知・分析は対象外。

## 実装前の方針

家事は未完了/完了を切り替え、新規順で100件ずつ追加表示。ホームは日本時間の今日が期限かつ未完了だけを別クエリで10件ずつ追加表示。既存世帯とアカウントを保持し、自動検証後にRules・必要なインデックスとtodo-checkを検証公開する。

## 判断と理由

### D1: UID配列と日付文字列

担当はUID配列（空/1人/両メンバー）。表示は閲覧者基準。期限はYYYY-MM-DD/nullとして保存し、端末のタイムゾーンや夏時間に左右されない日本時間の日付と比較する。タイトル1〜100文字、優先度low/medium/high、完了は共有のboolean。2人担当でもどちらかの操作で完了する。

### D2: 版番号を用いたオンラインtransaction

作成もtransactionを使い、オフラインの書き込みをキューへ残さない。更新・完了変更・削除は読み取り時に版番号を照合し、不一致/削除済みは競合案内とする。作成情報は不変、更新時刻/実行UIDとversion+1をRulesで強制する。削除リクエストには新データがないため、Rulesは削除権限を検証し、古い版との照合はクライアントtransactionで実施する。世帯メンバー自体には削除権限がある。削除の版番号をRulesで強制したとは記録しない。

### D3: 必要な画面だけで有限クエリを購読

家事とホームは異なる条件で購読し、画面移動・認証変更時に解除する。初回100/10件に対して1件多く取得して追加表示可否を判定し、未取得分を含む総数は表示しない。ホームの取得範囲が家事の最新100件に依存しない。日付変更・前面復帰で日本日付を更新する。個人データのSWキャッシュ・Firestore永続キャッシュは追加しない。

### D4: 世帯の限定権限と段階公開

既存所属・世帯・招待Rulesを保ち、tasksだけを追加許可。型/全必須項目/余分な項目/担当/実在日付/監査/版を検証。未認証・未確認・他世帯・無制限一覧は拒否する。既存クラウドRules/インデックスを記録し、検証後に追加定義を反映。本番Hostingへ公開しない。

## 実際の変更

src/features/tasksのモデル・サービス・購読/日本日付・フォーム/一覧/今日の表示を追加。HomeShellの家事画面とHomePanelに統合した。タスク用Rules・2インデックス・単体/直接権限/ブラウザーテストを追加し、test:integrationとtest:tasksへ組み込んだ。既存の画面テストはToDoサービスをモックし、テスト中の実クラウド接続を防止。旧未実装パスのtasksだけを新権限表へ移し、それ以外の拒否を維持した。

## 検証結果

モデル/UI/サービスは未実装モジュールでRED、Emulatorは旧全拒否でREDを確認してから実装。npm run check / test:integration / test:pwa、Playwrightの2アカウントで検証する。Browser plugin not availableのため既存Playwrightを使う。

## 指摘と対応

### R1: 絵文字の100文字境界（Codexが検証で発見）

RulesのString.sizeとJavaScriptのコードポイント数の差で、100個の絵文字を許可する正常テストが失敗。RulesをUnicode文字を数えるRE2の.{1,100}へ変更し、100個の絵文字を含む13正常/66拒否の直接操作テストが成功。UI/Rulesの境界を一致させた。

### R2: 担当selectのラベル（Codexがブラウザー検証で発見）

Playwrightで担当選択時に完全一致のラベル取得が失敗。内包する選択肢とラベルを明確に分離するためselectにaria-labelを追加する。修正後のブラウザー検証は成功。

### R3: 編集を明示的に開き直した場合の版と入力（Codexがテストで発見）

他端末の更新後に同じ行を編集し直すと、フォームが再生成されず古い入力と新しい版が混在する。失敗する単体テストを追加し、フォームのkeyをID+版に変更。自動的な相手更新では入力を保持し、本人が編集を開き直した場合だけ最新内容をロードする。

### R4: テストの保存結果取得（Codexが追加検証で発見）

同時書き込みの保存結果を検証するテストで、withSecurityRulesDisabledがcallbackの戻り値を返さずundefinedになると判明。結果をcallback外の変数へ明示的に保存して取得し、既存データの版が存在することも検証する。これにより拒否後の不変性がundefined同士の比較にならないよう修正。Rulesの変更は不要。修正後は実データで不変性と同時更新結果を確認し成功。

### R5: 長い一覧で削除確認を見失う（Codexのレビューで発見）

削除確認は一覧の末尾へ表示するため、長い一覧では押したボタンから離れる。失敗するフォーカステストを追加し、確認ボタンへフォーカス/中央スクロール、取消時は元のボタンへ戻す。操作エラーもフォーカス可能な案内にする。

### R6: 世帯切り替え時の編集中入力（Codexのレビューで発見）

UID変更は既存Providerのkeyで破棄されるが、同じUIDで購読先世帯が変わった場合の入力破棄が不足。通常のアプリ操作では所属変更は未提供でも、今回の破棄要件を守るため失敗するテストを追加。HomeShellをUID+世帯IDでkey化し、画面の購読だけでなく編集中の入力・版も破棄する。

ユーザーからの指摘はまだありません。

## ユーザーに確認してほしい点

iPhone＋Macの既存テストアカウントで作成・共有・担当表示・今日の一覧・完了/解除・削除・再起動・ログアウト/再ログイン。パスワードや招待コードは送らない。

## 未解決事項・次の作業

項目7は完了。本人確認で未解決の不具合なし。次は繰り返し家事・履歴・掃除スケジュール・担当ローテーションだが、自動では進まない。

## 公式資料

- [クエリ制約をRulesで検証](https://firebase.google.com/docs/firestore/security/rules-query)
- [Rulesのtimestamp.date](https://firebase.google.com/docs/reference/rules/rules.timestamp)

## 変更履歴

- 2026-10-20: 着手前に目的・D1〜D4・検証方法を記録。

### 自動検証の結果

- npm run check成功: 68単体テスト、Lint・整形・型検査・本番ビルド。
- npm run test:integration成功: 既存Rules22シナリオ・追加正常29/拒否697、ToDo権限・認証・世帯・ToDo共有フロー。新しいToDo同時直接更新の追加後はtask-rulesを個別再実行し13正常/66拒否で成功。成功件数だけでなく敗者のpermission-denied、保存後version=2と勝者の内容を確認した。
- npm run test:pwa成功: SW制御、静的キャッシュ、オフライン起動、更新延期/再通知/適用。
- Playwrightの2アカウントで、作成→共有→担当の閲覧者基準表示→ホーム今日→完了/解除→両者編集の競合→削除の競合/キャンセル/成功→オフライン復帰→再読み込み/ログアウト/再ログインを確認。
- 架空データ113件をEmulatorで準備し、家事の100件超と今日の10件超の追加表示、家事の最新100件外の古い今日ToDoもホームで取得できることを確認。Rules無効化は準備・結果確認だけ。
- 320/390/1280px幅、横はみ出しなし、footerとナビの重なりなし。モバイル/PCのスクリーンショットをOS一時フォルダーに保存し目視確認。実機のキーボード/safe areaは未確認。
- 既存Firestore SDK約582kBのチャンク警告は継続。静的PWAキャッシュ約966KiB。

### クラウド変更前の読み取り

futari-kurashi-5fcab9のbillingEnabled=false。現行Rulesは953a2a98-836b-4f81-a04f-4c7e984007f9、更新2026-10-19T07:42:36.035211Z、SHA256=8670f4c557a1e3e4e9fd9aafe408dc559eba23f6d4a60c07f564d1328abb1c04。変更前のGit HEADと完全一致。インデックス/fieldOverridesは0件。

Git対象外の.tools.local/rules-backups/0009-beforeにRulesソースと参照情報を保存。ローカル差分はtasks用限定許可の追加だけで、既存所属/世帯/招待は変更していない。既存ドキュメントの読み書き・削除は行っていない。

### 公開準備の進捗

- 2026-10-20: ToDo用インデックス2件を追加（既存0件・削除なし）。作成中のためREADYまで画面公開を待つ。
- 2026-10-20: テスト済みRulesを反映し、APIでローカルとの完全一致を確認。Ruleset=b3e52e8e-7b6e-4e5e-83c2-59510b1fd39e、更新2026-10-20T02:53:41.167300Z、SHA256=337d9760abcbe0d7595c1646a985b1af74877bf743b93e2de39703423019c475。
- R5/R6を含めたnpm run checkは68単体テストで成功。最終コードで全統合テストとPWAの再実行も成功。Rulesの再実行はR4修正後の実データで不変性・同時更新を確認済み。

### 公開前の最終結果

- R5/R6の修正後もnpm run check（68テスト）、npm run test:integration（既存22シナリオ＋ToDo13正常/66拒否＋認証/世帯/ToDoブラウザーフロー）、npm run test:pwaがすべて成功。
- インデックスは両方READY: CICAgOjXh4EK（completed ASC, createdAt DESC）、CICAgJiUpoMK（completed ASC, dueDate ASC, createdAt DESC）。queryScope=COLLECTION、末尾の__name__ DESCはFirestoreが追加するタイブレーク。
- billingEnabled=false、公開Rulesのローカル一致も最終読み戻しで確認。データ削除や実アカウントの自動操作は行っていない。

## 検証公開

- プロジェクト: futari-kurashi-5fcab9（Spark、billingEnabled=falseを読み戻し確認）
- チャネル: pwa-check、識別子: todo-check、Emulatorを明示的に無効化。
- [検証URL](https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app)
- Hostingバージョン: 5671b61886b38560
- 有効期限: **2026-10-27 11:56（日本時間）**。API: 2026-10-27T02:56:44.543452690Z
- Rulesのローカル一致とインデックス2件のREADYを確認してから画面を公開した。
- 本番Hosting・既存Auth設定・データは変更していない。既存home-checkを同じプレビューで置き換えた。期限後もFirestore/Rules/データは残る。

```sh
npm run firebase -- deploy --only firestore:indexes --project futari-kurashi-5fcab9 --non-interactive --json
npm run firebase -- deploy --only firestore:rules --project futari-kurashi-5fcab9 --non-interactive --json
VITE_USE_FIREBASE_EMULATORS=false VITE_APP_BUILD_LABEL=todo-check npm run build
CI=1 npm run firebase -- hosting:channel:deploy pwa-check --expires 7d --project futari-kurashi-5fcab9 --no-authorized-domains --non-interactive --json
```

2026-10-20、本人が[確認手順](../task-verification.md)の①〜⑤すべて想定どおり、即時反映と回答。項目7を完了とする。繰り返し家事へは進まない。

### 公開先のQA

Playwright/Chromiumで390×844と1280×844を確認。#/choresへの未ログイン直接アクセス→ログイン画面→空の登録フォームのローカル入力検証→再読み込みを実行した。実アカウント登録・メール送信・データ書き込みは行っていない。

| 確認                                               | 結果                                      |
| -------------------------------------------------- | ----------------------------------------- |
| 公開URL・タイトル・todo-check識別子                | 成功                                      |
| 非空画面・framework overlayなし                    | 成功                                      |
| pageerror/console errorなし                        | 成功                                      |
| 未認証のToDo/ナビ非表示・Emulator警告なし          | 成功                                      |
| 操作後の入力エラー・再読み込み後のログイン画面     | 成功                                      |
| 390/1280pxで横はみ出しなし・スクリーンショット保存 | 成功                                      |
| 未認証Firestore GET（存在しない検証用ID）          | HTTP403 / PERMISSION_DENIED、文書作成なし |

公開先画像は/tmp/futari-todo-public-390.png、/tmp/futari-todo-public-1280.png。認証済みの家事画面はOS一時フォルダーのfutari-tasks-mobile.pngとfutari-tasks-desktop.png（Emulatorの架空データ）。この公開先QA時点では本人確認は未実施で「実装・検証公開済み／実機確認待ち」。後続の本人結果は末尾に追記する。

- 検証公開時の文書検証: npm run check成功（68単体テスト・Lint・整形・型検査・本番ビルド）、git diff --check成功。公開情報の文書更新後にアプリの再デプロイは行っていない。本人へtodo-checkの更新と①〜⑤の手順を案内済み、結果待ち。

## 本人によるiPhone＋Mac確認（2026-10-20）

本人回答: 「すべて想定通り。即時反映されてる」。案内した①〜⑤を成功として記録する。

1. iPhoneで担当＝相手・期限＝今日・優先度＝高のToDoを作成し、Macへ再読み込みなしで反映。両者の担当表示が閲覧者基準で正しい。
2. Macで担当を2人/未担当、優先度を低へ変更し、iPhoneにも反映。
3. ホームの今日の未完了一覧、完了で消去、家事の完了済みから未完了へ戻して再表示。
4. 削除キャンセルで維持、削除確定で両端末から消去。
5. 再起動確認用ToDoを作成して両端末を終了・再起動後も保持。片方のログアウトで非表示、再ログイン後に元の世帯の家事一覧を取得。

反映は即時（本人の体感、未計測）。端末は直近申告のiPhone 16 / iOS 26.2とMac / Chrome（今回変更申告なし、Mac/Chromeの詳細版は未申告）。項目7を完了とし、記録一覧・確認手順・ロードマップ・README・セットアップ・開発ガイドを更新する。実キーボード/safe areaの個別試験や今回案内外の異常系まで本人確認済みとは扱わない。

今回の変更は確認結果の文書のみで、コード・クラウド設定・公開版・保存データは変更しない。npm run checkと差分チェックを実行し、繰り返し家事・掃除スケジュールへ自動では進まない。

- 本人確認記録後の文書検証: npm run check成功（68単体テスト・Lint・整形・型検査・本番ビルド）、git diff --check成功。文書のみ更新し、再デプロイ・クラウド操作は行っていない。
