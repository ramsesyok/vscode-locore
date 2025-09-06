# LoCoRe — 開発者向けドキュメント（src/）

このドキュメントは LoCoRe 拡張の内部構成・実装方針を説明する開発者向けの README です。ユーザー向けの使い方はリポジトリ直下の `README.md` を参照してください。

## 開発環境
- Node / npm を用意
- 依存関係のインストール: `npm install`
- ビルド: `npm run compile`（`out/` に出力）
- 監視ビルド: `npm run watch`
- デバッグ実行: VS Code で F5（Run Extension）
- パッケージング: `npx @vscode/vsce package`

TypeScript は `strict` です（`tsconfig.json`）。

## ディレクトリ構成（主要）
- `src/extension.ts`
  - 拡張のエントリーポイント。初期化とコマンド登録のみを担当。
  - `.codereview/` の存在保証、CommentController 初期化、ストア初期化、復元を呼び出す。
- `src/comment-controller.ts`
  - CommentController の生成・破棄（dispose）
  - 既存スレッドとコメントの復元（`restoreExistingThreads`）
  - スレッド状態更新（`setThreadState`）
  - UI スレッドと永続 ID（threadId）の対応付け（`threadIdMap`）
- `src/review-service.ts`
  - コメントの新規作成/返信（`upsertReview`）
  - JSONL への append と index.json の統計更新、UI 反映を一手に担当。
- `src/review-store.ts`
  - ストレージ層（index.json / review.jsonl）の読み書き・初期化
  - 型定義（`IndexJsonSchemaV1`、`ReviewLogRow` など）
- `src/utils.ts`
  - 汎用ユーティリティ（`generateUuid` など）

## 主要なフロー
1. `activate` → `initializeExtension`
   - `.codereview/` の作成
   - `createCommentController` で CommentController を生成
   - `initializeReviewStores` で `index.json` と `review.jsonl` の存在確保
   - `restoreExistingThreads` で UI にスレッド・コメントを復元（入力ボックスは Collapsed）
2. コメント作成/返信（`upsertReview`）
   - `threadId` 解決（`threadIdMap` → `resolveThreadIdFromIndex`）
   - `review.jsonl` に append
   - `index.json` の統計（`lastSeq`、`commentCount`、`updatedAt`）更新
   - UI スレッドに `vscode.Comment` を追加
3. スレッド状態変更（`setThreadState`）
   - `index.json` の `state` を `open/closed` に更新
   - UI の `thread.state` を `Unresolved/Resolved` に同期
   - `thread.contextValue` を `locore:unresolved/locore:resolved` に切替（メニュー制御）
4. 終了（`deactivate` / `closeCodeReview`）
   - `disposeCommentController()` で CommentController を確実に破棄

## ストレージ仕様
- `index.json`（要点）
  - `version: 1`, `lastSeq: number`
  - `threads[threadId]`: `uri`, `range`, `state`, `createdAt`, `updatedAt`, `commentCount`, `firstSeq`, `lastSeq`, `anchors` 等
  - `byUri[uri]`: `threadId[]`（逆引き用）
- `review.jsonl`
  - 1 コメント = 1 行の JSON（append-only）
  - `threadId`, `commentId`, `seq`, `createdAt`, `author`, `body`

`resolveThreadIdFromIndex` は `uri` と `range` の完全一致で threadId を解決します。

## コマンドとメニュー
- コマンド（`package.json`）
  - `locore.openCodeReview`（サンプル通知）
  - `locore.closeCodeReview`（CommentController の破棄）
  - `locore.createReview` / `locore.replyReview`（入力ボックスのインライン）
  - `locore.resolveThread` / `locore.reopenThread`（入力ボックスのインライン）
- メニュー表示条件（抜粋）
  - Resolve: `commentController == locore-comments && commentThread == locore:unresolved && !commentThreadIsEmpty`
  - Reopen: `commentController == locore-comments && commentThread == locore:resolved && !commentThreadIsEmpty`

`thread.contextValue` を `locore:unresolved / locore:resolved` に設定して、ボタン表示を制御しています。

## 実装上の注意
- 書き込みはワークスペース配下（`.codereview/`）のみ。
- ワークスペースが無い場合はコマンドを早期 return。
- JSON 破損時は既定値での復旧（既定スキーマを生成）。
- JSONL は壊れた行を読み飛ばす設計。

## 将来拡張のヒント
- 編集/削除イベント: JSONL は append-only のため、編集/削除もイベントとして記録し、index で最新状態に解決する方式が安全です。
- パネル UI: 未解決スレッドのみ表示、ファイル別一覧、検索などを Webview/TreeView で提供可能です。
- 形式バージョン: `index.json` の `version` を進め、簡易マイグレーションを実装します。

## 参考コードの所在
- エントリ: `src/extension.ts:1`
- コントローラ（生成/破棄/復元/状態変更）: `src/comment-controller.ts:1`
- ストレージ（入出力/初期化/型）: `src/review-store.ts:1`
- コメント登録サービス: `src/review-service.ts:1`
- ユーティリティ: `src/utils.ts:1`

