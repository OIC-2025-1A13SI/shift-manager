"""E2E受入テスト（ヘッドレスChrome、iPhone相当の画面サイズ）。

実行方法:
  1. プロジェクト直下で  python -m http.server 8080
  2. pip install playwright && playwright install chromium（初回のみ）
  3. python tests/e2e/e2e_test.py  [--chrome /path/to/chrome]

iPhone実機の Safari とは挙動が異なる部分（ホイールの操作感、共有シート、
ホーム画面追加）は実機で確認すること。
"""
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8080/'
OUT = Path(tempfile.gettempdir()) / 'shift-manager-e2e'
OUT.mkdir(exist_ok=True)
results = []


def check(tid, name, fn):
    try:
        fn()
        results.append((tid, name, 'PASS', ''))
    except Exception as e:  # noqa: BLE001
        results.append((tid, name, 'FAIL', ' | '.join(str(e).splitlines()[:8])[:900]))


def day(page, n):
    return page.locator(f'.day[data-date$="-{n:02d}"]')


def clipboard(page):
    return page.evaluate('navigator.clipboard.readText()')


def main():
    chrome = None
    if '--chrome' in sys.argv:
        chrome = sys.argv[sys.argv.index('--chrome') + 1]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chrome) if chrome else p.chromium.launch()
        ctx = browser.new_context(
            viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale='ja-JP', timezone_id='Asia/Tokyo', accept_downloads=True,
        )
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=BASE)
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.clock.set_fixed_time('2026-12-20T10:00:00+09:00')
        page.goto(BASE)

        # ---- S01 ----
        def t04():
            rows = page.locator('[data-action="period"]')
            expect(rows).to_have_count(4)
            keys = [rows.nth(i).get_attribute('data-key') for i in range(4)]
            assert keys == ['2026-12-first', '2026-12-second', '2027-01-first', '2027-01-second'], keys
            expect(page.locator('.section-header').nth(1)).to_contain_text('翌月　2027年1月')
        check('T04', '12月起動時の翌月が翌年1月', t04)
        page.screenshot(path=OUT / '01_period.png')

        def t02():
            page.click('[data-key="2026-12-second"]')
            expect(page.locator('.day')).to_have_count(16)
            expect(page.locator('.day').last).to_have_attribute('data-date', '2026-12-31')
            page.click('[data-action="back"]')
        check('T02', '12月後半は16〜31日', t02)

        def t01():
            page.click('[data-key="2026-12-first"]')
            expect(page.locator('.day')).to_have_count(15)
            expect(day(page, 1)).to_contain_text('火')
            assert 'selected' in day(page, 1).get_attribute('class')  # Q03 初日を選択
        check('T01', '12月前半: 1〜15日、1日は火曜、初日を選択', t01)

        # ---- S03 ----
        def open_sheet():
            page.click('[data-action="add"]')
            expect(page.locator('.sheet')).to_be_visible()

        def t05():
            open_sheet()
            wheel = page.locator('[data-col="start"] .wheel-item')
            expect(wheel).to_have_count(41)
            assert wheel.first.inner_text() == '10:00' and wheel.last.inner_text() == '30:00'
            page.screenshot(path=OUT / '03_sheet.png')
        check('T05', 'ホイール41候補 10:00〜30:00', t05)

        def t06_t12():
            start = page.locator('[data-col="start"] .wheel-vp')
            start.focus()
            start.press('ArrowUp')  # 19:00 → 18:30
            expect(page.get_by_test_id('sheet-output')).to_have_text('18:30-23')
            page.click('[data-sheet="apply"]')
            expect(page.locator('.sheet')).to_have_count(0)
            expect(day(page, 1)).to_contain_text('18:30-23')
            assert 'selected' in day(page, 2).get_attribute('class')
        check('T06/T12', '18:30-23 を適用し翌日へ移動', t06_t12)

        def t07():
            open_sheet()
            end = page.locator('[data-col="end"] .wheel-vp')
            end.focus()
            for _ in range(14):
                end.press('ArrowDown')  # 23:00 → 30:00
            start = page.locator('[data-col="start"] .wheel-vp')
            start.focus()
            start.press('ArrowDown')  # Q11: 直前使用の 18:30 から → 19:00
            expect(page.get_by_test_id('sheet-output')).to_have_text('19-30')
            end.focus()
            end.press('ArrowDown')  # 30:30 は存在しない
            expect(page.get_by_test_id('sheet-output')).to_have_text('19-30')
            page.click('[data-sheet="apply"]')
            expect(day(page, 2)).to_contain_text('19-30')
        check('T07/Q11', '19-30（30:30なし、初期値は直前使用）', t07)

        def t08_t11():
            open_sheet()
            start = page.locator('[data-col="start"] .wheel-vp')
            end = page.locator('[data-col="end"] .wheel-vp')
            # 開始=終了: 19:00-30:00 の終了を 19:00 まで上げる
            end.focus()
            for _ in range(22):
                end.press('ArrowUp')
            expect(page.get_by_test_id('sheet-error')).to_be_visible()
            expect(page.locator('[data-sheet="apply"]')).to_be_disabled()
            end.press('ArrowUp')  # 開始 > 終了
            expect(page.locator('[data-sheet="apply"]')).to_be_disabled()
            page.click('[data-col="start"] [data-mode="none"]')
            page.click('[data-col="end"] [data-mode="none"]')
            expect(page.locator('[data-sheet="apply"]')).to_be_disabled()  # T11
            page.click('[data-col="start"] [data-mode="open"]')
            expect(page.locator('[data-sheet="apply"]')).to_be_disabled()  # Q06 OP-
            page.click('[data-col="start"] [data-mode="none"]')
            page.click('[data-col="end"] [data-mode="last"]')
            expect(page.locator('[data-sheet="apply"]')).to_be_disabled()  # Q06 -LA
            page.click('[data-sheet="cancel"]')
            expect(page.locator('.sheet')).to_have_count(0)
            assert 'selected' in day(page, 3).get_attribute('class')  # 取消で何も変わらない
        check('T08/T11/Q06', '不正な組み合わせは適用不可', t08_t11)

        def apply_combo(start_mode, end_mode, expected):
            open_sheet()
            page.click(f'[data-col="start"] [data-mode="{start_mode}"]')
            page.click(f'[data-col="end"] [data-mode="{end_mode}"]')
            expect(page.get_by_test_id('sheet-output')).to_have_text(expected)
            page.click('[data-sheet="apply"]')

        def t09_t10():
            page.click('.day[data-date$="-03"]')
            apply_combo('open', 'time', 'OP-30')
            expect(day(page, 3)).to_contain_text('OP-30')
            apply_combo('time', 'last', '19-LA')
            apply_combo('open', 'last', 'OP-LA')
            apply_combo('time', 'none', '19-')
            apply_combo('none', 'time', '-23')
            page.click('[data-action="available"]')
            page.click('[data-action="unavailable"]')
            texts = [day(page, n).locator('.dval').inner_text() for n in range(4, 10)]
            assert texts == ['19-LA', 'OP-LA', '19-', '-23', '○', '×'], texts
            assert 'selected' in day(page, 10).get_attribute('class')
        check('T09/T10', 'OP/LA・片側のみ・○×の出力', t09_t10)
        page.screenshot(path=OUT / '02_main.png', full_page=False)

        def t15():
            page.click('.day[data-date$="-04"]')
            page.click('[data-action="unavailable"]')
            expect(day(page, 4)).to_contain_text('×')
        check('T15', '入力済みの日付を確認なしで上書き', t15)

        def t14():
            page.click('[data-action="multi"]')
            for n in (2, 5, 8):
                day(page, n).click()
            expect(page.get_by_test_id('editing')).to_contain_text('3日')
            page.locator('.chip[data-action="history"]').first.click()
            for n in (2, 5, 8):
                expect(day(page, n).locator('.dval')).to_have_text('-23')
            assert 'selected' in day(page, 9).get_attribute('class')
            expect(page.locator('[data-action="multi"]')).to_have_attribute('aria-pressed', 'false')
        check('T14', '2・5・8日を一括設定→通常モードで9日', t14)

        def t13():
            day(page, 15).click()
            page.click('[data-action="available"]')
            assert 'selected' in day(page, 15).get_attribute('class')
            expect(day(page, 15)).to_contain_text('○')
        check('T13', '最終日に適用しても留まる', t13)

        def t16():
            day(page, 15).click()
            page.click('[data-action="clear"]')
            expect(day(page, 15)).to_contain_text('未入力')
            expect(page.get_by_test_id('preview').locator('div').last).to_have_text('12月15日（火）　×')
            assert 'missing' in page.get_by_test_id('preview').locator('div').last.get_attribute('class')
            # Q05 一括取消
            page.click('[data-action="multi"]')
            day(page, 6).click(); day(page, 7).click()
            page.click('[data-action="clear"]')
            expect(day(page, 6)).to_contain_text('未入力')
            expect(day(page, 7)).to_contain_text('未入力')
            assert 'selected' in day(page, 7).get_attribute('class')
        check('T16/Q05', '未入力に戻す（単日・一括）', t16)

        def t17_t18_t19():
            chips = page.locator('.chip[data-action="history"]')
            before = [chips.nth(i).inner_text() for i in range(chips.count())]
            day(page, 11).click()
            chips.nth(2).click()
            after = [chips.nth(i).inner_text() for i in range(chips.count())]
            assert after[0] == before[2] and len(after) == len(before), (before, after)
            # 編集モードで削除
            page.click('[data-action="history-edit"]')
            target = chips.first.inner_text()
            chips.first.click()
            page.click('[data-action="history-edit"]')
            assert target not in [chips.nth(i).inner_text() for i in range(chips.count())]
            expect(day(page, 11)).to_contain_text(target)  # T19
        check('T17/T19', '履歴の再使用で先頭へ、削除してもシフトは残る', t17_t18_t19)

        def t20():
            page.evaluate("navigator.clipboard.writeText('BEFORE')")
            page.click('[data-action="copy"]')
            expect(page.locator('.dialog')).to_contain_text('未入力の日付が')
            page.get_by_test_id('copy-cancel').click()
            expect(page.locator('.dialog')).to_have_count(0)
            assert clipboard(page) == 'BEFORE'
        check('T20', '未入力ありでコピー→取消でクリップボード不変', t20)

        def t21():
            page.click('[data-action="copy"]')
            page.get_by_test_id('copy-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('コピーしました')
            text = clipboard(page)
            lines = text.split('\n')
            assert len(lines) == 15, lines
            assert lines[0] == '12月1日（火）　18:30-23', lines[0]
            assert lines[5] == '12月6日（日）　×'
            expect(day(page, 6)).to_contain_text('未入力')
            preview = page.get_by_test_id('preview').inner_text().strip()
            assert preview == text, (preview, text)
        check('T21', '承認で×に変換してコピー、内部は未入力のまま', t21)

        def t22():
            page.click('[data-action="settings"]')
            page.fill('#greet-prefix', 'お疲れ様です。\n12月前半の希望です。')
            page.fill('#greet-suffix', 'よろしくお願いします。')
            page.get_by_test_id('settings-greet').check()
            page.click('[data-action="back"]')
            expect(page.get_by_test_id('greet-toggle')).to_be_checked()
            page.click('[data-action="copy"]')
            page.get_by_test_id('copy-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('コピーしました')
            text = clipboard(page)
            assert text.startswith('お疲れ様です。\n12月前半の希望です。\n12月1日（火）'), text[:40]
            assert text.endswith('12月15日（火）　×\nよろしくお願いします。')
            assert page.get_by_test_id('preview').inner_text().strip() == text
            page.get_by_test_id('greet-toggle').uncheck()
            page.click('[data-action="copy"]')
            page.get_by_test_id('copy-confirm').click()
            assert clipboard(page).startswith('12月1日'), 'OFFで挨拶文なし'
        check('T22', '挨拶文の切替・編集でプレビューとコピーが一致', t22)

        def t23_t24_t25():
            page.reload()
            expect(page.locator('[data-action="period"]')).to_have_count(4)
            expect(page.locator('[data-key="2026-12-first"]')).to_contain_text('入力済み')
            page.click('[data-key="2026-12-first"]')
            expect(day(page, 1)).to_contain_text('18:30-23')
            assert 'selected' in day(page, 1).get_attribute('class')
            expect(page.locator('.chip[data-action="history"]').first).to_be_visible()
            page.click('[data-action="back"]')
            page.click('[data-key="2027-01-first"]')
            expect(page.locator('.day.missing')).to_have_count(15)
            expect(day(page, 1)).to_contain_text('金')
            page.click('[data-action="back"]')
        check('T23/T24/T25', '再起動後に復元、コピー後もデータ残存、期間間で混在なし', t23_t24_t25)

        backup_path = OUT / 'backup.json'

        def t26():
            page.click('[data-action="settings"]')
            with page.expect_download() as dl:
                page.click('[data-action="export"]')
            dl.value.save_as(backup_path)
            data = json.loads(backup_path.read_text(encoding='utf-8'))
            assert data['app'] == 'shift-manager' and data['data']['schemaVersion'] == 1
            assert data['data']['settings']['greetingPrefix'].startswith('お疲れ様です')
            # データを変えてから復元
            page.click('[data-action="back"]')
            page.click('[data-key="2026-12-first"]')
            day(page, 1).click()
            page.click('[data-action="clear"]')
            page.click('[data-action="settings"]')
            page.get_by_test_id('restore-file').set_input_files(str(backup_path))
            expect(page.locator('.dialog')).to_contain_text('復元しますか')
            with page.expect_download() as pre:
                page.get_by_test_id('restore-confirm').click()
            assert 'before-restore' in pre.value.suggested_filename
            expect(page.get_by_test_id('toast')).to_have_text('復元しました')
            page.reload()
            page.click('[data-key="2026-12-first"]')
            expect(day(page, 1)).to_contain_text('18:30-23')
            assert page.locator('.chip[data-action="history"]').count() >= 1
            page.click('[data-action="settings"]')
            expect(page.locator('#greet-suffix')).to_have_value('よろしくお願いします。')
        check('T26', 'JSON書出し・復元で希望・履歴・設定を保持', t26)

        def t27():
            bad = OUT / 'broken.json'
            bad.write_text('{"app":"shift-manager", broken', encoding='utf-8')
            page.get_by_test_id('restore-file').set_input_files(str(bad))
            expect(page.get_by_test_id('toast')).to_contain_text('JSONとして読み込めません')
            v9 = OUT / 'v9.json'
            d = json.loads(backup_path.read_text(encoding='utf-8'))
            d['data']['schemaVersion'] = 9
            v9.write_text(json.dumps(d), encoding='utf-8')
            page.get_by_test_id('restore-file').set_input_files(str(v9))
            expect(page.get_by_test_id('toast')).to_contain_text('未対応のデータバージョン')
            expect(page.locator('.dialog')).to_have_count(0)
            page.click('[data-action="back"]')  # メイン画面から開いたのでメイン画面へ戻る
            expect(page.locator('[data-screen="main"]')).to_be_visible()
            expect(day(page, 1)).to_contain_text('18:30-23')
        check('T27', '壊れたJSON・未対応バージョンはエラー、現データ保持', t27)

        def t30():
            page.evaluate("""() => {
              navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
              document.execCommand = () => false;
            }""")
            page.click('[data-action="copy"]')
            page.get_by_test_id('copy-confirm').click()
            expect(page.get_by_test_id('manual-copy')).to_be_visible()
            assert page.get_by_test_id('manual-copy').input_value().startswith('12月1日')
            expect(page.get_by_test_id('toast')).to_have_count(0)
            page.screenshot(path=OUT / '06_manual_copy.png')
            page.locator('.dialog-actions button').click()
        check('T30', 'コピー失敗時は成功表示なし、手動コピーを提示', t30)

        def t31():
            page.evaluate("""() => {
              IDBObjectStore.prototype.put = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
            }""")
            day(page, 12).click()
            page.click('[data-action="available"]')
            expect(page.get_by_test_id('save-error')).to_contain_text('保存に失敗しました')
            page.screenshot(path=OUT / '07_save_error.png')
            page.reload()  # put の差し替えを解除
            page.click('[data-key="2026-12-first"]')
            expect(day(page, 12)).not_to_contain_text('○')
            day(page, 12).click()
            page.click('[data-action="available"]')
            expect(page.get_by_test_id('save-error')).to_have_count(0)
        check('T31', '保存失敗を通知し、保存済みと誤表示しない', t31)

        def t28():
            page.emulate_media(color_scheme='dark')
            bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
            assert bg == 'rgb(0, 0, 0)', bg
            page.screenshot(path=OUT / '04_main_dark.png')
            page.click('[data-action="add"]')
            page.screenshot(path=OUT / '05_sheet_dark.png')
            page.click('[data-sheet="cancel"]')
            page.emulate_media(color_scheme='light')
            bg = page.evaluate("getComputedStyle(document.body).backgroundColor")
            assert bg == 'rgb(242, 242, 247)', bg
        check('T28', 'ライト・ダークに追従（ブラウザーのエミュレーション）', t28)

        def t29():
            page.evaluate("navigator.serviceWorker.ready.then(() => true)")
            page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
            ctx.set_offline(True)
            page.reload()
            page.click('[data-key="2026-12-first"]')
            day(page, 13).click()
            page.click('[data-action="unavailable"]')
            expect(day(page, 13)).to_contain_text('×')
            expect(page.get_by_test_id('save-error')).to_have_count(0)
            page.reload()
            page.click('[data-key="2026-12-first"]')
            expect(day(page, 13)).to_contain_text('×')
            ctx.set_offline(False)
        check('T29', 'オフラインで入力・保存・プレビュー（PC Chromeで確認）', t29)

        def no_errors():
            assert not errors, errors
        check('-', 'ページ上のJavaScriptエラーなし', no_errors)
        browser.close()

    width = max(len(r[0]) for r in results)
    for tid, name, status, msg in results:
        print(f'{status}  {tid.ljust(width)}  {name}' + (f'  -- {msg}' if msg else ''))
    failed = [r for r in results if r[2] == 'FAIL']
    print(f'\n{len(results) - len(failed)}/{len(results)} passed. screenshots: {OUT}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
