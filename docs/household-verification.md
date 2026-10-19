# 世帯機能・権限のローカル検証（Phase 1・項目3〜4）

[実装記録0005](./implementation-log/0005-household.md)に判断・検証結果を残します。今回はローカルのみです。クラウドのFirestore作成・Rules公開・Hosting公開・実機確認は行っていません。

## 必要な環境

Node.js 24 LTS、npm、JDK 21、Playwright Chromiumを使います。この作業環境では公式TemurinのmacOS arm64 JDK 21を`.tools.local/`へ展開しました（Git対象外）。システムJavaは変更していません。

別環境ではJDK 21を用意し、`JAVA_HOME`を指定してください。テストランナーは`JAVA_HOME`を優先し、未指定なら`.tools.local/jdk-21*`を探し、どちらもなければ通常のPATHを使用します。

```sh
nvm use
npm ci
npx playwright install chromium
npm run check
npm run test:integration
npm run test:pwa
```

`test:integration`はAuth（9099）とFirestore（8080）のEmulatorを起動し、Rules→認証→世帯の順で検証して終了します。ブラウザー用Viteは認証5176・世帯5177を使用します。使用中のポートがあれば既存プロセスを確認してから実行してください。

個別検証は`npm run test:rules`、`npm run test:auth`、`npm run test:household`を使います。Emulatorは`demo-futari-kurashi`専用で、ブラウザー用の環境変数も架空設定に固定しています。実アカウントの作成・実メール送信・管理用キーは不要です。

## 画面を手動で確認する

ターミナル1（必要に応じJAVA_HOMEとPATHを指定）:

```sh
npm run firebase -- emulators:start --only auth,firestore --project demo-futari-kurashi
```

ターミナル2:

```sh
npm run dev:emulator
```

通常の`npm run dev`は`.env.local`のクラウド設定を使用するため、この項目の手動検証には使いません。Emulatorの架空アカウントを作り、Emulator UIの確認リンクでメールを確認します。2人の確認にはブラウザーの独立したプロファイルやシークレットウィンドウを使用します。

1. 確認済みアカウントAで世帯を作り、Bのメールを指定して招待を発行する。
2. コードをコピーして、確認済みアカウントBの画面に貼り付ける。
3. 世帯名を確認して参加し、両画面で2人になったことを確認する。
4. 再読み込みで所属が維持されること、ログアウト・別アカウントへの切り替えで前の世帯が消えることを確認する。

招待は24時間・1回限りです。再発行は旧コードを無効にし、取消もできます。コードや対象メールをスクリーンショット・実装記録に含めないでください。自動テストは架空の値だけを使用し、画面キャプチャはOSの一時フォルダに保存します。

## 権限検証

項目4で権限検証を22シナリオに拡張しました。追加分の正常29件・権限拒否745件と、拒否後の保存結果の不変性、複数世帯の隔離、同時操作の整合性を確認します。権限ごとの期待結果は[権限表](./firestore-permissions.md)、修正理由と結果は[記録0006](./implementation-log/0006-firestore-permissions.md)を参照してください。通常のtest:rulesとtest:integrationに含まれ、追加コマンドは不要です。

## 公開と実機確認

未実施です。クラウドのアクセス設定は従来のままで、ローカルの`firestore.rules`とは別です。後日、専用プロジェクトにFirestoreを準備し、テスト済みRulesの公開と2人のiPhoneでの検証を別途行います。それまでは実機確認済み・本番利用可能とは扱いません。
