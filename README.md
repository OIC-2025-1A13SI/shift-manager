# シフトマネージャー

アルバイト先へ半月ごとに提出する希望シフトを、シフトボードに近い操作のカレンダーで入力し、LINE提出用の文章にコピーする iPhone 向け PWA。
仕様は [docs/v2_redesign.md](docs/v2_redesign.md)（v2、シフトボード準拠のリメイク）と、そこで変更していない部分は [docs/shift_manager_design.md](docs/shift_manager_design.md)（v1.1）を基準とする。

- v2.0.0（段階①）：希望シフトの月カレンダー／リスト、追加シート（曜日のいつもの・○×・履歴とピン留め）、時・分2列ホイールの入力画面、LINE提出用コピー、曜日のいつもので一括入力
- 予定：段階② 確定シフト、段階③ 給料計算

公開URL：https://oic-2025-1a13si.github.io/shift-manager/ （GitHub Pages、`main` ブランチのルート）

## 構成

ビルド不要の素の JavaScript（ES Modules、JSDoc で型注釈）＋ IndexedDB（Q01）。外部ライブラリ・外部送信・分析SDKなし。

```text
shift-manager/
├─ index.html / manifest.webmanifest / sw.js   PWA 本体・ホーム画面追加・オフライン
├─ icons/                                     アプリアイコン（仮デザイン）
├─ src/
│  ├─ main.js                                 起動（依存の組み立て）
│  ├─ domain/      calendar, shift, history, formatter, templates, appData, types
│  ├─ application/ controller.js              状態管理・操作制御（UI はここ経由のみ）
│  ├─ infrastructure/ storage(IndexedDB), clipboard, backup, fileSaver
│  ├─ ui/          app.js（タブ）, screens/(希望シフト・LINEコピー・その他・準備中), components/(追加シート・入力画面・2列ホイール・ダイアログ)
│  └─ styles/app.css
├─ tests/          単体テスト（node:test）、e2e/（Playwright）
└─ docs/v2_redesign.md, shift_manager_design.md
```

データ：保存形式は schemaVersion 2。希望シフト（`hopes`）と確定シフト（`confirmed`）を別の領域に持ち、給料の設定（`pay`）・曜日のいつもの（`weekdayTemplates`）の領域も用意済み。v1 の保存データ・バックアップは `domain/appData.js` の `migrateAppData` で自動変換する。

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

## 受入テスト結果（v2.0.0、2026-11-27、PC上のヘッドレス Chrome・iPhone 相当の画面サイズ）

単体テスト 55件、E2E 26項目すべて合格（E2E は3回連続で合格を確認）。

| 項目 | 結果 | 内容 |
|---|---|---|
| 起動・月移動（T01〜T04） | 合格 | 今月カレンダー・今日を選択、年またぎ、今日へ戻る |
| 入力画面（T05〜T11、Q06） | 合格 | 時10〜30・分0〜59、30:00を超えない、18:45-23 などの書式、不正な組み合わせは完了不可 |
| 入力の流れ（T12〜T16、T13 v2） | 合格 | 入力後に翌日へ（月末は翌月1日へ）、一括入力、上書き、未入力に戻す |
| 履歴（T17、T19、ピン留め） | 合格 | 再使用で先頭へ、ピン留めは先頭固定、削除してもシフトは残る |
| リスト表示・曜日のいつもの | 合格 | リストから入力、曜日の型の登録・ワンタップ・未入力の日だけまとめて入力 |
| LINEコピー（T20〜T22） | 合格 | 取消でクリップボード不変、×変換、プレビューと一致、挨拶文 |
| 保存・復元（T23〜T27、移行） | 合格 | 再起動後に復元、v2 バックアップの書出し・復元、v1 のバックアップも読める、壊れたファイルは拒否 |
| T28 / T29 | 合格（PC） | ダークモード（エミュレーション）、オフライン。**iPhone 実機は未検証** |
| T30 / T31 | 合格 | コピー失敗時の手動コピー、保存失敗の表示 |
| T32 | **未検証** | iPhone 実機での操作感（2列ホイール、スワイプでの月移動、シート） |

## 実装上の解釈（v1：設計書 §11.1 補足、v2：docs/v2_redesign.md §8）

- 単日の自動翌日移動は、履歴・時間シート・○・× のどれで適用しても行う
- 一括設定で「最後にタップした日」の選択を外した場合は、残りのうち最後にタップした日を基準にする
- 時間シートの初期値で履歴も空の場合は 19:00〜23:00
- プレビューでは未入力の日を薄い色の「×」で表示
