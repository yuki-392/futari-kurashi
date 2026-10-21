# Phase 1 本番公開・使用量の確認

## 現在の状態

本番公開・本人確認済み。Phase 1は2026-10-21に完了。2026-10-20にiPhone 16 / iOS 26.2＋Mac／Chrome・既存テスト用2アカウントで本番①〜⑤「すべてok」と本人確認済み。Firestore月次送信量は実測未取得であり、全無料枠の使用量を確認済みという意味ではない。ユーザー判断と制約は[記録0017](./implementation-log/0017-phase1-close.md)、公開情報は[記録0014](./implementation-log/0014-production-release.md)を参照。

- 本番: https://futari-kurashi-5fcab9.web.app （期限なし）、ビルドphase1-release。
- Hostingバージョン: da586cc22659f2a3。公開日時2026-10-20 16:22:14（日本時間）。
- プロジェクト: futari-kurashi-5fcab9、Spark/請求先未接続。
- 同じFirebase Auth/Firestoreに接続し、既存アカウント・世帯・データを保持する。pwa-checkは更新/削除していない。
- 本番URLはプレビューと別originのため、再ログインとホーム画面への追加が必要。既存アイコンから本番へ自動移行しない。

## 公開前の自動確認とコマンド

```sh
nvm use
npm run check
npm run test:integration
npm run test:pwa
npm audit
VITE_USE_FIREBASE_EMULATORS=false VITE_APP_BUILD_LABEL=phase1-release npm run build
npm run firebase -- deploy --only hosting --project futari-kurashi-5fcab9 --non-interactive
```

接続先・Emulator=false・ビルド識別子をビルド前に確認する。checkはビルドも行うため、公開用ビルド後に通常設定のcheckを実行した場合は公開用設定でビルドし直す。公開コマンドはHostingのみ。Rules/インデックス/Auth設定の変更をまとめて公開しない。

本番ドメインはすでにAuthの承認済みドメインへ登録済みで、今回は追加不要。Rulesソース一致・13インデックスREADY・検証済み復旧版の存在を確認した。実クラウドの自動アカウント作成・メール送信・データ書き込みは行わず、統合テストはdemo-futari-kurashiの架空データだけで実施する。

## 本人確認

A=iPhone 16 / iOS 26.2、B=Mac／Chrome。既存のテスト用2アカウントと世帯で確認する。メール・パスワード・招待コード・個人のデータ内容は記録やチャットへ送らない。

1. AのSafariで本番URLを開き、phase1-releaseと「開発中」が消えた表示を確認。共有→ホーム画面に追加し、新しいアイコンから独立表示で起動する。Bも本番URLを開く。
2. 両方で従来の別々のテスト用アカウントへログイン。元の世帯名・人数・保存データが表示され、6画面を移動できることを確認。
3. 既存のテストデータ内で、ToDoの追加/完了、繰り返しまたは掃除の完了/取消、買い物の購入/解除、断捨離の完了/解除を試す。再読み込みせず相手へ反映し、担当/所有者と操作記録者が閲覧者基準で正しいことを確認。通常利用データを消して作り直さない。
4. AのアプリとBのブラウザーを終了/再起動し、ログインと世帯所属・データを維持することを確認。Aでは通信を切って静的画面を再起動できることを確認し、通信を戻す。業務データのオフライン取得/書き込みは対象外。
5. 一方でログアウトするとその端末の世帯データが消え、再ログインすると元へ戻る。もう一方はログインしたままであることを確認。

| 確認                      | iPhone | Mac／Chrome                       |
| ------------------------- | ------ | --------------------------------- |
| 本番URL/ホーム画面追加    | 成功   | URL成功（ホーム画面追加は対象外） |
| 認証/既存データ/6画面     | 成功   | 成功                              |
| 各機能のリアルタイム共有  | 成功   | 成功                              |
| 再起動/静的オフライン表示 | 成功   | 再起動成功（オフラインは対象外）  |
| ログアウト/再ログイン     | 成功   | 成功                              |

本人回答は①〜⑤「すべてok」。結果を根拠に確認済みとし、反映時間を推測しない。本人確認後の使用量（16:38:34日本時間）はHosting保存2,785,778bytes、日次転送1,976,382bytes、月次転送8,552,477bytes、Firestore日次読87/書3/削1。当時の保存容量/月次送信量は未取得だった。2026-10-21の続報では保存容量を取得し、月次送信量のみ未確認（下記参照）。

## 2026-10-21のFirestore再確認

09:53:21.997日本時間にCloud Monitoringで保存容量を取得した。DB `(default)`/東京の`storage/data_and_index_storage_bytes`最新点09:50:00は**40,947bytes（約40KiB）**。データ＋インデックスを含む時点値で、1GiB枠の約0.003814%。保存容量の未確認は解消した。

