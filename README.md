# シフトマネージャー（Phase 1）

アルバイト先へ半月ごとに提出する希望シフトを、タップ中心で作成してコピーする iPhone 向け PWA。
仕様は [docs/shift_manager_design.md](docs/shift_manager_design.md)（v1.1、確認事項 Q01〜Q11 の回答を §11.1 に反映）を基準とする。

## 構成

ビルド不要の素の JavaScript（ES Modules、JSDoc で型注釈）＋ IndexedDB（Q01）。外部ライブラリ・外部送信・分析SDKなし。

```text
shift-manager/
├─ index.html / manifest.webmanifest / sw.js   PWA 本体・ホーム画面追加・オフライン
├─ icons/                                     アプリアイコン（仮デザイン）
├─ src/
│  ├─ main.js                                 起動（依存の組み立て）
│  ├─ domain/      calendar, shift, history, formatter, appData, types
│  ├─ application/ controller.js              状態管理・操作制御（UI はここ経由のみ）
│  ├─ infrastructure/ storage(IndexedDB), clipboard, backup, fileSaver
│  ├─ ui/          app.js, screens/(期間選択・メイン・設定), components/(ホイール・時間シート・ダイアログ)
│  └─ styles/app.css
├─ tests/          単体テスト（node:test）、e2e/（Playwright）
└─ docs/shift_manager_design.md
```

将来拡張：確定シフト（Phase 2）は `AppData` に別領域を追加し、希望シフト（`requests`）とは混ぜない。保存データには `schemaVersion` があり、`domain/appData.js` の `migrateAppData` に変換処理を追加して移行する。

## PCでの起動

```bash
cd shift-manager
python -m http.server 8080      # または npx serve など任意の静的サーバー
# ブラウザーで http://localhost:8080/ を開く
```

`index.html` をファイルとして直接開くと ES Modules が読み込めないため、必ずサーバー経由で開く。

## テスト

```bash
npm test                          # 単体テスト（Node.js 20 以上。追加インストール不要）
python tests/e2e/e2e_test.py      # E2E（要: pip install playwright && playwright install chromium、上のサーバー起動）
```

## iPhone へのインストール（公開後）

1. iPhone の Safari で公開 URL を開く
2. 共有ボタン →「ホーム画面に追加」
3. ホーム画面のアイコンから起動（1回開けば以降はオフラインでも使える）

更新を配信するときは `sw.js` の `CACHE_VERSION` を上げる（保存データは消えない）。

## バックアップ

設定 →「バックアップを書き出す」で JSON を書き出し、「ファイル」アプリなどに保存する。
iPhone のデータは Safari の履歴・データ消去やホーム画面アプリの削除で消えることがあるため、定期的に書き出すこと。
「バックアップから復元」は全置換（Q10）。復元前に現在のデータを書き出し、書き出しをキャンセルした場合は復元しない。

## 受入テスト結果（2026-11-26、PC上のヘッドレス Chrome・iPhone 相当の画面サイズ）

単体テスト 46件、E2E 24項目すべて合格。

| ID | 結果 | 確認方法 |
|---|---|---|
| T01〜T04 | 合格 | 単体＋E2E（T04 は端末日時を 2026-12-20 に固定して確認） |
| T05〜T11 | 合格 | 単体＋E2E（ホイール41候補、各書式、不正な組み合わせは適用ボタン無効） |
| T12〜T16 | 合格 | 単体＋E2E |
| T17〜T19 | 合格 | 単体（T18 は単体のみ）＋E2E |
| T20〜T22 | 合格 | 単体＋E2E（実際のクリップボード内容を確認） |
| T23〜T25 | 合格 | E2E（ページ再読み込み＝再起動、IndexedDB から復元） |
| T26〜T27 | 合格 | 単体＋E2E（ファイル書き出し→復元、壊れたJSON・未対応バージョン） |
| T28 | 合格（エミュレーション） | ブラウザーのダークモード切替で確認。**iPhone 実機では未検証** |
| T29 | 合格（PC Chrome） | Service Worker でオフライン起動・入力・保存。**iPhone のホーム画面起動は未検証** |
| T30 | 合格 | クリップボード API を失敗させ、成功表示なし・手動コピー欄を表示 |
| T31 | 合格 | IndexedDB の書き込みを失敗させ、エラー表示・保存済み表示なし |
| T32 | **未検証** | iPhone 実機での15日分入力（ホイールの操作感、タップ、スクロール） |

### 実機で確認が必要な項目

- T28/T29/T32 の実機確認、ホーム画面への追加と standalone 表示
- iOS Safari でのクリップボードコピー（HTTPS 必須）とLINEへの貼り付け
- バックアップの共有シート（「"ファイル"に保存」）と復元時のファイル選択
- VoiceOver・文字サイズ拡大時の表示、iPhone SE など小さい画面でのプレビュー欄の大きさ（折りたたみ可能）

## 実装上の解釈（設計書 §11.1 補足に記載）

- 単日の自動翌日移動は、履歴・時間シート・○・× のどれで適用しても行う
- 一括設定で「最後にタップした日」の選択を外した場合は、残りのうち最後にタップした日を基準にする
- 時間シートの初期値で履歴も空の場合は 19:00〜23:00
- プレビューでは未入力の日を薄い色の「×」で表示
