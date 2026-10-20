# 0012: 共有買い物リスト

- 作成日: 2026-10-20（日本時間）
- フェーズ: Phase 1・項目9
- 実装状態: 完了（実装・自動検証・検証公開・本人確認済み）
- ユーザー確認: 確認済み（2026-10-20、①〜⑤すべてok）
- 関連記録: [0011](./0011-cleaning.md)、[0009](./0009-tasks.md)、[製品仕様](../product-spec.md#④-買い物リスト)

## 目的と実装前の方針

承認済み計画の通常買い物リストを実装する。商品名/カテゴリ/数量/単位/項目全体の予算/担当/優先度、購入済み/解除、編集/確認付き削除、リアルタイム共有とホーム5件まで。定期購入品・家計連携・断捨離・繰り返しの削除は対象外。既存データを保持しshopping-checkを既存pwa-checkへ7日間公開、本番Hostingは変更しない。

## 判断と理由

### D1: 数量を正規化した10進文字列で保存

正数・小数3桁まで・最大999999.999。浮動小数演算で誤差を持ち込まず、入力の先頭ゼロ/末尾小数ゼロを除いた文字列を保存する。予算は項目全体の整数円/nullで、0円と未設定を区別し数量は掛けない。単位は空欄可で10文字まで。初期値は数量1/単位個/予算なし/カテゴリその他/担当自分/優先度中。

### D2: 検索と表示上限をFirestoreで適用

未購入はpriority整数3→1・createdAt降順、購入済みはupdatedAt降順。カテゴリは固定5種類でサーバー条件に含める。一覧は100+1、ホームは5+1で追加分を判定し、全件取得・正確な総数・予算集計はしない。必要な4つのクエリ形状のindexだけを追加する。

### D3: 既存の所属とオンラインtransactionで共有

households/{hid}/shoppingItemsへ保存。作成監査を固定し版とサーバー時刻/更新者を検証する。編集/購入/解除/削除は画面の版とtransactionの読取版を照合する。削除のRulesは所属者の権限を検証し、古い画面からの削除防止はサービス側（既存ToDoと同じ）。競合/通信失敗で編集入力を保持する。

### D4: 機能単位で実装し購読を限定

src/features/shoppingへ型/検証/サービス/購読/UI/テストを配置。認証/世帯/画面変更で表示・入力・不要な購読を破棄し、Firebase初期化/担当表示/オンライン判定を共有する。既存機能の保存形式や永続キャッシュは変更しない。

### D5: REDから検証し公開結果と本人結果を分ける

単体・Rulesは失敗するテストから実装。Emulatorで架空2アカウントだけを使い、直接改ざん・他世帯・競合・拒否後不変性を確認する。対象フローは買い物→追加→相手へ共有→購入/解除→編集/削除→ホーム/カテゴリ/追加表示→再起動/ログアウト。Browser plugin not availableのため既存Playwrightで320/390/1280pxを検証する。check/integration/pwa後、クラウド現行Rules/indexを保存して追加反映・ソース一致/READY確認後にプレビュー公開。本人結果なしで完了としない。

## 実際の変更

- src/features/shoppingに正規化/検証・サービス・購読・フォーム/一覧/ホームとテストを追加。既存の担当表示/オンライン判定とFirebase初期化を共有した。
- HomeShellへ買い物画面、HomePanelへ未購入最大5件と入口を組み込んだ。既存の認証/世帯変更時の画面破棄を維持する。
- firestore.rulesへshoppingItems専用権限を追加し、firestore.indexes.jsonへ4クエリ形状のindexを追加。既存機能のRules/スキーマは維持した。
- scripts/test-shopping-rules.mjs、scripts/test-shopping.mjs、Emulatorランナーとnpm run test:shoppingを追加し、既存CIのtest:integrationに含めた。依存追加なし。
- shoppingItemsを旧「未実装パス」テストから新専用権限へ移した。他の未実装パスの拒否は維持する。関連設計・手順・権限表・ロードマップ・記録一覧を更新した。

## 検証結果

- モデル/サービス/UIは未実装モジュール/未接続の画面でRED、Rulesは作成拒否（allow1）でREDを確認してから実装した。
- npm run check成功（103単体テスト・lint・format・型検査・本番ビルド）。数量の正規化/境界、予算のnullと0、担当、入力保持/二重送信、購入/解除/削除確認、追加表示/再試行/購読解除、保存中に別の下書きを開くケースを含む。
- npm run test:integration全体成功。既存22権限シナリオ（追加29正常/649拒否）、ToDo13正常/66拒否、繰り返し31正常/90拒否、掃除27正常/57拒否、買い物14正常/84拒否。shoppingItemsを専用テストへ移したことで旧追加拒否697→649（48件移管）、他のパスの拒否は維持。
- 独立2ブラウザーで追加共有/数量・予算・担当編集/優先順/購入解除/削除確認・確定/古い編集・削除の拒否/通信復帰/再読み込み/ログアウト再ログインが成功。カテゴリをサーバー条件に含む未購入103件/購入済み103件の追加表示と、ホーム5件+追加分案内も確認した。Emulatorの架空アカウントのみ、実メール送信なし。
- npm run test:pwa成功。静的キャッシュ・オフライン・更新延期/再通知/適用を維持。
- Browser plugin not availableのためPlaywright/Chromium。320/390/1280pxで横はみ出しなし、本文末尾と下部ナビの重なりなし。モバイルとデスクトップ画像をOS一時フォルダーへ保存して目視確認。実iPhoneは未確認。

## 指摘と対応

まだ指摘はありません。

## 本人に確認してほしい点・未解決事項

iPhone＋Macの既存テスト用2アカウントで①〜⑤の本人確認済み。項目9の未解決事項なし。定期購入品・断捨離・繰り返し家事の削除へ自動で進まない。

## 自動検証での指摘と対応

- R1（対応済み、Codex）: Firestoreのクエリ配列の推論型がwhere/limitに限定されたため、QueryConstraint[]を明示した。型検査と購読テスト成功。
- R2（対応済み、Codex）: フォームと一覧のエラーが同時に存在するケースでブラウザーテストのstatus取得が複数になったため、フォーム内の案内を対象にして通信復帰テストを再実行した。
- R3（対応済み、Codex）: 既存リストからの導入時に残った誤ったimport先を修正し、全単体/ブラウザーテストを再検証。業務仕様の変更はない。

## クラウド反映（2026-10-20）

- futari-kurashi-5fcab9、billingEnabled=falseを確認。反映前Rules/参照はGit対象外の.tools.local/rules-backups/0012-beforeへ保存。
- 反映前Ruleset: bcfaa4f4-8507-47d9-8fdb-1236ed74ff0e、SHA256: 0ec2bb352310028fdaafaca4461887952d0509b7682055f8f7c2c69910b73ad3（項目8Bの公開ソースと一致）。
- 反映後Ruleset: 883074a4-c777-4bfd-81d3-de4f8eb18226、更新2026-10-20 15:03（日本時間、UTC 06:03:56.611756）。SHA256: 593ce748fd43b0ff0a5f9c29e53ec18f1d93661d6efd6a5f201335b3a8f5e207、ローカルとの完全一致を確認。
- shoppingItemsの追加4件はpurchased/priority/createdAt（CICAgNi47oMK）、purchased/category/priority/createdAt（CICAgNiav4AK）、purchased/updatedAt（CICAgNjpgYIK）、purchased/category/updatedAt（CICAgNiroIEK）。purchased/categoryは昇順、priority/日時は降順、COLLECTION。既存5件を保持、fieldOverrides=[]、削除なし。READYは公開前に確認する。
- CLIのfirestore:indexesとfirestore:rulesでプロジェクトIDを明示して個別反映した。Auth設定・既存データ・本番Hostingは維持。実クラウドでの自動アカウント作成/メール送信は行わない。

- 公開前のnpm auditは既知の12件（high 8 / moderate 4 / critical 0）。記録0005/ロードマップの既存依存警告と件数同一で、今回の依存追加・更新はない。互換性を壊すforce修正は行わず既存の更新課題として保持する。

## 検証公開と確認対象

- 全9インデックス（既存5/追加4）のREADY、Rulesソース完全一致・billingEnabled=falseを再確認して公開。
- VITE_USE_FIREBASE_EMULATORS=false、VITE_APP_BUILD_LABEL=shopping-check、専用プロジェクトIDを確認してビルド成功。公開設定値や秘密情報の出力なし。
- 公開コマンド: `npm run firebase -- hosting:channel:deploy pwa-check --expires 7d --project futari-kurashi-5fcab9 --no-authorized-domains --non-interactive --json`。
- URL: https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app
- 識別子shopping-check、Hostingバージョン933f6555f2ffcf0c、有効期限2026-10-27 15:10（日本時間、UTC 06:10:03.112519827）。
- プレビュー期限後もFirestore/Rules/データは保持。本番Hostingと既存データは変更せず、実クラウドでの自動アカウント作成/メール送信/生活データの追加や削除は実施しない。

- 公開URLをPlaywrightの390/1280pxで検証。URL/タイトル/shopping-check、非空表示、認証前のshopping直接アクセス制御、入力不備と再読み込み、横はみ出しなし、Emulator警告/overlay/runtime/console errorなしを確認した。匿名Firestore取得は403 PERMISSION_DENIED。実アカウント/メール/生活データの書き込みなし。
- 文書反映後のnpm run checkも103件成功、git diff --check成功。バックアップのGit対象外も確認。本人結果は未確認のため、[確認手順](../shopping-verification.md)の①〜⑤を案内し、実装・検証公開済み／実機確認待ちで止める。

## 本人確認の反映（2026-10-20）

- 更新前の方針: ①〜⑤への本人回答「すべてok」を根拠に、実装記録・確認表・記録一覧・ロードマップ・README・Firebase手順・AGENTS.mdの状態を完了へ更新する。コード/クラウド設定/データは変更せず、文書整合性とnpm run checkで確認する。
- 本人結果: 更新/追加/再読み込みなしの共有/担当表示、数量0.5/単位/予算0円/カテゴリ/優先度編集と絞り込み・並び順、購入済み/解除とホーム反映、削除キャンセル/確定、再起動/ログアウト/再ログインの①〜⑤すべてを本人確認済み。反映時間の数値計測は未実施。
- 端末は直近申告のiPhone 16 / iOS 26.2＋Mac / Chrome（変更申告なし）。ホーム6件以上の追加案内は自動検証済みで、今回の必須実機確認には含めていない。
- 項目9を完了とする。定期購入品・断捨離・繰り返し家事の削除へ自動では進まない。
- 本人確認の文書反映後のnpm run check成功（103単体テスト・lint・format・型検査・ビルド）、git diff --check成功。コード変更・再公開なし。
