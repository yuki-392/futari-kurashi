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

## 世帯データの構成（所属・招待のみローカル実装済み）

世帯IDをデータ分離の単位にし、各データは`households/{householdId}/...`配下にまとめる方針です。所属・招待は下記の専用スキーマで実装済みです。家事などのサブコレクションは設計候補であり、未実装です。

```text
users/{uid}                         本人の所属（プロフィールは未実装）
householdInvites/{code}              メール指定の招待（24時間・1回限り）
households/{householdId}             世帯とメンバー（上限2人）
  tasks/{taskId}                     ToDo・家事
  cleaningSchedules/{scheduleId}     掃除の繰り返し設定
  shoppingItems/{itemId}             買い物
  declutterItems/{itemId}            断捨離
  expenses/{expenseId}               Phase 2: 支出
  incomes/{incomeId}                 Phase 2: 収入
  budgets/{budgetId}                 Phase 2: 月間・カテゴリ予算
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

リポジトリの`firestore.rules`は本人の所属・世帯・招待だけを限定許可し、それ以外のパスを全拒否にしています。メール確認済みであることをRulesでも必須とし、他世帯・メンバー改ざん・3人目・二重所属を拒否します。Firestore Emulatorと`@firebase/rules-unit-testing`で検証します。今回クラウド設定・Rules公開は行っておらず、クラウド側の状態は変更していません。

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

メール確認前の制御はUI上の認証ゲートです。クラウドのFirestore設定は未変更です。世帯のSecurity Rulesは項目3でローカル実装・検証しています。Firebaseクラウド設定と公開・実機検証の進捗は[実装記録0004](./implementation-log/0004-email-auth.md)を参照してください。

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