月次送信量は未取得。Firestore指標定義31件に送信バイト数はなく、Consoleも実測値を表示しなかった。[公式料金説明](https://firebase.google.com/docs/firestore/pricing)は請求データのエクスポートを案内するが、請求先未接続・Sparkを維持し、新しい課金設定は追加しない。Hostingの転送量やHTTPレスポンスサイズを代用しない。ユーザー判断により月次送信量は未計測のまま記録し、項目11/Phase 1を完了扱いにした。調査範囲・時刻・制約は[記録0015](./implementation-log/0015-firestore-usage.md)。続く[記録0016](./implementation-log/0016-firestore-egress.md)で割り当て情報の別経路も調査したが未取得。Spark向け確認経路についての問い合わせ文案を用意したが、ユーザー判断により送信しない。Phase 1は月次送信量未計測の制約を残して完了。[判断0017](./implementation-log/0017-phase1-close.md)。

## 使用量の見方

[使用量と請求](https://console.firebase.google.com/project/futari-kurashi-5fcab9/usage)で正しいGoogleアカウント・プロジェクト・対象月を選ぶ。Firestoreは(default)。Consoleの集計とAPIの指標は期間や更新時点が違う場合があるので、値とともに期間/時刻/取得元を記録する。APIの欠測・反映待ちを0に置き換えない。

| 対象              | 無料枠の基準                                                       | 確認先                                                                                                          |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Hosting保存       | 10GB。実プロジェクトのAPI上限は10,737,418,240 bytes                | Hosting使用量とCloud Monitoring storage/total_bytes                                                             |
| Hosting転送       | 料金表360MB/日、説明10GB/月。Consoleは10GB/月を表示                | 日次/月次のsent_bytes_countとConsoleを両方記録                                                                  |
| Firestore保存     | 1GiB（データ＋インデックス）                                       | Cloud Monitoring data_and_index_storage_bytes。欠測ならConsoleの保存量を確認                                    |
| Firestore日次操作 | 読取50,000、書込20,000、削除20,000                                 | Consoleとdocument/*_ops_count。太平洋時間の深夜リセット                                                         |
| Firestore送信     | 10GiB/月                                                           | 現行Spark構成では実測取得経路が未特定。公式は請求エクスポートを案内するが今回未設定。別サービスの値で代用しない |
| Authメール        | メール確認1,000通/日、再設定150通/日。送信制限は利用者数等でも変動 | FIREBASE_AUTH/メール・パスワードを維持。Identity Platform専用のDAU制限は適用したとみなさない                    |

Hostingの上限はプロジェクト全体で、preview/本番/保持済みリリースを合算する。ドメイン別のDELTAを期間内で合算し、GAUGEは時点値として扱う。同じ上限が各ドメインにあっても上限を足し合わせない。monthly_sentの古いドメイン別値を足して現在の月間総量とみなさない。

最初の利用量観測は記録0014。本人確認後も同じ方法で読み戻す。現在の実測が枠内でも将来の継続無料を保証しない。運用中はまず使用量と請求画面で枠への比率を確認し、増えた場合は対象期間・不要な画面の購読解除・大量取得/再接続・Hosting転送/保持済み版を調べる。今回、定期自動監視・有料アラート・課金先を追加しない。上限接近時も自動課金へ切り替えず、原因と運用を見直す。

根拠: [料金表](https://firebase.google.com/pricing)、[Hosting](https://firebase.google.com/docs/hosting/usage-quotas-pricing)、[Firestore](https://firebase.google.com/docs/firestore/quotas)、[Auth](https://firebase.google.com/docs/auth/limits)、[Cloud Monitoringの指標](https://docs.cloud.google.com/monitoring/api/metrics_gcp_d_h)。確認日2026-10-20、Firestoreの再確認2026-10-21。

## 公開不具合時の復旧

初回本番公開のため、以前の本番リリースはない。本人確認済みdeclutter-checkのHosting版9522053e0ae6cb06がFINALIZEDで保持されていることを公開前に確認した。復旧が必要な場合のみ、版の存在を再確認して次を実行し、公開後のバージョンと表示を確認する。

```sh
npm run firebase -- hosting:clone futari-kurashi-5fcab9@9522053e0ae6cb06 futari-kurashi-5fcab9:live --project futari-kurashi-5fcab9 --non-interactive
```

これは実行済みの復旧ではなく手順。復旧先のフッターはdeclutter-check/開発中に戻る。Firestoreの巻き戻し・Rules変更・データ削除は行わない。今後のリリースでは直前の本番版も記録し、版を指定して復旧する。
