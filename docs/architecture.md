# 設計方針

## 現在の構成

React / TypeScriptのSPAをViteでビルドし、Tailwind CSSのViteプラグインでスタイルを生成します。PWAのmanifest・Service Workerはvite-plugin-pwaで生成します。SDKはFirebaseのモジュラーAPIを使用します。パッケージの実際のバージョンは`package.json`と`package-lock.json`を参照してください。

ルーターや状態管理ライブラリは、複数画面の実装時に必要性を判断します。初期画面は環境構築の確認用であり、ダッシュボードの完成形ではありません。

### 機能の分離

- `src/app`: アプリの起動、将来のルーティング・プロバイダー・レイアウト。
- `src/components`: 機能をまたいで使うUI。
- `src/features/<feature>`: 今後の認証・世帯・家事・買い物・片付け・家計・ルール。必要になった段階で追加。
- `src/lib/firebase`: 環境変数検証と外部サービスのクライアント。

コンポーネントからFirebaseの初期化を繰り返さず、認証は`getFirebaseAuth()`、データ機能は互換APIの`getFirebaseServices()`で共有します。Authは遅延ロードする認証画面のチャンクにまとめ、Firestoreはデータ機能の初回利用まで初期化しません。認証状態の購読はProviderで管理し、アンマウント時に解除します。

## Firebase設定

`readFirebaseConfig()`は未設定・不足/不正・設定済みを区別します。必須項目はAPIキー・Authドメイン・プロジェクトID・アプリIDです。Analytics、Storage、Messagingは初期段階では使わないため追加しません。

`VITE_USE_FIREBASE_EMULATORS`は未指定・`false`・`true`のみ受け付けます。誤記を本番への接続として黙って扱わない設計です。設定完了だけではネットワーク接続を行いません。SDKを使う機能から`getFirebaseServices()`を呼び出してください。

## 世帯データの構成（所属・招待・ToDoを実装済み）

世帯IDをデータ分離の単位にし、各データは`households/{householdId}/...`配下にまとめる方針です。所属・招待は下記の専用スキーマで実装済みです。tasksは項目7、recurringTasks/recurringCompletionsは項目8Aで実装し、項目8Bの掃除も同じ定義/履歴を使います。shoppingItemsは項目9、declutterItemsは項目10で実装し、financeCategories/incomes/expensesはPhase 2項目1で実装済み。それ以外は設計候補・未実装です。

```text
users/{uid}                         本人の所属（プロフィールは未実装）
householdInvites/{code}              メール指定の招待（24時間・1回限り）
households/{householdId}             世帯とメンバー（上限2人）
  tasks/{taskId}                     ToDo・家事
  recurringTasks/{definitionId}      繰り返し家事・掃除の定義
  recurringCompletions/{historyId}   実施履歴・取消記録
  shoppingItems/{itemId}             買い物
  declutterItems/{itemId}            断捨離
  financeCategories/{categoryId}     収入・支出カテゴリ
  expenses/{expenseId}               支出記録
  incomes/{incomeId}                 収入記録
  budgets/{budgetId}                 月間・カテゴリ予算
  houseRules/{ruleId}                Phase 2: 家のルール
```

- 担当者は表示名でなくUIDで保存し、「2人」を表せる形にする。
- `createdAt` / `updatedAt` / 更新者などの監査情報を設ける。
- 月別集計や日付境界はAsia/Tokyoを前提に設計する。
- 金額は日本円の整数で管理し、負担率と丸め方・端数の帰属を精算機能の実装前に確定する。
- 繰り返し設定と完了履歴を分離し、2台からの同時操作で履歴・次回タスクを二重生成しない。
- 招待は128bit乱数コードと確認済みメールの一致が必要。作成者が発行/取消でき、有効な招待は1件。再発行で旧コードを失効する。
- 2人という上限はUIだけでなくSecurity Rulesとtransactionを組み合わせて強制する。
- スキーマ変更では既存データを維持する。エクスポート・復元を後で実装できる形にする。

