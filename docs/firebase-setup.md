# Firebaseセットアップ

ローカルのファイル・依存関係は用意済みです。実際のFirebaseプロジェクトはまだ作成・接続していません。

## 1. Firebase Console

1. [Firebase Console](https://console.firebase.google.com/)でプロジェクトを作成。Sparkプランのまま進めます。Analyticsは今回不要です。
2. Webアプリを登録し、表示される設定から`apiKey`・`authDomain`・`projectId`・`appId`を取得。
3. Authenticationで「メール / パスワード」を有効化。メールリンク認証ではありません。
4. Cloud Firestoreのデータベースを作成。**本番モード（Locked mode）**を選びます。データの保存先リージョンは作成前に確認してください。
5. Authenticationの承認済みドメインを確認し、開発に必要なら`localhost`を追加。公開後は利用するHostingドメインも確認します。

まだログインUI・世帯データ機能はないため、ここまで設定しても実データの読み書きは始まりません。

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

作成済みの対象プロジェクトを選びます。CLIが作成する`.firebaserc`で接続先を確認してください。初期状態では実在するIDや仮の本番IDを登録していません。

公開する場合:

```sh
npm run check
npm run firebase -- deploy --only hosting,firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
```

`YOUR_PROJECT_ID`は対象の実際のIDに置き換えます。上記は公開を行う手順であり、今回の環境構築では実行していません。既存プロジェクトに全拒否ルールを上書きすると、そのプロジェクトのFirestore利用が停止するため、新規の専用プロジェクトであることを確認します。

Hostingは`dist/`を配信し、SPAのURLを`index.html`へrewriteします。ハッシュ付きアセットを長期キャッシュし、HTML・Service Worker・manifestは更新確認できる設定です。デプロイ後のHTTPS URLをSafariで開き、共有メニューから「ホーム画面に追加」を選びます。

## 4. ローカルEmulator（任意）

Firestore Emulatorには**Java 21以上**が必要です。Javaはアプリの通常開発・本番ビルドには不要です。この作業環境にはJava Runtimeがないため、今回Emulator本体の起動は未検証です。

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
- ルールが全拒否のため、認証したユーザーもFirestoreの読み書きはできません。
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
