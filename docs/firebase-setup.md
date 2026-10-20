# Firebaseセットアップ

専用Firebaseプロジェクト`futari-kurashi-5fcab9`（表示名`Futari Kurashi`）を作成済みです。`.firebaserc`に接続先を設定しています。Webアプリ`Futari Kurashi Web`も登録済みで、`.env.local`に公開設定を用意しました。Authenticationを初期化し、メール/パスワード、最低12文字の必須ポリシー、列挙保護、検証用承認済みドメインを設定済みです。詳細は[認証の検証手順](./auth-verification.md)と[記録0004](./implementation-log/0004-email-auth.md)を参照してください。項目5でFirestoreを東京に作成し、テスト済みRulesを反映しました。2026-10-20に[iPhone＋PC・テスト用2アカウントの共有確認](./realtime-sharing-verification.md)まで本人確認済みです。検証公開は[PWA検証手順](./pwa-verification.md)と[実装記録0003](./implementation-log/0003-pwa-iphone.md)を参照してください。

## 1. Firebase Console

1. [Firebase Console](https://console.firebase.google.com/)でプロジェクトを作成。Sparkプランのまま進めます。Analyticsは今回不要です。
2. Webアプリを登録し、表示される設定から`apiKey`・`authDomain`・`projectId`・`appId`を取得。
3. Authenticationで「メール / パスワード」を有効化。メールリンク認証ではありません。
4. Cloud Firestoreのデータベースを作成。**本番モード（Locked mode）**を選びます。データの保存先リージョンは作成前に確認してください。
5. Authenticationの承認済みドメインを確認し、開発に必要なら`localhost`を追加。公開後は利用するHostingドメインも確認します。

認証は実機確認済みです。世帯機能はクラウド設定と検証用公開まで完了し、iPhone＋PC・テスト用2アカウントでの本人確認も完了しました。Firestoreは(default) / Standard / Native / asia-northeast1 / 無料枠対象 / 削除保護有効 / PITR無効です。課金先は未接続のままです。

## 2. 環境変数

リポジトリのルートで:

```sh
cp .env.example .env.local
```

| 変数                          | Firebase Consoleの値                      |
| ----------------------------- | ----------------------------------------- |
| `VITE_FIREBASE_API_KEY`       | `apiKey`                                  |
| `VITE_FIREBASE_AUTH_DOMAIN`   | `authDomain`                              |
| `VITE_FIREBASE_PROJECT_ID`    | `projectId`                               |
| `VITE_FIREBASE_APP_ID`        | `appId`                                   |
| `VITE_USE_FIREBASE_EMULATORS` | 通常`false`。ローカル検証用modeでは`true` |

環境変数はビルド時に埋め込まれます。編集後はViteを再起動、本番では再ビルドしてください。`.env.local`はGit対象外です。`VITE_`の値は公開されるため、管理者の秘密鍵・パスワードは入れません。

## 3. Firebase CLIと公開

CLIは`devDependencies`に固定しています。

```sh
npm run firebase -- login
npm run firebase -- use --add
```

作成済みの対象プロジェクトを選びます。現在の`.firebaserc`は専用プロジェクトを参照しています。デプロイ時は接続先IDをコマンドでも明示します。

公開する場合:

```sh
npm run check
npm run firebase -- deploy --only hosting,firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

`YOUR_PROJECT_ID`は対象の実際のIDに置き換えます。上記は公開を行う手順であり、今回の環境構築では実行していません。既存プロジェクトに全拒否ルールを上書きすると、そのプロジェクトのFirestore利用が停止するため、新規の専用プロジェクトであることを確認します。

Hostingは`dist/`を配信し、SPAのURLを`index.html`へrewriteします。ハッシュ付きアセットを長期キャッシュし、HTML・Service Worker・manifestは更新確認できる設定です。デプロイ後のHTTPS URLをSafariで開き、共有メニューから「ホーム画面に追加」を選びます。

## 4. ローカルEmulator（任意）

Firestore Emulatorには**Java 21以上**が必要です。Javaはアプリの通常開発・本番ビルドには不要です。この作業環境では`.tools.local/`にJDK 21を用意し、世帯のEmulatorテストに使用します。システムJavaは変更していません。[世帯検証手順](./household-verification.md)に沿って実行してください。

ターミナル1:

```sh
npm run build
npm run emulators
```

ターミナル2:

```sh
npm run dev:emulator
```

- プロジェクトIDは`demo-futari-kurashi`。実在するクラウドプロジェクトを使いません。
- `.env.emulator`にローカル専用の架空設定を収録。mode固有のため通常の`.env.local`より優先されます。シェルでexportした`VITE_`変数はmodeファイルより優先されるので、ローカル検証時は解除してください。
- Emulator UI: [http://127.0.0.1:4000](http://127.0.0.1:4000)
- Authentication: `127.0.0.1:9099` / Firestore: `127.0.0.1:8080`
- Hosting: [http://127.0.0.1:5000](http://127.0.0.1:5000)（先にビルドした内容）
- Vite開発サーバーは通常`http://localhost:5173`。将来SDKを利用する機能は`getFirebaseServices()`経由でEmulatorに接続します。
- ローカルのルールは確認済みユーザーの世帯・所属・招待を限定許可します。業務データのパスは全拒否です。項目5で同じRulesをクラウドにも反映済みです。
- EmulatorはPC自身のloopbackで待ち受けます。この設定ではiPhoneからEmulatorには接続できません。
- データのexport/import指定はしていません。終了後のデータ保持を前提にしないでください。

## 5. 公開前の実機確認

- Safariでのログインと再起動時の認証維持（認証機能実装後）
- ホーム画面への追加・アイコン・standalone表示
- アプリ更新の通知と更新ボタン
- 2人のアカウントでデータ同期（共有機能実装後）
- 別世帯・未認証アクセスが拒否されること（権限テスト追加後）
- Firebase使用量が無料枠内に収まること

## 公式資料

- [Firebase Webアプリの追加](https://firebase.google.com/docs/web/setup)
- [Firebase CLI](https://firebase.google.com/docs/cli)
- [ローカルEmulatorのインストール](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Firestore Emulator](https://firebase.google.com/docs/emulator-suite/connect_firestore)
- [Firebaseの料金・無料枠](https://firebase.google.com/pricing)

## 項目5で実施したクラウド反映

Firestore APIを有効化してDB一覧が空であることを再確認した後、東京の(default)を作成しました。テストモードは使っていません。`deploy --only firestore:rules --project futari-kurashi-5fcab9`でRulesを反映し、APIで公開ソースとローカルの完全一致を確認しました。Auth設定・既存アカウント・本番Hostingチャネルは変更していません。

共有版sharing-checkは[pwa-check](https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app)に2026-10-26 16:43（日本時間）まで公開しました。期限後もFirestore・Rules・アカウント・世帯は保持されます。実施したコマンド、Ruleset ID・ハッシュ・公開バージョンは[記録0007](./implementation-log/0007-realtime-sharing.md)を参照してください。追加の公開やルール変更では、常に影響と対象プロジェクトを確認します。

## 項目6の検証公開

pwa-checkはhome-checkへ更新済み。[同じ検証URL](https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app)、期限2026-10-27 11:06（日本時間）、Hostingバージョン158f2376ce050d83。Emulatorを明示的に無効化し、プロジェクトIDと--no-authorized-domainsを指定した。本番Hosting・Auth設定・Rules・保存データの変更はない。2026-10-20にiPhoneの全確認手順が成功し、[記録0008](./implementation-log/0008-home-navigation.md)と[確認手順](./home-verification.md)に記録する。

## 項目7: ToDoのRulesとインデックス

新しいtasks用Rulesは既存の所属・世帯・招待を維持して追加限定許可する。変更前のRulesソースと参照は.tools.local/rules-backups/0009-beforeに保存済み。2つの複合インデックス（completed+createdAt降順、completed+dueDate+createdAt降順）だけを追加。fieldOverridesやデータ削除は行わない。公開前にインデックスのREADYとRulesソースの一致を確認する。検証コマンドと公開情報は[記録0009](./implementation-log/0009-tasks.md)、本人操作は[確認手順](./task-verification.md)に残す。本番Hostingは変更しない。

ToDo版todo-checkは[pwa-check](https://futari-kurashi-5fcab9--pwa-check-uol8w76f.web.app)へ公開済み。期限2026-10-27 11:56（日本時間）、Hostingバージョン5671b61886b38560。Rulesソース一致と2インデックスREADYは読み戻し確認済み。2026-10-20にiPhone＋Macの全確認手順が成功し、項目7は完了しました。
