# Codex向け開発ガイド

## 最初に読む文書

1. `docs/product-spec.md`: ユーザー提供の企画・全要件。製品仕様の基準。
2. `docs/roadmap.md`: 実装状況と開発フェーズ。仕様と実装済み機能を混同しない。
3. `README.md`: 環境構築・実行・検証の手順。
4. `docs/architecture.md`: 構成、Firebase、セキュリティ、PWAの方針。
5. `docs/firebase-setup.md`: Firebase Consoleでの作業・公開・Emulator手順。

## プロジェクト方針

- 日本語の同棲カップル向け生活管理PWA。利用者は1世帯2人。iPhoneを優先。
- React / TypeScript / Vite / Tailwind CSS / Firebase Auth / Firestore / Firebase Hostingを使用。
- Node.js 24 LTSとnpmを使用。`package-lock.json`を維持し、再現時は`npm ci`。
- Spark無料枠・専用バックエンドなしが前提。課金が必要なサービスは先に要件を再検討する。
- MVPを優先。家計・家のルールはPhase 2、分析・エクスポートはPhase 3。
- UIに架空の生活データを実データとして表示しない。

## 実装ルール

- `src/app`にアプリの構成、`src/components`に共通UI、`src/lib`に外部サービスや設定を配置する。
- 機能追加時は`src/features/<feature>`にUI・ロジック・テストをまとめる。空の雛形を大量に追加しない。
- TypeScript strictを維持。Firebase SDKはモジュラーAPIを利用する。
- Firebase初期化は`src/lib/firebase/client.ts`を使い、複数箇所で初期化しない。
- 業務ロジックや権限制御は失敗するテストから実装し、正常・異常・境界を確認する。
- 変更後は`npm run check`。必要な場合のみ追加テスト・ブラウザー検証を行う。
- 仕様変更・完了機能・重要な設計判断は関連mdにも反映する。

## データとセキュリティ

- 現在のFirestoreルールは全拒否。データ機能追加時は世帯単位のアクセス制御とEmulatorのルールテストを同時に実装する。
- UIの表示制御だけでアクセス制限を済ませない。未認証・他世帯・3人目の参加・メンバーID改ざんを拒否する。
- `.env.local`・サービスアカウント・秘密鍵・トークンをコミットしない。`VITE_`変数はブラウザーに公開される。
- 招待の設計は未確定。招待コードの総当たり・再利用・参加競合を考慮し、ルールを安易に開放しない。
- 個人データをService Workerでキャッシュしない。Firestore永続オフラインキャッシュは現時点では使用しない。
- 本番Firestoreルールのデプロイは既存データへの影響を確認する。全拒否ルールは既存アプリにもアクセス拒否を適用する。

## 作業範囲

環境構築はローカルまで。GitHub Privateリポジトリ・Firebaseプロジェクトは未作成・未接続。公開やリモート変更を実施した場合は実施内容とURLを記録する。
