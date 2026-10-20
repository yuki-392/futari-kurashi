# 0007: 2つのアカウント・iPhoneで共有を確認する

- 作成日: 2026-10-19
- フェーズ: Phase 1・項目5
- 実装状態: クラウド設定・検証公開・iPhone＋PCでの共有確認完了（2026-10-20）
- ユーザー確認: 確認済み（D5のiPhone＋PC構成）
- 関連記録: [0005 世帯](./0005-household.md)、[0006 権限](./0006-firestore-permissions.md)

## 目的と実装前の方針

承認済み計画に沿い、専用Firebaseプロジェクトfutari-kurashi-5fcab9でFirestoreを準備し、世帯機能をpwa-checkに7日間公開する。2人が実際に使うアカウントと世帯データを保持し、2台のiPhoneで本人に共有・再起動・復帰・ログアウト/再ログインを確認してもらう。家事・ホーム画面の次項目には進まない。端末・アカウントについては、後述のD5で本人の希望に合わせて変更した。

## 判断と理由

### D1: 保存先は東京・Spark・既定DB

未作成ならStandard/Native・(default)・asia-northeast1で作成する。APIが無効のため有無の取得が403だったので、有効化後に再確認する。既存DBは削除・作り直しをしない。PITR・課金サービスは追加しない。

### D2: 検証済みRulesだけを反映する

npm run check、test:integration、test:pwaを公開前に実行する。既存のRules参照情報を保存し、反映後のソースをローカルと照合する。開放ルールで接続を回避しない。

### D3: 検証チャネルでも実クラウドのデータを保持する

ビルド識別子sharing-check、既存pwa-checkに7日間公開する。公開時はプロジェクトIDと--no-authorized-domainsを明示する。チャネル期限後もFirestore/Rules/アカウントは保持される。本番Hostingチャネルへの公開・データの削除・自動メール送信はしない。

### D4: 実機結果は本人が確認する

Aだけが世帯を作成し、Bは招待で参加する。Aを前面にしたままBが参加し、再読み込みなしで人数が1→2になることを確認する。機種・iOS・結果・反映時間のみを記録し、パスワードやコード・リンクは記録しない。未確認の実機項目は完了扱いにしない。

### D5: iPhone＋PCとテスト用アカウントへ変更する

本人の希望: 「やっぱりアイフォン2台使えないので、アイフォン+PCで行い、アカウントはテスト用のを使いたい」

AをiPhoneのホーム画面アプリ、BをPCの通常ブラウザーとし、別々のテスト用アカウントで確認する。D3/D4のデータ保持・本人操作・再読み込みなしの共有確認を維持し、当初の2台のiPhone・実用アカウントという前提だけを置き換える。登録と確認メール操作は本人が行い、受信できるメールを使う。既存データを削除せず、テストデータも自動削除しない。クラウド設定・アプリコード・公開版の変更は不要。

iPhoneではPWAの再起動、PCでは同じブラウザープロファイルで終了・再起動後の所属維持を確認する。本人によるこの組み合わせの結果を項目5の完了条件とする。2台目のiPhoneでの共有・PWA動作は未実施として区別する。機種/iOSとPCのOS/ブラウザー・結果のみ記録し、秘密情報は記録しない。

## 実施予定と検証

- API有効化・DBの確認/作成、Rules参照の保存と照合、Spark確認。
- 自動テスト3種、Emulator無効のビルド、プレビュー公開、公開画面の識別子確認。
- 本人による2台の実機確認。結果が残れば実機確認待ちで一区切り。

## 実際の変更・結果

- 請求先: API読み取りでbillingEnabled=falseを確認。Firestore APIを有効化し、DB一覧が空であることを確認してから新規作成した。
- 作成DB: projects/futari-kurashi-5fcab9/databases/(default)、東京asia-northeast1、FIRESTORE_NATIVE、STANDARD、freeTier=true、リアルタイム更新有効。作成日時2026-10-19T07:41:09.077292Z（日本時間16:41）。PITR無効。
- 継続利用データの誤削除防止のためDBの削除保護を有効化した。SDK経由のアプリ操作には影響せず、課金サービスの追加はない。
- 変更前のFirestoreリリースはDB作成前/直後とも0件。元のDB・データ・Rulesソースは存在しなかった。Git対象外の.tools.local/rules-backups/0007-before-refs.jsonに空のRules参照と旧Hosting情報を保存した。
- 旧pwa-checkのHostingバージョン: cb54d6c7421fd398。有効期限2026-10-26T04:46:38.653922457Z。本番liveチャネルにリリースがないことも取得時に確認した。
- ローカル設定はprojectId=futari-kurashi-5fcab9、useEmulators=falseを値を絞って確認。sharing-checkビルドでもEmulatorを明示的に無効化。

### Rules反映

- コマンド: npm run firebase -- deploy --only firestore:rules --project futari-kurashi-5fcab9 --non-interactive --json
- リリース: projects/futari-kurashi-5fcab9/releases/cloud.firestore
- Ruleset: projects/futari-kurashi-5fcab9/rulesets/953a2a98-836b-4f81-a04f-4c7e984007f9
- 更新日時: 2026-10-19T07:42:36.035211Z
- SHA-256: 8670f4c557a1e3e4e9fd9aafe408dc559eba23f6d4a60c07f564d1328abb1c04
- APIで公開ソースを読み戻し、ローカルのfirestore.rulesとの完全一致を確認。開放ルールは使用していない。Auth設定・既存アカウントを変更していない。

