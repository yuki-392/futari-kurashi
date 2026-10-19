# 設計方針

## 現在の構成

React / TypeScriptのSPAをViteでビルドし、Tailwind CSSのViteプラグインでスタイルを生成します。PWAのmanifest・Service Workerはvite-plugin-pwaで生成します。SDKはFirebaseのモジュラーAPIを使用します。パッケージの実際のバージョンは`package.json`と`package-lock.json`を参照してください。

ルーターや状態管理ライブラリは、複数画面の実装時に必要性を判断します。初期画面は環境構築の確認用であり、ダッシュボードの完成形ではありません。

### 機能の分離

- `src/app`: アプリの起動、将来のルーティング・プロバイダー・レイアウト。
- `src/components`: 機能をまたいで使うUI。
- `src/features/<feature>`: 今後の認証・世帯・家事・買い物・片付け・家計・ルール。必要になった段階で追加。
- `src/lib/firebase`: 環境変数検証と外部サービスのクライアント。

コンポーネントからFirebaseの初期化を繰り返さず、`getFirebaseServices()`で共有します。Auth・Firestore SDKは初回利用時に並列で動的importするため、未使用の確認画面には含まれません。利用開始後の購読は画面のライフサイクルに合わせて解除します。

## Firebase設定

`readFirebaseConfig()`は未設定・不足/不正・設定済みを区別します。必須項目はAPIキー・Authドメイン・プロジェクトID・アプリIDです。Analytics、Storage、Messagingは初期段階では使わないため追加しません。

`VITE_USE_FIREBASE_EMULATORS`は未指定・`false`・`true`のみ受け付けます。誤記を本番への接続として黙って扱わない設計です。設定完了だけではネットワーク接続を行いません。SDKを使う機能から`getFirebaseServices()`を呼び出してください。

## 世帯データの方針（未実装）

世帯IDをデータ分離の単位にし、各データは`households/{householdId}/...`配下にまとめる方針です。以下は設計候補であり確定スキーマではありません。

```text
users/{uid}                         個別プロフィール
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
- 招待方法・失効・再利用防止・競合制御は認証/世帯機能の実装時に設計する。
- 2人という上限はUIだけでなくSecurity Rulesとtransactionを組み合わせて強制する。
- スキーマ変更では既存データを維持する。エクスポート・復元を後で実装できる形にする。

## セキュリティ

現在の`firestore.rules`は全アクセス拒否です。公開データベースは作りません。業務データを追加する際、未認証・他世帯の読み書き、メンバー改ざん、3人目の参加を拒否するルールを同時に実装します。Firestore Emulatorと`@firebase/rules-unit-testing`による権限テストをその段階で追加します。

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
