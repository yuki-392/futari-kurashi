# 0016: Firestore月次送信量の別経路調査

- 作成日: 2026-10-21（日本時間）
- フェーズ: Phase 1・項目11
- 実装状態: 別経路の調査済み・月次送信量は未取得
- ユーザー確認: 未確認
- 関連記録: [0015](./0015-firestore-usage.md)

## 目的と実装前の方針

本人から「月次送信量もできる？」と再依頼。前回のFirestore Monitoring指標/Consoleで未取得だった月次送信量について、別の読み取り経路を調査する。

### D1: Service Usageの割り当て情報を確認する

Cloud MonitoringのFirestore固有指標に送信バイト数がなかったため、Firestoreと関連サービスのconsumerQuotaMetricsに使用量があるか確認する。APIを有効化せず、サービス追加・課金先接続・公開・データ変更は行わない。取得できない場合は値を推測せず限界を明記する。

## 実際の変更・検証

2026-10-21 10:07:16.055日本時間にService Usage v1beta1 `consumerQuotaMetrics.list`を全ページ読み取った。プロジェクトIDをCloud Resource Managerで番号へ解決し、同じ専用プロジェクトで以下を確認した。

| サービス   | 指標数 | 結果                                                               |
| ---------- | ------ | ------------------------------------------------------------------ |
| Firestore  | 16     | 日次無料操作数等の割り当て定義あり。月次送信バイト数なし           |
| Datastore  | 7      | 管理APIの要求上限等のみ。Firestoreの月次送信量なし                 |
| App Engine | 4      | 管理APIとDirect VPCインスタンス数等のみ。Firestoreの月次送信量なし |

`instance_limit_with_direct_vpc_egress`はApp Engineのインスタンス数上限であり、Firestoreの送信量ではない。上限値と使用量も区別する。[公式API仕様](https://docs.cloud.google.com/service-usage/docs/reference/rest/v1beta1/services.consumerQuotaMetrics/list)による割り当て情報の読み取りであり、指標がないことを0バイトと解釈しない。

[Firestore料金の公式資料](https://firebase.google.com/docs/firestore/pricing)も再確認し、ネットワーク使用量の案内は依然として請求データのエクスポートだった。0015と今回の範囲では、Sparkのまま正確な月次egressを取得できる経路を特定できなかった。すべてのSparkプロジェクトで確認不可能、あるいはBlaze変更で必ず取得可能という断定はしない。

生データ・読み取り用一時スクリプトはGit対象外`.tools.local/release-0014/egress-quota-20261021.json`等。トークン・文書内容は保存していない。クラウド設定・API有効化・デプロイ・データ書き込み・サポート送信は行っていない。

### 問い合わせ文案（未送信）

> Firebase Sparkプラン、請求先未接続のプロジェクトで、Cloud Firestore Standard / Native / (default) / asia-northeast1を使用しています。無料枠10GiB/月に対する、当月の実際の送信量を確認したいです。Firebase Consoleでは日次の読み取り・書き込み・削除のみが表示され、Firestoreの帯域幅の実測値は表示されません。Cloud MonitoringのFirestore指標とService Usageの割り当て情報にも送信バイト数を見つけられませんでした。Sparkを維持し、請求先接続やBigQueryを追加せずに月次送信量を確認できる公式の画面/APIがあれば教えてください。提供されていない場合は、その制約も確認したいです。

この文案にはメールアドレス・招待コード・個人データを含めていない。送信するには本人からの明示的な指示が別途必要。実測取得のために課金設定を変えることは提案しない。

文書反映後の`npm run check`成功（Lint・整形・121テスト/24ファイル・型・ビルド/PWA生成）。既存のscrollTo/大きいチャンク警告は継続、失敗なし。アプリ変更がないためEmulator/ブラウザー統合検証は再実行しない。

## 指摘と対応

不具合の指摘はなし。実測できる経路は未確定。

## 未解決事項

月次送信量の実測は未完了。ユーザーは公式窓口への問い合わせを省略し、未計測の制約を明記してPhase 1を完了扱いにすることに同意した。問い合わせ文案は未送信の調査記録として保持する。現在の判断は[0017](./0017-phase1-close.md)を参照。

## 変更履歴

- 2026-10-21: 着手前の方針を記録し、割り当て情報を追加調査。未取得の結果と問い合わせ文案を記録。

- 2026-10-21: ユーザー判断により問い合わせを省略し、未計測を明記してPhase 1を完了扱いにする（[0017](./0017-phase1-close.md)）。