## セキュリティ

リポジトリの`firestore.rules`は本人の所属・世帯・招待・世帯内ToDo・繰り返し定義と履歴・買い物・断捨離・収支/カテゴリ・予算を限定許可し、それ以外のパスを全拒否にしています。メール確認済みであることをRulesでも必須とし、他世帯・メンバー改ざん・3人目・二重所属を拒否します。Firestore Emulatorと`@firebase/rules-unit-testing`で検証します。項目5で東京のFirestoreを新規作成し、同じRulesをクラウドへ反映・ソース照合済みです。

FirebaseのWebアプリ設定はクライアントに公開される識別情報です。APIキーだけでデータを守る設計にせず、AuthとSecurity Rulesをアクセス制御の根拠にします。管理者用秘密鍵・サービスアカウントはフロントエンドで使用しません。

現時点ではFirestoreの永続オフラインキャッシュを有効にしていません。端末へのデータ残存やログアウト時の取り扱いはオフライン機能追加時に検討します。

## PWA

- `display: standalone`、日本語名、192 / 512pxのPNG、maskableアイコン、iPhone用180pxアイコンを用意。
- `viewport-fit=cover`とsafe areaに対応。
- Service Workerは本番ビルド時のみ生成。キャッシュは静的アセットに限定。
- Firebase APIレスポンスや生活データをService Workerのruntime cacheに保存しない。
- `/__/`へのナビゲーションはSPA fallbackの対象外にする。
- 更新はユーザーに確認し、更新ボタンで適用。入力途中の強制リロードを避ける。
- SW登録後・前面復帰・オンライン復帰に更新を確認する。同時確認を重複させず、オフラインでは通信しない。「あとで」を選んだ更新は、次回の前面復帰時に再通知する。
- 適用中は連打を防ぎ、適用失敗後は同じ画面から再試行できる。画面のアンマウント時は確認イベントの購読を解除する。
- 確認画面のビルド識別子は`VITE_APP_BUILD_LABEL`、未指定時はpackage.jsonのバージョン。実機で新旧ビルドを区別するために表示する。
- 静的シェルのキャッシュと、業務データのオフライン対応は別々に扱う。後者は未実装。

## 無料運用

Firebase Sparkを前提とし、Cloud Functions・Cloud Storage・自動銀行連携を導入しません。Firestore購読は必要な範囲に絞り、一覧の無制限読み込みを避けます。公開前・運用中にFirebase Consoleで読み書きとHosting転送量を確認します。無料枠を超えないことを無条件に保証する設計にはしません。

## 公式資料

2026-10-19の環境構築時に参照した資料です。

