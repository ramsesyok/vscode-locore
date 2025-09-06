# LoCoRe — Local Code Review for VS Code

LoCoRe は、VS Code のコメント機能を使って、ローカルだけで完結するシンプルなコードレビュー体験を提供する拡張機能です。ネットワーク通信は行わず、レビュー情報はワークスペース直下の `.codereview/` に保存されます。

## 特長
- オフライン動作: ネットワーク不要、すべてローカルに保存。
- かんたん: VS Code 標準のコメント UI に統合。
- 永続化: `.codereview/index.json` と `review.jsonl` に保存・再読み込み時に復元。

## インストール
1. 事前に VSIX を用意（例: `locore-0.0.1.vsix`）。
2. VS Code の拡張機能ビューで「…」→「VSIX からのインストール」を選択し、VSIX を指定。
   - もしくはコマンドパレットで「Install from VSIX」を実行。

対応バージョン: VS Code 1.74 以降

## クイックスタート
1. 任意のフォルダを VS Code で開く（ワークスペース必須）。
2. ファイルを開き、左端（行番号付近）の「コメント追加」アイコンをクリック、または行を選択してコメント入力ボックスを開きます。
3. 入力ボックスの「LoCoRe: Create Review」ボタンで最初のコメントを投稿すると、スレッドが作成されます。
4. 以降は「Reply」で返信を追加できます。未解決スレッドには「Resolve Thread」、解決済みには「Reopen」ボタンが表示されます。
5. VS Code を再読み込みしても、スレッドとコメントは自動復元されます（入力ボックスは折りたたみ表示）。

ヒント: ワークスペース直下に `.codereview/` が自動作成されます。手動で移動/削除しないでください。

## コマンド一覧（コマンドパレットで検索）
- `LoCoRe: Open CodeReview` — サンプル通知を表示します。
- `LoCoRe: Close Code Review` — コメント UI（CommentController）を終了して閉じます。
- `LoCoRe: Create Review` — コメント入力ボックス内のインラインボタンとして表示（空スレッド時）。
- `LoCoRe: Reply` — 入力ボックス内のインラインボタン（既存スレッド時）。
- `LoCoRe: Resolve Thread` — 入力ボックス内のインラインボタン（未解決時）。
- `LoCoRe: Reopen` — 入力ボックス内のインラインボタン（解決済み時）。

注意: 「Create/Reply/Resolve/Reopen」はコメント入力ボックスのインラインに表示される運用です。スレッドの状態により表示ボタンが切り替わります。

## データ保存仕様
- 保存先: ワークスペース直下の `.codereview/` ディレクトリ
  - `index.json`: スレッドの索引・状態（open/closed）・統計など
  - `review.jsonl`: コメント本文の履歴（JSON Lines 形式、追記専用）
- 復元: 拡張機能の有効化時に `index.json` / `review.jsonl` を読み込み、全スレッドとコメントを UI に再構築します。
- 表示: 再読み込み後はコメント入力ボックスが折りたたみ（Collapsed）で表示されます。

## トラブルシューティング
- ボタンが表示されない:
  - コメント入力ボックスのインラインに表示されます。スレッドが空の場合は「Create Review」、コメントがある場合は「Reply」、未解決は「Resolve」、解決済みは「Reopen」が表示されます。
- 何も起きない / エラーが出る:
  - ワークスペースが開かれているか確認してください。
  - `.codereview/` の作成権限や、`index.json` の破損がないか確認してください。
- UI を閉じたい:
  - `LoCoRe: Close Code Review` を実行すると、コメント UI を閉じられます。

## プライバシー / セキュリティ
- ネットワーク通信は行いません。レビュー情報はローカルの `.codereview/` にのみ保存されます。
- 書き込みは現在のワークスペース配下（`.codereview/`）のみに限定されます。

## ライセンスとリポジトリ
- ライセンス: リポジトリの `LICENSE` を参照してください。
- リポジトリ: https://github.com/ramsesyok/vscode-locore