### 自動検証

- npm run check: 成功（Lint・整形・Vitest43件・型チェック・本番ビルド）。
- npm run test:integration: 成功（Rules22シナリオ・追加分の正常29件/拒否745件・認証/世帯ブラウザーフロー）。実メールを使わないEmulator検証。
- npm run test:pwa: 成功（キャッシュ・オフライン・延期/再通知/更新適用）。
- 既存のFirestore SDKチャンクサイズ警告は継続。今回アプリコード・API・スキーマは変更していない。
- 実機確認: 2026-10-20にiPhone 16 / iOS 26.2＋Mac / Chrome、テスト用2アカウントで全手順の成功を本人確認済み。

## 指摘と対応

不具合の指摘はありません。端末・アカウントの変更希望と対応はD5に記録しました。

## 未解決事項

項目5はD5の構成で完了。2台目のiPhoneでの確認は今回の対象外・未実施。MacのOS・Chromeの詳細バージョンは未申告。反映時間は本人の体感であり計測値ではない。次のホーム画面実装には自動で進まない。

## 検証公開の結果

- ビルド識別子: sharing-check
- チャネル: pwa-check
- [検証URL](https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app)
- 有効期限: **2026-10-26 16:43（日本時間）**（API: 2026-10-26T07:43:40.190607377Z）
- Hostingバージョン: b4809b86c193c2d0
- 本番liveチャネルは変更していない。公開先Chromiumで識別子・未ログイン画面・世帯UIが非表示であること・実行エラーなしを確認。実アカウント登録・メール送信・データ書き込みは行っていない。
- クラウドの未認証読み取りはHTTP403 / PERMISSION_DENIEDを確認。最初の確認リクエストは予約形式の文書IDにより400だったため権限検証に数えず、有効な文書IDに変えて拒否を再確認した。文書は作成していない。

```sh
VITE_USE_FIREBASE_EMULATORS=false VITE_APP_BUILD_LABEL=sharing-check npm run build
npm run firebase -- hosting:channel:deploy pwa-check --expires 7d --project futari-kurashi-5fcab9 --no-authorized-domains --non-interactive --json
```

## 実機確認の進め方

[共有確認手順](../realtime-sharing-verification.md)に各操作と結果表を用意した。当初2台のiPhoneでの準備を依頼したが、本人の希望でD5へ変更した。現在はA=iPhone、B=PCでsharing-checkを開き、別々の確認済みテスト用アカウントでログインし、Aだけがテスト用世帯を作成する。2026-10-20に本人が準備完了を回答。両端末のsharing-check・別の確認済みテストアカウントのログイン・Aだけの世帯作成と1人表示を確認済み。Aは前回と同じiPhone 16 / iOS 26.2、BはMac / Chrome（詳細バージョン未申告）。2026-10-20に続けて本人が「5まで確認できたよ」と回答。コードの発行/コピー・取消・再発行・旧コード拒否・最新コードでの世帯名確認、Bの参加とAの再読み込みなしの1→2人反映、両端末で同じ世帯を確認済み。続けて本人が「5まで全部ok」「ほぼ即時だったと思う」と回答。両端末の終了・再起動後の所属維持、別アプリからの復帰、通信切断後の復帰、Bのログアウトによる表示消去とAの2人表示維持、Bの再ログインによる所属復元を確認済み。人数の反映はほぼ即時（本人の体感、未計測）。プレビュー期限後もFirestore・Rules・アカウント・世帯を保持する。

## 変更履歴

- 2026-10-19: 承認済み計画とD1〜D4を着手前に記録。
- 2026-10-19: API有効化、DB不存在確認後に東京の既定DBを作成。無料枠対象・請求先未接続を確認。Rules反映とソース照合が成功。
- 2026-10-19: 自動テスト3種成功後にsharing-checkを7日間公開。未認証拒否・公開画面を確認し、本人に2台の準備を依頼。実機確認待ち。

- 2026-10-19: 本人の希望でiPhone＋PC・テスト用アカウントへ変更（D5）。確認手順・関連文書を更新。アプリ・クラウド変更なし。

- 2026-10-20: 本人回答「できたよ。アイフォンの機種はさっきと同じ。PCはmacのchrome」を受け、準備完了と端末情報を記録。招待・共有・再起動等の結果は引き続き確認待ち。文書のみ更新し、整形と差分チェックで検証する。

- 2026-10-20: 本人回答「5まで確認できたよ」により、案内した招待・リアルタイム共有の①〜⑤を確認済みとして記録。残りの再起動・復帰・ログアウト/再ログインを案内。文書のみ更新し、整形・差分チェックを実行。

- 2026-10-20: 本人回答「5まで全部ok」「ほぼ即時だったと思う」により残りの全手順成功を記録し、D5の構成で項目5を完了。関連する手順・進捗・設計・セットアップ・記録一覧を更新。アプリコード・クラウド設定・データは変更しない。npm run checkと差分チェックで文書更新を検証する。

## 公式資料

- [Firestoreの保存先と変更制約](https://firebase.google.com/docs/firestore/locations)
- [プレビューと実クラウドのリソース](https://firebase.google.com/docs/hosting/test-preview-deploy)

### 完了時の文書検証

2026-10-20: npm run check成功（Lint・整形・単体テスト・型チェック・本番ビルド）、git diff --check成功。既存のチャンクサイズ警告は継続。今回の変更は確認結果と関連文書のみで、アプリコード・クラウド設定・公開版・保存データの変更はない。