- [Viteの導入](https://vite.dev/guide/)
- [Tailwind CSSのViteプラグイン](https://tailwindcss.com/docs/installation/using-vite)
- [Firebase Webアプリ設定](https://firebase.google.com/docs/web/learn-more)
- [Security Rulesの基本・Locked mode](https://firebase.google.com/docs/rules/basics)
- [Vite PWAの更新確認](https://vite-pwa-org.netlify.app/guide/prompt-for-update)

## 認証（Phase 1・項目2）

`src/features/auth/`に画面・Provider・入力検証を配置。初期確認中、未ログイン、未確認メール、ログイン済み、初期化エラーを区別します。Authの永続保存はFirebase SDKのブラウザー既定を使い、パスワードを独自保存しません。Safariとホーム画面アプリの保存領域の共有は前提にしません。

登録後の確認メール送信だけが失敗してもアカウントを作り直さず、再送で回復します。「確認しました」でreloadとIDトークンの強制更新を行います。再設定メールは登録の有無を断定しない案内を表示します。確認・再設定ページはFirebase標準を使用し、実メールを使う操作はユーザー本人が行います。

メール確認前の制御はUI上の認証ゲートです。世帯のSecurity Rulesは項目3〜4でローカル実装・検証し、項目5で東京のFirestoreへ反映しています。Firebaseクラウド設定と公開・実機検証の進捗は[実装記録0004](./implementation-log/0004-email-auth.md)を参照してください。

## 世帯と招待（Phase 1・項目3）

`src/features/household/`に状態・サービス・UI・テストを配置しました。認証済みの表示からUIDをkeyにProviderを生成し、メール未確認・ログアウト・別アカウントへの切り替えで破棄します。所属を購読し、所属があれば世帯も購読します。書き込み未確定のsnapshotは表示せず、保存確定時のmetadata更新を受け取ります。

| 文書                    | フィールド                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| users/{uid}             | householdId、createdAt                                                                                        |
| households/{id}         | name、ownerId、memberIds（作成者→参加者の順・最大2人）、activeInviteId（未発行/取消/参加後はnull）、createdAt |
| householdInvites/{code} | householdId、householdName、createdBy、targetEmail、createdAt、usedBy、usedAt（未使用の2項目はnull）          |

作成時は世帯と本人所属、発行時は招待と有効招待ID、参加時は招待消費・本人所属・世帯更新をtransactionで一括処理します。getAfterで更新後の整合性を強制し、部分的な書き込みを拒否します。所属文書は作成後の変更・削除を許可しません。参加者は招待を読むだけで世帯名を確認でき、参加前の世帯自体の読み取りは許可しません。招待確認もサーバー読み取りtransactionを使い、参加時には再検証します。

メールはtrim/lowercaseで比較し、UIDはAuthの値を使います。作成者以外は招待を変更できず、対象者だけが未使用かつ有効な招待を消費できます。全コレクションの一覧取得は拒否。期限はcreatedAt（serverTimestamp）から24時間未満をrequest.timeで判定します。旧・取消済み・使用済みの招待文書は残りますが使用できません。定期削除やTTL課金機能は追加していません。

SDKの診断警告に文書パス＝コードが含まれるため、アプリのFirestoreログはsilentとし、失敗はUIで案内します。個人情報や招待はService Workerのキャッシュ対象にしません。詳細と検証は[実装記録0005](./implementation-log/0005-household.md)・[世帯検証手順](./household-verification.md)を参照してください。

## 権限の追加検証（Phase 1・項目4）

[権限表](./firestore-permissions.md)を基準に、2世帯の両方向の隔離、本人所属、対象メールの事前確認、一覧/条件検索/コレクショングループ検索の拒否、直接書き込み・原子的更新の分解/混合を検証しています。拒否した書き込みでは全所属・世帯・招待と対象未実装文書が変わらないことも確認します。同時作成・参加・取消・再発行では成功件数だけでなく敗者の拒否理由と保存後の整合性を検証します。

招待先メールのRules正規表現は、半角スペースに加えてタブ・改行などの空白も拒否するよう修正しました。スキーマ・APIは変更していません。既存世帯の所属者でも自分宛ての有効招待は確認できますが、参加・所属の変更は拒否します。実装理由・テストは[記録0006](./implementation-log/0006-firestore-permissions.md)に記載しています。項目4時点ではクラウド未反映でしたが、項目5で反映とソース照合を完了しました。2026-10-20にiPhone＋Mac／Chrome・テスト用2アカウントで共有・再起動・通信復帰・ログアウト/再ログインを本人確認済みです。2台目のiPhoneは未実施です。

## 実クラウドへの接続（Phase 1・項目5）

専用プロジェクトの(default)はStandard / FIRESTORE_NATIVE / asia-northeast1です。無料枠対象、請求先未接続、PITR無効、削除保護有効。sharing-checkは既存pwa-checkに7日間公開し、実際のAuthとFirestoreへ接続します。プレビュー期限後もDB・Rules・アカウント・世帯を保持します。項目5時点では本番Hostingチャネルに未公開でした。共有対象は所属と世帯情報だけで、項目5時点では家事等を全拒否としました。項目7ではToDoだけを追加許可し、それ以外の業務データは引き続き拒否します。[記録0007](./implementation-log/0007-realtime-sharing.md)と[実機確認手順](./realtime-sharing-verification.md)を参照してください。

## ホームとナビゲーション（Phase 1・項目6）

認証/メール確認後、既存HouseholdProvider内の所属ゲートでホームの表示を判断します。未所属・取得中・取得失敗では既存準備画面を表示し、所属後だけ6画面のナビゲーションを出します。ホームと設定は同じ購読結果を読み、画面移動でFirestore購読を増やしません。

src/appのハッシュナビゲーションは#/home、#/chores、#/shopping、#/declutter、#/finances、#/settingsを使用。不明な値はホームへ正規化します。初回の保存済みセッションでは直接アクセス先を維持し、認証UID変更と新規世帯参加時はホームへ戻します。履歴移動を購読し、切り替えで見出しフォーカスと先頭スクロールを行います。依存パッケージ、API、Rules、保存スキーマは変更しません。

項目6時点のホームは実際の世帯と入口だけを表示しました。現在は項目7以降で今日のToDo・今日/持ち越しの家事・未購入・今日までが期限の未処分も表示します。家計はPhase 2項目1の収支記録と項目2の予算を表示します。設定の既存招待フォームは画面を離れるとアンマウントし入力を破棄します。メールは設定か準備画面だけに表示。下部メニューはsafe areaと本文の余白を確保し、PWA更新通知はその上へ表示します。[記録0008](./implementation-log/0008-home-navigation.md)と[確認手順](./home-verification.md)を参照してください。

## ToDo（Phase 1・項目7）

src/features/tasksにモデル・サービス・画面・購読・日付フックとテストを配置。家事とホームで必要なクエリだけを購読し、画面移動・UID/世帯変更で破棄する。家事はcompleted条件とcreatedAt降順、ホームはcompleted=falseとdueDate=日本時間の今日・createdAt降順。取得上限+1件から追加表示可否を判定する。日本日付はAsia/TokyoのIntlと日付変更タイマー・前面復帰で追跡する。

保存先はhouseholds/{id}/tasks/{taskId}。title（trim後1〜100 Unicodeコードポイント）、assigneeIds（世帯UIDの重複なし配列・0〜2人）、dueDate（実在するYYYY-MM-DD/null、1000〜9999年）、priority（low/medium/high）、completed（boolean）、version（1以上の整数）、createdAt/createdBy/updatedAt/updatedByを持つ。作成情報は変更不可。2人担当でもどちらかのチェックで共有の完了状態を変更する。

作成/編集/完了/削除はオンラインtransaction。更新/削除は画面が保持するversionと読み直した版を照合し、違えば入力を残して競合を案内する。Rulesは現在の所属と世帯メンバーの両方を確認し、上限指定の一覧・正しいスキーマと監査情報・version+1を強制する。削除にはrequest.resourceがないためRulesは所属による削除権限を検証し、古い版による削除の防止はSDK transactionで実施する。担当による操作権限の制限は設けず、世帯のどちらも操作できる。

データのSWキャッシュ・永続オフラインキャッシュは追加しない。未確認のキャッシュsnapshotと書き込み保留中snapshotは表示せず、オンラインの確定結果を使う。編集中にリストが変わってもフォームの版を自動更新しない。明示的に編集を開き直すとID+版をkeyとして最新入力へ戻す。[記録0009](./implementation-log/0009-tasks.md)と[検証手順](./task-verification.md)を参照する。

## 繰り返しと履歴（Phase 1・項目8A）

src/features/recurring-tasksに周期計算・サービス・購読・フォーム/一覧/履歴・家事の切り替えをまとめる。通常ToDoはtasksのまま維持し、繰り返し定義はhouseholds/{hid}/recurringTasks/{id}、履歴は同世帯のrecurringCompletions/{id}に分離する。未完了は定義のnextDueDateが表す1件だけで、日々の生成やバックエンド定期処理は行わない。

定義はtitle/assigneeIds/priority、frequency（daily/weekly/monthly）、startDate、nextDueDate、active、version、lastCompletionId、lastAction、createdAt/createdBy/updatedAt/updatedBy。開始日と次回日は実在日かつ周期上の日付。設定編集では次回予定を明示的に選び直し、過去の履歴を変更しない。

履歴IDは定義ID_更新後version。scheduleId/scheduleVersion、完了時点のtitle/assigneeIds/priority/frequency/startDate、scheduledDate/nextDueDate、completedAt/completedBy、cancelledAt/cancelledByを保存。完了は定義と履歴、取消は定義の予定復元と履歴の取消記録を原子的に更新。履歴本体を編集・削除しない。

次回はmax(今回予定,日本時間の完了日)より後の最初の周期日。月末丸めは元の開始日の日付を維持する。Rulesはrequest.time+9時間の日付から同じ計算を独立検証し、lastActionで編集・完了・取消を区別する。編集/停止/再開と取消は参照をnullにし、過去の完了をさらに巻き戻せない。早期完了も可能。

一覧は定義/履歴100件、ホームはactive=trueかつnextDueDate<=日本時間の今日を10件ずつ。履歴は表示中の未取消記録に対応する定義をIDで重複排除して単体購読し、現在の版と直近参照で取消可否を判定。全購読は画面・認証・世帯変更時に解除する。[記録0010](./implementation-log/0010-recurring-tasks.md)と[検証手順](./recurring-verification.md)を参照。掃除スケジュール/担当交代は8B。

## 掃除と担当交代（Phase 1・項目8B）

既存recurringTasks/recurringCompletionsへtaskType（general/cleaning）、place、rotation（fixed/alternate）の3項目を追加する。全項目がない旧形式はgeneral/空文字/fixedとして扱い、一括移行せず編集で新形式を保存する。新形式は3項目全て必須、場所ありならcleaning、なしならgeneral。履歴は完了時点の追加項目と完了前の担当を保持し、過去の履歴を書き換えない。新サービスは旧定義の完了でも一般/空文字/固定を新履歴に明示保存する。旧クライアントが旧定義に旧形式の履歴を残す互換性も維持するが、新形式の定義から項目を欠落させた履歴は拒否する。

完了は現在担当以外へ交代し、実行者とは独立。交代時はtransactionで世帯メンバーも読み、2人・現在担当1人を確認する。定義更新・履歴作成・次回予定・担当交代をまとめ、取消では履歴の担当と予定を戻す。Rulesでも同じ交代先と原子性を強制する。追加項目を消す旧版保存や交代しない旧版完了は拒否される。固定担当の既存データも通常ToDoも維持する。

src/features/cleaningの今日/今週画面は、稼働中の掃除かつnextDueDate<=対象末日を取得し、場所を指定した場合はその完全一致もサーバー条件へ含める。100件+1で追加表示を判定し、未取得分の総数を表示しない。今週は日本時間の月〜日。現在の未完了1件だけを操作でき、持ち越しを今日完了した想定で、残りの週内の周期・交代担当を参考表示する。未来文書や未実施履歴は生成しない。日付変更・前面復帰で期間を更新し、入力は保つ。場所の管理用コレクションや定義削除は追加しない。[記録0011](./implementation-log/0011-cleaning.md)と[確認手順](./cleaning-verification.md)を参照。

## 共有買い物リスト（Phase 1・項目9）

src/features/shoppingに検証・サービス・購読・フォーム/一覧/ホームをまとめ、households/{hid}/shoppingItems/{id}へ保存する。title、category（food/daily/furniture/appliances/other）、quantity（正規化した正の10進文字列、小数3桁・最大999999.999）、unit（トリム済み0〜10文字）、budget（整数円0〜999999999/null）、assigneeIds（重複なし世帯UID配列0〜2）、priority（低1/中2/高3）、purchased、version、createdAt/createdBy/updatedAt/updatedByを持つ。予算は項目全体の見積もりで、数量倍や家計の実支出への自動登録はしない。

新規は未購入/版1/サーバー監査時刻、編集/購入状態変更/削除は画面のversionをtransactionの最新読取と照合し、古い版は入力を残して拒否する。削除は完全削除で確認操作を必要とするが、Rulesでは所属による権限を検証し、古い版の削除防止はサービス側（通常ToDoと同様）。履歴/復元は今回追加しない。

未購入はpurchased=false・priority降順・createdAt降順、購入済みはpurchased=true・updatedAt降順。必要に応じカテゴリ完全一致を加え、4形状のCOLLECTION複合インデックスを用意する。一覧100件+1、ホーム5件+1でmoreを判定。クライアント側でカテゴリを間引かず、正確な総数や総予算を推測しない。ホームは購入操作と買い物画面への入口を表示する。購読は画面と認証/世帯変更で解除し、キャッシュ由来/保留中snapshotは表示しない。永続オフラインキャッシュは追加しない。[記録0012](./implementation-log/0012-shopping.md)と[確認手順](./shopping-verification.md)を参照。

## 共有断捨離リスト（項目10）

src/features/declutterに型・検証・Firestoreサービス・購読・フォーム/一覧/ホームを配置する。households/{hid}/declutterItems/{id}の14フィールドはtitle、method（discard/sell/give/hold）、ownerIds（現在の世帯UID配列0〜2・重複不可）、dueDate（日付/null）、sortDueDate（日付/`~`）、completed、completedAt、completedBy、version、createdAt/createdBy/updatedAt/updatedBy。品名はトリム済み1〜100文字。期限は日本時間基準の実在日。所有者未設定と未担当を区別し、所有者から完了記録者を推測しない。

未処分はcompleted=false・sortDueDate昇順・createdAt降順。期限なしは`~`で末尾になり、RulesがdueDateとの一致を強制する。処分済みはcompleted=true・completedAt降順。両方とも任意のmethod完全一致をサーバー条件に追加する4形状の複合インデックスを定義する。一覧は100件+1、ホームはcompleted=false・sortDueDate<=日本時間の今日で5件+1を取得し、総件数を推測せず追加案内だけを表示する。ホームは表示と片付けへの入口のみ。useTokyoDayで深夜と前面復帰時の条件を更新する。

新規は未処分・完了日時/記録者null。保留の完了を拒否し、false→trueはrequest.timeと操作UID、true→trueの通常編集は従前の完了監査を保持、true→falseだけnullへ解除する。再完了は新しい監査に置き換える。全履歴は持たず、完全削除では完了情報も消える。処分済みの保留への編集は先に未処分へ戻す。

編集/完了/解除/削除はtransactionで表示時の版を照合し、競合で入力を保持する。削除時の版照合はサービス側、Rulesの削除許可は同世帯所属の検証。作成情報は不変、変更は版+1とサーバー監査を必須にする。確認済み同世帯だけに単体取得/上限付き一覧/書き込みを限定し、他世帯・未所属・未確認・未認証・未実装パスは拒否する。認証/世帯/画面変更で購読・表示・入力を破棄し、オンライン時だけ書き込む。Firestore永続キャッシュは追加しない。

買い替え候補・写真・売却金額・買い物/家計連携は未実装。[記録0013](./implementation-log/0013-declutter.md)と[確認手順](./declutter-verification.md)を参照。

## 本番公開と無料枠の確認（項目11）

Firebase Hostingのliveへphase1-releaseを初回公開。標準URLはhttps://futari-kurashi-5fcab9.web.app 、期限なし。フッターはアプリ名とビルド識別子を残し「開発中」を削除した。新規API・保存形式・権限・購読・依存追加はない。

previewとliveは同じFirebase Auth/Firestoreへ接続するが、originが違うためログイン状態・Service Worker・ホーム画面アイコンは自動移行しない。ユーザーは本番URLへログインし直し、iPhoneでホーム画面へ追加し直す。既存のクラウドデータは引き続き使う。静的キャッシュだけを維持し、個人データの永続オフライン保存は追加しない。

無料枠はAPI/Consoleの実測日時と対象期間を記録し、欠測を0としない。Hostingはプロジェクト全体、日次/月次転送と保持済み版の容量も対象。Firestore日次枠は太平洋時間基準。請求先未接続を維持し、課金・有料監視・定期バックエンドを追加しない。現在の枠内と将来の無料運用保証を区別する。本番①〜⑤は2026-10-20に本人確認済み。2026-10-21にFirestore保存40,947bytesを確認。月次送信量は未計測だが、ユーザー判断によりこの制約を明記してPhase 1を完了した。全指標の無料枠内を確認した意味ではない。[判断0017](./implementation-log/0017-phase1-close.md)と[測定0015](./implementation-log/0015-firestore-usage.md)を参照。[記録0014](./implementation-log/0014-production-release.md)と[確認手順](./release-verification.md)を参照。

## 家計の記録（Phase 2・項目1）

`src/features/finance/`に検証・Firestoreサービス・購読・フォーム・月別表示をまとめる。標準カテゴリは世帯ごとにtransactionで冪等初期化する。カテゴリ文書は`financeCategories/{categoryId}`でtype/name/archived/standard/versionと監査項目を持つ。収入・支出は`incomes/{id}`と`expenses/{id}`に分け、type、title、amount（1〜999,999,999円の整数）、date（日本日付）、categoryId、memo（最大500文字）、version、監査情報を保存する。

月別一覧は日付降順・作成日時降順のクエリを種類ごとに購読し、最大10,000件までを対象に収入・支出合計を算出する。上限に達した場合は合計が取得範囲内である旨を表示する。更新/削除はトランザクションで版を照合し、アーカイブカテゴリは既存明細の同カテゴリ維持に限り更新で利用できる。カテゴリは削除せずアーカイブし、過去の分類を保つ。確認済み同世帯メンバーのみが上限付きでアクセスできる。予算・ホーム金額表示は下記項目2で追加。支払者、負担割合、精算、買い物連携は未実装。[記録0018](./implementation-log/0018-finance-records.md)・[確認手順](./finance-verification.md)を参照。

## 予算とホームの家計（Phase 2・項目2）

家計機能内のbudgetModel/budgetService/useBudgets/BudgetPanelとHomeFinanceで実装する。世帯配下budgetsの文書IDは`YYYY-MM__total`または`YYYY-MM__category__カテゴリID`。保存フィールドはmonth、scope（total/category）、categoryId（全体ならnull）、amount（整数0〜999999999）、version、createdAt/createdBy/updatedAt/updatedBy。月と対象は不変。予算は月ごとで、繰越・収入控除・カテゴリ合計の強制一致は行わない。

更新/解除はtransactionでversionとcreatedAtを照合する。前月コピーは対象ごとのtransactionで対象の未作成・コピー元の現行値・カテゴリの有効性を確認し、失敗件数を報告する。全対象の一括原子更新は行わず、部分成功時も再実行で既存値を上書きしない。アーカイブ後は既存予算を読めるが新規設定/編集/コピーは不可、解除は可能。

対象月の予算は最大101文書＋1件で上限を検出し、不完全な場合は保存操作・正確な残額表示を止める。家計実績は最大10,000件/種類。必要な全購読が準備完了してから確定表示し、失敗した購読を別の購読の成功で上書きしない。上限に達した支出は取得範囲と明示して残額を表示しない。ホームは日本時間の当月支出と月全体予算1文書だけ購読し、月替わり/前面復帰/認証・世帯・画面変更で対象更新と解除を行う。永続キャッシュは追加しない。月条件は単一フィールドの既定索引で取得するため、追加の複合インデックスは不要。[記録0019](./implementation-log/0019-budgets.md)を参照。
