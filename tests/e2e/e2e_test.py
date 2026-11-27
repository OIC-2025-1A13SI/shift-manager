"""E2E受入テスト v2（ヘッドレスChrome、iPhone相当の画面サイズ）。

実行方法:
  1. プロジェクト直下で  python -m http.server 8080
  2. pip install playwright && playwright install chromium（初回のみ）
  3. python tests/e2e/e2e_test.py  [--chrome /path/to/chrome] [--base http://localhost:8080/]

端末の日時は 2026-11-27 10:00（日本時間）に固定する。
iPhone実機の Safari とは挙動が異なる部分（ホイールの操作感、共有シート、
ホーム画面追加）は実機で確認すること。
"""
import json
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[sys.argv.index('--base') + 1] if '--base' in sys.argv else 'http://localhost:8080/'
OUT = Path(tempfile.gettempdir()) / 'shift-manager-e2e'
OUT.mkdir(exist_ok=True)
results = []
CLEANUP = []


def check(tid, name, fn):
    try:
        fn()
        results.append((tid, name, 'PASS', ''))
    except Exception as e:  # noqa: BLE001
        results.append((tid, name, 'FAIL', ' | '.join(str(e).splitlines()[:6])[:700]))
        for c in CLEANUP:  # 失敗したテストの画面を閉じて、次のテストに影響させない
            c()


def cell(page, date):
    return page.locator(f'.cal-cell[data-date="{date}"]')


def clipboard(page):
    return page.evaluate('navigator.clipboard.readText()')


def main():
    chrome = sys.argv[sys.argv.index('--chrome') + 1] if '--chrome' in sys.argv else None
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
        page.clock.set_fixed_time('2026-11-27T10:00:00+09:00')
        page.goto(BASE)
        CLEANUP.append(lambda: page.screenshot(path=OUT / f'fail_{len(results)}.png'))
        CLEANUP.append(lambda: page.evaluate(
            "document.querySelectorAll('.page-overlay,.sheet,.backdrop,.dialog-layer').forEach(e => e.remove());"
            "document.querySelector('.tabbar [data-tab=\"hope\"]').click()"))

        def show_dec():
            for _ in range(24):
                y = int(page.locator('.month-title .y').inner_text())
                m = int(page.locator('.month-title .m').inner_text())
                diff = (2026 * 12 + 12) - (y * 12 + m)
                if diff == 0:
                    return
                page.click('[data-action="next"]' if diff > 0 else '[data-action="prev"]')
            raise AssertionError('12月を表示できません')

        def add_btn():
            page.locator('.day-panel [data-action="add"], .list-add [data-action="add"]').first.click()
            expect(page.locator('.sheet')).to_be_visible()

        def new_entry():
            add_btn()
            page.click('[data-sh="new"]')
            expect(page.locator('.page-overlay')).to_be_visible()

        def wheel(side, col, key, times):
            # col: 0=時, 1=分
            vp = page.locator(f'[data-slot="{side}"] .wheel-vp').nth(col)
            vp.focus()
            vp.press(key, delay=0) if times == 1 else [vp.press(key) for _ in range(times)]

        def open_chip(side):
            page.click(f'[data-ed="chip"][data-key="{side}"]')
            expect(page.locator(f'[data-slot="{side}"] .time-picker')).to_be_visible()

        # ---- 起動 ----
        def start():
            expect(page.locator('.month-title')).to_contain_text('2026')
            expect(page.locator('.month-title .m')).to_have_text('11')
            assert 'selected' in cell(page, '2026-11-27').get_attribute('class')
            expect(page.locator('.cal-cell')).to_have_count(35)
            expect(page.locator('.day-band')).to_contain_text('2026年11月27日 (金)')
            expect(page.locator('.tabbar [data-tab="hope"]')).to_have_class('on')
        check('V2-01', '起動で今月カレンダー・今日を選択（R06変更）', start)
        page.screenshot(path=OUT / 'v2_01_calendar.png')

        def months():
            page.click('[data-action="next"]')
            expect(page.locator('.month-title .m')).to_have_text('12')
            expect(cell(page, '2026-12-01')).to_be_visible()
            assert 'out' not in cell(page, '2026-12-01').get_attribute('class')
            assert 'out' in cell(page, '2026-11-29').get_attribute('class')
            page.click('[data-action="next"]')
            expect(page.locator('.month-title')).to_contain_text('2027')
            page.click('[data-action="today"]')
            expect(page.locator('.month-title .m')).to_have_text('11')
        check('T01-T04', '月の移動（年またぎ）と今日へ戻る', months)

        # ---- 入力画面（2列ホイール・1分刻み） ----
        def editor():
            page.click('[data-action="next"]')
            cell(page, '2026-12-01').click()
            new_entry()
            open_chip('start')
            expect(page.locator('[data-slot="start"] .wheel-vp').nth(0).locator('.wheel-item')).to_have_count(21)
            expect(page.locator('[data-slot="start"] .wheel-vp').nth(1).locator('.wheel-item')).to_have_count(60)
            wheel('start', 0, 'ArrowUp', 1)   # 19 → 18
            wheel('start', 1, 'ArrowDown', 45)  # 00 → 45
            expect(page.get_by_test_id('editor-output')).to_have_text('18:45-23')
            page.screenshot(path=OUT / 'v2_03_editor.png')
            page.click('[data-ed="done"]')
            expect(page.locator('.page-overlay')).to_have_count(0)
            expect(cell(page, '2026-12-01')).to_contain_text('18:45-23')
            assert 'selected' in cell(page, '2026-12-02').get_attribute('class')
        check('T06/T12', '1分刻みで18:45-23を入力し翌日へ', editor)

        def editor_30():
            new_entry()
            open_chip('end')
            wheel('end', 0, 'End', 1)  # 30時
            expect(page.get_by_test_id('editor-output')).to_have_text('18:45-30')
            wheel('end', 1, 'ArrowDown', 3)  # 30時を超えない
            expect(page.get_by_test_id('editor-output')).to_have_text('18:45-30')
            page.click('[data-ed="done"]')
            expect(cell(page, '2026-12-02')).to_contain_text('18:45-30')
        check('T05/T07', '30時まで、30:00を超えない', editor_30)

        def invalid():
            new_entry()
            open_chip('end')
            wheel('end', 0, 'Home', 1)  # 10時 → 開始より前
            expect(page.get_by_test_id('editor-error')).to_be_visible()
            expect(page.locator('[data-ed="done"]')).to_be_disabled()
            page.click('[data-ed="mode"][data-key="start"][data-mode="none"]')
            page.click('[data-ed="mode"][data-key="end"][data-mode="none"]')
            expect(page.locator('[data-ed="done"]')).to_be_disabled()  # T11
            page.click('[data-ed="mode"][data-key="start"][data-mode="open"]')
            expect(page.locator('[data-ed="done"]')).to_be_disabled()  # Q06 OP-
            page.click('[data-ed="mode"][data-key="start"][data-mode="none"]')
            page.click('[data-ed="mode"][data-key="end"][data-mode="last"]')
            expect(page.locator('[data-ed="done"]')).to_be_disabled()  # Q06 -LA
            page.click('[data-ed="close"]')
            expect(page.locator('.page-overlay')).to_have_count(0)
            assert 'selected' in cell(page, '2026-12-03').get_attribute('class')
        check('T08/T11/Q06', '不正な組み合わせは完了できない', invalid)

        def special(start_mode, end_mode, expected):
            new_entry()
            page.click(f'[data-ed="mode"][data-key="start"][data-mode="{start_mode}"]')
            page.click(f'[data-ed="mode"][data-key="end"][data-mode="{end_mode}"]')
            expect(page.get_by_test_id('editor-output')).to_have_text(expected)
            page.click('[data-ed="done"]')

        def specials():
            special('open', 'last', 'OP-LA')     # 3日
            special('time', 'none', '19-')       # 4日（直前の履歴がOP-LAなので開始は既定の19:00）
            special('none', 'time', '-23')       # 5日（直前の履歴が19-なので終了は既定の23:00）
            add_btn(); page.click('[data-sh="available"]')    # 6日
            add_btn(); page.click('[data-sh="unavailable"]')  # 7日
            vals = [cell(page, f'2026-12-0{d}').locator('.cal-val').inner_text() for d in range(3, 8)]
            assert vals == ['OP-LA', '19-', '-23', '○', '×'], vals
            assert 'selected' in cell(page, '2026-12-08').get_attribute('class')
        check('T09/T10', 'OP/LA・片側のみ・○×', specials)
        page.screenshot(path=OUT / 'v2_02_filled.png')

        def history():
            add_btn()
            cards = page.locator('.hist-card .hist-main')
            texts = [cards.nth(i).inner_text() for i in range(cards.count())]
            assert any('OP-LA' in t for t in texts), texts
            page.screenshot(path=OUT / 'v2_04_sheet.png')
            page.locator('.hist-card').filter(has_text='OP-LA').locator('.hist-main').click()
            expect(cell(page, '2026-12-08')).to_contain_text('OP-LA')
            assert 'selected' in cell(page, '2026-12-09').get_attribute('class')
            # 再使用で先頭へ（重複なし）
            add_btn()
            first = page.locator('.hist-card .hist-main').first.inner_text()
            assert 'OP-LA' in first, first
            n = page.locator('.hist-card').count()
            # ピン留め：一番下をピン留めすると先頭に
            last = page.locator('.hist-card').nth(n - 1)
            last_text = last.locator('.hist-main').inner_text()
            last.locator('.pin-btn').click()
            expect(page.locator('.hist-card').first).to_have_class('hist-card pinned')
            assert page.locator('.hist-card .hist-main').first.inner_text() == last_text
            # 編集で削除してもシフトは残る
            page.click('[data-sh="edit"]')
            page.locator('.hist-card').filter(has_text='OP-LA').locator('.hist-main').click()
            expect(page.locator('.hist-card').filter(has_text='OP-LA')).to_have_count(0)
            page.click('[data-sh="edit"]')
            page.locator('.backdrop').click(position={'x': 10, 'y': 10})
            expect(cell(page, '2026-12-03')).to_contain_text('OP-LA')
        check('T17/T19/ピン', '履歴の再使用・ピン留め・削除', history)

        def sheet_close():
            add_btn()
            # iOS Safari は cursor:pointer のない要素のタップを click として扱わないため、背景に必要
            assert page.evaluate("getComputedStyle(document.querySelector('.backdrop')).cursor") == 'pointer'
            page.click('[data-sh="close"]')
            expect(page.locator('.sheet')).to_have_count(0)
            page.click('.tabbar [data-tab="other"]')
            page.click('[data-action="template"][data-wd="0"]')
            expect(page.locator('.sheet')).to_be_visible()
            page.click('[data-sh="close"]')
            expect(page.locator('.sheet')).to_have_count(0)
            expect(page.locator('.backdrop')).to_have_count(0)
            page.click('.tabbar [data-tab="hope"]')
        check('SHEET', 'シートは✕で閉じられる（その他の曜日のいつものも）', sheet_close)

        def overwrite_clear():
            cell(page, '2026-12-07').click()
            expect(page.locator('.day-entry')).to_contain_text('勤務不可')
            add_btn()
            page.click('[data-sh="available"]')
            expect(cell(page, '2026-12-07')).to_contain_text('○')
            cell(page, '2026-12-07').click()
            add_btn()
            page.click('[data-sh="clear"]')
            expect(cell(page, '2026-12-07').locator('.cal-val')).to_have_count(0)
            assert 'selected' in cell(page, '2026-12-07').get_attribute('class')
        check('T15/T16', '上書き・未入力に戻す（留まる）', overwrite_clear)

        def edit_existing():
            cell(page, '2026-12-01').click()
            page.click('.day-entry')
            expect(page.locator('#editor-title')).to_have_text('シフトの編集')
            expect(page.get_by_test_id('editor-output')).to_have_text('18:45-23')
            page.click('[data-ed="close"]')
        check('Q11', '入力済みの日は編集画面で現在の値を表示', edit_existing)

        def bulk():
            page.click('[data-action="multi"]')
            for d in ('2026-12-10', '2026-12-14', '2026-12-12'):
                cell(page, d).click()
            expect(page.locator('.day-band')).to_contain_text('3日を選択中')
            add_btn()
            expect(page.locator('.sheet-title')).to_have_text('3日にまとめて追加')
            page.click('[data-sh="available"]')
            for d in ('2026-12-10', '2026-12-14', '2026-12-12'):
                expect(cell(page, d)).to_contain_text('○')
            assert 'selected' in cell(page, '2026-12-13').get_attribute('class')
            expect(page.locator('[data-action="multi"]')).to_have_attribute('aria-pressed', 'false')
        check('T14/Q02', '複数選択→最後にタップした日の翌日', bulk)

        def month_end():
            cell(page, '2026-12-31').click()
            add_btn()
            page.click('[data-sh="unavailable"]')
            expect(page.locator('.month-title .m')).to_have_text('1')
            assert 'selected' in cell(page, '2027-01-01').get_attribute('class')
            page.click('[data-action="prev"]')
        check('T13(v2)', '月末に入力すると翌月1日へ', month_end)

        def list_view():
            page.click('[data-action="view-list"]')
            expect(page.locator('.list-row')).to_have_count(31)
            expect(page.locator('.list-row[data-date="2026-12-01"]')).to_contain_text('18:45')
            page.screenshot(path=OUT / 'v2_05_list.png')
            page.locator('.list-row[data-date="2026-12-15"]').click()
            expect(page.locator('.sheet-title')).to_contain_text('12月15日')
            page.click('[data-sh="unavailable"]')
            expect(page.locator('.list-row[data-date="2026-12-15"]')).to_contain_text('勤務不可')
            page.click('[data-action="view-calendar"]')
            expect(cell(page, '2026-12-15')).to_contain_text('×')
        check('LIST', 'リスト表示で入力', list_view)

        # ---- 曜日のいつもの ----
        def templates():
            page.click('.tabbar [data-tab="other"]')
            page.click('[data-action="template"][data-wd="2"]')  # 火曜
            page.click('[data-sh="new"]')
            expect(page.locator('#editor-title')).to_have_text('火曜日のいつもの')
            page.click('[data-ed="mode"][data-key="end"][data-mode="last"]')
            expect(page.get_by_test_id('editor-output')).to_have_text('19-LA')  # 未登録の曜日は既定の19:00から
            page.click('[data-ed="done"]')
            expect(page.locator('[data-action="template"][data-wd="2"]')).to_contain_text('19-LA')
            page.click('[data-action="template"][data-wd="6"]')  # 土曜
            page.click('[data-sh="unavailable"]')
            expect(page.locator('[data-action="template"][data-wd="6"]')).to_contain_text('×')
            # まとめて入力（12月後半：火 22,29 / 土 19,26 のうち未入力のみ）— 希望シフト画面の「いつもので埋める」
            page.click('.tabbar [data-tab="hope"]')
            page.click('.topbar [data-action="fill"]')
            page.click('.dialog-choices [data-key="2026-12-second"]')
            expect(page.get_by_test_id('toast')).to_contain_text('4日を入力しました')
            expect(cell(page, '2026-12-22')).to_contain_text('19-LA')
            expect(cell(page, '2026-12-19')).to_contain_text('×')
            expect(cell(page, '2026-12-31')).to_contain_text('×')
            # ワンタップ入力
            cell(page, '2026-12-08').click()  # 火曜（入力済み OP-LA）
            cell(page, '2026-12-01').click()
            cell(page, '2026-12-29').click()  # 火曜（まとめて入力済み）
            cell(page, '2026-12-16').click()  # 水曜
            add_btn()
            expect(page.locator('[data-sh="template"]')).to_have_count(0)
            page.locator('.backdrop').click(position={'x': 10, 'y': 10})
            cell(page, '2026-12-15').click()  # 火曜（×入力済み）
            add_btn()
            expect(page.locator('.sheet-label').first).to_have_text('火曜日のいつもの')
            page.click('[data-sh="template"]')
            expect(cell(page, '2026-12-15')).to_contain_text('19-LA')
        check('TPL', '曜日のいつもの：登録・まとめて入力（未入力のみ）・ワンタップ', templates)

        # ---- LINEコピー ----
        def copy_cancel():
            page.evaluate("navigator.clipboard.writeText('BEFORE')")
            page.click('[data-action="copy"]')
            expect(page.locator('#copy-title')).to_have_text('LINE提出用コピー')
            expect(page.locator('.period-chip[aria-checked="true"]')).to_have_text('12月前半')
            page.screenshot(path=OUT / 'v2_06_copy.png')
            page.click('[data-cp="copy"]')
            expect(page.locator('.dialog')).to_contain_text('未入力の日付が')
            page.get_by_test_id('copy-cancel').click()
            assert clipboard(page) == 'BEFORE'
        check('T20', '未入力ありでコピー→取消', copy_cancel)

        def copy_ok():
            page.click('[data-cp="copy"]')
            page.get_by_test_id('copy-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('コピーしました')
            text = clipboard(page)
            lines = text.split('\n')
            assert len(lines) == 15, lines
            assert lines[0] == '12月1日（火）　18:45-23', lines[0]
            assert lines[1] == '12月2日（水）　18:45-30'
            assert lines[6] == '12月7日（月）　×'
            assert page.get_by_test_id('preview').inner_text().strip() == text
        check('T21', '承認で×に変換してコピー（プレビューと一致）', copy_ok)

        def greeting():
            page.click('[data-cp="close"]')
            page.click('.tabbar [data-tab="other"]')
            page.fill('#greet-prefix', 'お疲れ様です。')
            page.fill('#greet-suffix', 'よろしくお願いします。')
            page.get_by_test_id('settings-greet').check()
            page.click('.tabbar [data-tab="hope"]')
            page.click('[data-action="copy"]')
            page.click('.period-chip[data-key="2026-12-second"]')
            page.click('[data-cp="copy"]')
            page.get_by_test_id('copy-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('コピーしました')
            text = clipboard(page)
            assert text.startswith('お疲れ様です。\n12月16日（水）'), text[:30]
            assert text.endswith('\nよろしくお願いします。')
            assert page.get_by_test_id('preview').inner_text().strip() == text
            page.get_by_test_id('greet-toggle').uncheck()
            expect(page.get_by_test_id('preview')).not_to_contain_text('お疲れ様です')
            page.click('[data-cp="close"]')
        check('T22', '挨拶文の切替・編集でプレビューとコピーが一致', greeting)

        def reload():
            page.reload()
            show_dec()
            expect(cell(page, '2026-12-01')).to_contain_text('18:45-23')
            page.click('.tabbar [data-tab="other"]')
            expect(page.locator('[data-action="template"][data-wd="2"]')).to_contain_text('19-LA')
            page.click('.tabbar [data-tab="hope"]')
        check('T23/T24', '再起動後に復元', reload)

        backup_path = OUT / 'backup_v2.json'

        def backup():
            page.click('.tabbar [data-tab="other"]')
            with page.expect_download() as dl:
                page.click('[data-action="export"]')
            dl.value.save_as(backup_path)
            data = json.loads(backup_path.read_text(encoding='utf-8'))
            assert data['data']['schemaVersion'] == 2
            page.click('.tabbar [data-tab="hope"]')
            show_dec()
            cell(page, '2026-12-01').click()
            add_btn()
            page.click('[data-sh="clear"]')
            page.click('.tabbar [data-tab="other"]')
            page.get_by_test_id('restore-file').set_input_files(str(backup_path))
            with page.expect_download() as pre:
                page.get_by_test_id('restore-confirm').click()
            assert 'before-restore' in pre.value.suggested_filename
            expect(page.get_by_test_id('toast')).to_have_text('復元しました')
            page.click('.tabbar [data-tab="hope"]')
            show_dec()
            expect(cell(page, '2026-12-01')).to_contain_text('18:45-23')
        check('T26', 'バックアップ書き出し・復元', backup)

        def v1_restore():
            rng = {'kind': 'range', 'start': {'kind': 'time', 'minutes': 1140}, 'end': {'kind': 'time', 'minutes': 1380}}
            v1 = {'app': 'shift-manager', 'format': 1, 'exportedAt': '2026-11-26T00:00:00Z', 'data': {
                'schemaVersion': 1,
                'requests': {'2026-12-05': {'shift': rng, 'updatedAt': '2026-11-26T00:00:00Z'}},
                'history': [], 'periods': {},
                'settings': {'greetingEnabled': False, 'greetingPrefix': '', 'greetingSuffix': ''}}}
            f = OUT / 'v1.json'
            f.write_text(json.dumps(v1), encoding='utf-8')
            page.click('.tabbar [data-tab="other"]')
            page.get_by_test_id('restore-file').set_input_files(str(f))
            with page.expect_download():
                page.get_by_test_id('restore-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('復元しました')
            page.click('.tabbar [data-tab="hope"]')
            show_dec()
            expect(cell(page, '2026-12-05')).to_contain_text('19-23')
            expect(cell(page, '2026-12-01').locator('.cal-val')).to_have_count(0)
        check('MIG', 'v1のバックアップをv2で復元できる', v1_restore)

        def broken():
            bad = OUT / 'broken.json'
            bad.write_text('{"app":"shift-manager", broken', encoding='utf-8')
            page.click('.tabbar [data-tab="other"]')
            page.get_by_test_id('restore-file').set_input_files(str(bad))
            expect(page.get_by_test_id('toast')).to_contain_text('JSONとして読み込めません')
            page.click('.tabbar [data-tab="hope"]')
            show_dec()
            expect(cell(page, '2026-12-05')).to_contain_text('19-23')
        check('T27', '壊れたJSONはエラー、現データ保持', broken)

        def tab_order():
            tabs = [page.locator('.tabbar button').nth(i).inner_text().strip() for i in range(4)]
            assert tabs == ['確定シフト', '希望シフト', '給料計算', 'その他'], tabs
        check('TAB', '下部タブの並び（確定・希望・給料・その他）', tab_order)

        # ---- 段階②：確定シフト（既知のデータから始めるため、用意したバックアップを復元する） ----
        def tm(m):
            return {'kind': 'time', 'minutes': m}
        def rec(shift):
            return {'shift': shift, 'updatedAt': '2026-11-27T00:00:00Z'}
        def rng(a, b):
            return {'kind': 'range', 'start': a, 'end': b}
        seed = {'app': 'shift-manager', 'format': 1, 'exportedAt': '2026-11-27T00:00:00Z', 'data': {
            'schemaVersion': 2,
            'hopes': {
                '2026-12-01': rec(rng(tm(1140), tm(1380))),
                '2026-12-02': rec(rng({'kind': 'open'}, {'kind': 'last'})),
                '2026-12-03': rec(rng(tm(1140), {'kind': 'none'})),
                '2026-12-04': rec({'kind': 'unavailable'}),
                '2026-12-05': rec({'kind': 'available'}),
                '2026-12-08': rec(rng(tm(1020), tm(1320))),
            },
            'confirmed': {}, 'hopeHistory': [], 'confirmedHistory': [], 'weekdayTemplates': {},
            'pay': {'hourlyWage': None, 'nightStart': 1320, 'nightEnd': 1740, 'nightRatePercent': 25, 'soloBonus': 0,
                    'transportPerDay': 0, 'closingDay': 0, 'payMonthOffset': 1, 'payDay': 15, 'monthlyTarget': 0,
                    'openTime': None, 'lastTime': None},
            'periods': {}, 'settings': {'greetingEnabled': False, 'greetingPrefix': '', 'greetingSuffix': ''}}}

        def cf_add():
            page.locator('.day-panel [data-action="add"]').click()
            expect(page.locator('.sheet')).to_be_visible()

        def cf_seed():
            f = OUT / 'seed_cf.json'
            f.write_text(json.dumps(seed), encoding='utf-8')
            page.click('.tabbar [data-tab="other"]')
            page.get_by_test_id('restore-file').set_input_files(str(f))
            with page.expect_download():
                page.get_by_test_id('restore-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('復元しました')
            page.click('.tabbar [data-tab="confirmed"]')
            show_dec()
            expect(cell(page, '2026-12-01').locator('.cal-val')).to_have_count(0)
            expect(cell(page, '2026-12-04').locator('.cal-val')).to_have_count(0)
            page.screenshot(path=OUT / 'v2_09_confirmed.png')
        check('CF-01', '確定タブのカレンダーに希望の時間は出さない', cf_seed)

        def cf_ashope():
            cell(page, '2026-12-01').click()
            expect(page.get_by_test_id('panel-hope')).to_contain_text('19-23')
            cf_add()
            expect(page.locator('[data-cs="ashope"]')).to_contain_text('希望をもとに確定（19-23）')
            page.screenshot(path=OUT / 'v2_10_cf_sheet.png')
            page.click('[data-cs="ashope"]')
            expect(page.locator('#cf-title')).to_have_text('希望をもとに確定')
            expect(page.locator('[data-cf="chip"][data-key="start"]')).to_have_text('19:00')
            expect(page.locator('[data-cf="chip"][data-key="end"]')).to_have_text('23:00')
            page.click('[data-cf="chip"][data-key="end"]')
            vp = page.locator('[data-slot="end"] .wheel-vp').nth(1)
            vp.focus()
            for _ in range(30):
                vp.press('ArrowDown')  # その場で 23:30 に直す
            expect(page.get_by_test_id('cf-output')).to_have_text('19-23:30')
            page.click('[data-cf="done"]')
            expect(cell(page, '2026-12-01').locator('.cal-val.cf')).to_have_text('19-23:30')
            assert 'selected' in cell(page, '2026-12-02').get_attribute('class')
        check('CF-02', '希望をもとに確定：希望の時間が入った画面でその場で修正→翌日へ', cf_ashope)

        def cf_oplast_unset():
            cf_add()
            expect(page.locator('[data-cs="ashope"]')).to_have_text('希望をもとに確定…')
            page.click('[data-cs="ashope"]')
            expect(page.get_by_test_id('cf-note')).to_contain_text('オープン・ラストの時刻が未設定です')
            expect(page.get_by_test_id('cf-hope')).to_contain_text('OP-LA')
            page.click('[data-cf="close"]')
            expect(cell(page, '2026-12-02').locator('.cal-val.cf')).to_have_count(0)
        check('CF-03', 'OP/LAの時刻が未設定なら入力画面へ案内', cf_oplast_unset)

        def cf_oplast_set():
            page.click('.tabbar [data-tab="other"]')
            page.click('[data-action="open-last"][data-field="openTime"]')
            page.get_by_test_id('time-set').click()
            page.click('[data-action="open-last"][data-field="lastTime"]')
            page.get_by_test_id('time-set').click()
            expect(page.locator('[data-action="open-last"][data-field="openTime"]')).to_contain_text('10:00')
            expect(page.locator('[data-action="open-last"][data-field="lastTime"]')).to_contain_text('29:00')
            page.click('.tabbar [data-tab="confirmed"]')
            cell(page, '2026-12-02').click()
            cf_add()
            expect(page.locator('[data-cs="ashope"]')).to_contain_text('（10-29）')
            page.click('[data-cs="ashope"]')
            expect(page.locator('[data-cf="chip"][data-key="start"]')).to_have_text('10:00')
            expect(page.locator('[data-cf="chip"][data-key="end"]')).to_have_text('29:00')
            expect(page.get_by_test_id('cf-note')).to_have_count(0)
            page.click('[data-cf="done"]')
            expect(cell(page, '2026-12-02').locator('.cal-val.cf')).to_have_text('10-29')
        check('CF-04', 'OP/LAの時刻を登録すると希望をもとにその時刻が入る', cf_oplast_set)

        def cf_editor():
            cell(page, '2026-12-03').click()
            cf_add()
            page.click('[data-cs="ashope"]')
            expect(page.get_by_test_id('cf-note')).to_contain_text('時刻が決まっていません')
            expect(page.locator('[data-cf="chip"][data-key="start"]')).to_have_text('19:00')
            page.click('[data-cf="chip"][data-key="end"]')
            vp = page.locator('[data-slot="end"] .wheel-vp').nth(0)
            vp.focus()
            vp.press('Home')  # 10時 → 開始より前
            expect(page.get_by_test_id('cf-error')).to_be_visible()
            expect(page.locator('[data-cf="done"]')).to_be_disabled()
            vp.press('End')  # 30時
            page.click('[data-cf="break"][data-min="30"]')
            page.get_by_test_id('cf-solo').check()
            page.get_by_test_id('cf-wage').fill('1300')
            page.get_by_test_id('cf-memo').fill('棚卸し')
            expect(page.get_by_test_id('cf-output')).to_have_text('19-30')
            expect(page.get_by_test_id('cf-detail')).to_have_text('休憩30分・一人・時給1,300円')
            page.get_by_test_id('cf-break').fill('700')
            expect(page.locator('[data-cf="done"]')).to_be_disabled()
            page.click('[data-cf="break"][data-min="30"]')
            page.screenshot(path=OUT / 'v2_11_cf_editor.png')
            page.click('[data-cf="done"]')
            expect(cell(page, '2026-12-03').locator('.cal-val.cf')).to_have_text('19-30')
            cell(page, '2026-12-03').click()
            expect(page.locator('.day-entry')).to_contain_text('休憩30分・一人・時給1,300円')
            expect(page.locator('.day-entry')).to_contain_text('棚卸し')
        check('CF-05', '入力画面：休憩・一人シフト・時給・メモ、不正値は完了不可', cf_editor)

        def cf_unavailable():
            cell(page, '2026-12-04').click()
            cf_add()
            expect(page.get_by_test_id('sheet-hope')).to_contain_text('×')
            expect(page.locator('[data-cs="ashope"]')).to_have_count(0)
            page.locator('.backdrop').click(position={'x': 10, 'y': 10})
        check('CF-06', '希望が×の日は希望どおりボタンを出さない', cf_unavailable)

        def cf_bulk():
            page.click('[data-action="bulk"]')
            page.click('.dialog-choices [data-k="hope"]')
            page.click('.dialog-choices [data-key="2026-12-first"]')
            expect(page.get_by_test_id('toast')).to_have_text('2日を確定しました')
            expect(cell(page, '2026-12-05').locator('.cal-val.cf')).to_have_text('10-29')
            expect(cell(page, '2026-12-08').locator('.cal-val.cf')).to_have_text('17-22')
            expect(cell(page, '2026-12-03').locator('.cal-val.cf')).to_have_text('19-30')
            expect(cell(page, '2026-12-01').locator('.cal-val.cf')).to_have_text('19-23:30')
        check('CF-07', '希望どおりにまとめて確定（確定済みは変えない）', cf_bulk)

        def cf_template():
            page.click('.tabbar [data-tab="other"]')
            expect(page.locator('.section-header').filter(has_text='曜日のいつもの（希望・確定で共通）')).to_have_count(1)
            expect(page.locator('[data-action="template-cf"]')).to_have_count(0)
            page.click('[data-action="template"][data-wd="3"]')
            page.click('[data-sh="new"]')
            page.click('[data-ed="done"]')
            expect(page.locator('[data-action="template"][data-wd="3"]')).to_contain_text('19-23')
            page.click('.tabbar [data-tab="confirmed"]')
            page.click('[data-action="bulk"]')
            page.click('.dialog-choices [data-k="tpl"]')
            page.click('.dialog-choices [data-key="2026-12-first"]')
            expect(page.get_by_test_id('toast')).to_have_text('1日を確定しました')
            expect(cell(page, '2026-12-09').locator('.cal-val.cf')).to_have_text('19-23')
            cell(page, '2026-12-16').click()
            cf_add()
            expect(page.locator('.sheet-label').filter(has_text='水曜日のいつもの')).to_have_count(1)
            expect(page.locator('[data-cs="template"]')).to_have_text('19-23')
            page.click('[data-cs="template"]')
            expect(cell(page, '2026-12-16').locator('.cal-val.cf')).to_have_text('19-23')
        check('CF-08', '曜日のいつもの（希望と共通）：まとめて確定・ワンタップ確定', cf_template)

        def cf_history_clear():
            cell(page, '2026-12-10').click()
            cf_add()
            cards = page.locator('.hist-card .hist-main')
            texts = [cards.nth(i).inner_text() for i in range(cards.count())]
            assert any('休憩30分' in t for t in texts), texts
            page.locator('.hist-card').filter(has_text='休憩30分').locator('.hist-main').click()
            expect(cell(page, '2026-12-10').locator('.cal-val.cf')).to_have_text('19-30')
            cell(page, '2026-12-10').click()
            expect(page.locator('.day-entry')).not_to_contain_text('一人')
            cf_add()
            page.click('[data-cs="clear"]')
            expect(cell(page, '2026-12-10').locator('.cal-val.cf')).to_have_count(0)
            assert 'selected' in cell(page, '2026-12-10').get_attribute('class')
        check('CF-09', '確定の履歴から入力・確定を取り消す', cf_history_clear)

        def cf_edit_existing():
            cell(page, '2026-12-03').click()
            page.click('.day-entry')
            expect(page.locator('#cf-title')).to_have_text('確定シフトの編集')
            expect(page.get_by_test_id('cf-solo')).to_be_checked()
            expect(page.get_by_test_id('cf-wage')).to_have_value('1300')
            page.click('[data-cf="close"]')
        check('CF-10', '確定済みの日は編集画面に現在の値', cf_edit_existing)

        def cf_multi():
            page.click('[data-action="multi"]')
            for d in ('2026-12-11', '2026-12-12'):
                cell(page, d).click()
            cf_add()
            page.click('[data-cs="new"]')
            page.click('[data-cf="done"]')
            expect(cell(page, '2026-12-11').locator('.cal-val.cf')).to_be_visible()
            expect(cell(page, '2026-12-12').locator('.cal-val.cf')).to_be_visible()
        check('CF-11', '複数選択でまとめて確定入力', cf_multi)

        def cf_persist():
            page.wait_for_timeout(400)
            page.reload()
            page.click('.tabbar [data-tab="confirmed"]')
            show_dec()
            expect(cell(page, '2026-12-03').locator('.cal-val.cf')).to_have_text('19-30')
            page.click('.tabbar [data-tab="hope"]')
            expect(cell(page, '2026-12-03')).to_contain_text('19-')
            expect(cell(page, '2026-12-01')).to_contain_text('19-23')
            page.click('[data-action="copy"]')
            page.click('.period-chip[data-key="2026-12-first"]')
            assert page.get_by_test_id('preview').locator('div').nth(1).inner_text() == '12月2日（水）\u3000OP-LA'
            page.click('[data-cp="close"]')
        check('CF-12', '再起動後も確定が残り、希望・LINEコピーは確定の影響を受けない', cf_persist)

        # ---- 段階③：給料計算（unit test と同じ手計算の値で確認） ----
        def cfr(a, b, brk=0, solo=False, wage=None):
            return {'start': a, 'end': b, 'breakMinutes': brk, 'solo': solo, 'hourlyWage': wage, 'memo': '', 'updatedAt': '2026-11-27T00:00:00Z'}
        pay_seed = json.loads(json.dumps(seed))
        pay_seed['data']['hopes'] = {
            '2026-11-10': rec(rng(tm(1140), tm(1380))),
            '2026-11-11': rec(rng({'kind': 'open'}, {'kind': 'last'})),
        }
        pay_seed['data']['confirmed'] = {
            '2026-11-02': cfr(1140, 1380),
            '2026-11-03': cfr(1080, 1740, 60, True),
            '2026-11-04': cfr(600, 930, 30, False, 1100),
            '2026-11-06': cfr(1140, 1147, 0, False, 1111),
            '2026-12-01': cfr(1140, 1380),
        }

        def pay_seeded():
            f = OUT / 'seed_pay.json'
            f.write_text(json.dumps(pay_seed), encoding='utf-8')
            page.click('.tabbar [data-tab="other"]')
            page.get_by_test_id('restore-file').set_input_files(str(f))
            with page.expect_download():
                page.get_by_test_id('restore-confirm').click()
            expect(page.get_by_test_id('toast')).to_have_text('復元しました')
            page.click('.tabbar [data-tab="pay"]')
            expect(page.locator('.pt-main')).to_have_text('2026年12月15日')
            expect(page.get_by_test_id('no-wage')).to_be_visible()
            expect(page.get_by_test_id('pay-days')).to_have_text('4日')
        check('PAY-01', '時給未設定では案内を表示（出勤日数は数える）', pay_seeded)

        def pay_settings():
            page.click('.pay-page [data-action="settings"]')
            expect(page.locator('#pay-title')).to_have_text('給料の設定')
            page.fill('[data-ps-f="hourlyWage"]', '1200.5')
            page.click('[data-ps="save"]')
            expect(page.get_by_test_id('toast')).to_contain_text('不正な値')
            page.fill('[data-ps-f="hourlyWage"]', '1200')
            page.fill('[data-ps-f="soloBonus"]', '100')
            page.fill('[data-ps-f="transportPerDay"]', '420')
            page.fill('[data-ps-f="monthlyTarget"]', '80000')
            expect(page.get_by_test_id('ps-example')).to_have_text('末日締め、翌月15日払い。')
            page.click('[data-ps="save"]')
            expect(page.locator('#pay-title')).to_have_count(0)
            expect(page.get_by_test_id('pay-total')).to_have_text('¥27,684')
            expect(page.get_by_test_id('pay-hours')).to_have_text('19時間7分')
            expect(page.get_by_test_id('pay-night')).to_have_text('¥2,575')
            expect(page.get_by_test_id('pay-solo')).to_have_text('¥1,000')
            expect(page.get_by_test_id('pay-transport')).to_have_text('¥1,680')
            expect(page.get_by_test_id('pay-base')).to_have_text('¥22,429')
            expect(page.get_by_test_id('pay-target')).to_have_text('あと ¥52,316')
            expect(page.get_by_test_id('pay-hope')).to_contain_text('＋¥5,520（1日）')
            expect(page.locator('.pay-row')).to_have_count(4)
            page.screenshot(path=OUT / 'v2_12_pay.png', full_page=True)
        check('PAY-02', '給料の設定→見込み給料・内訳・目標・希望の見込み', pay_settings)

        def pay_nav():
            page.click('.pay-nav [data-action="next"]')
            expect(page.locator('.pt-main')).to_have_text('2027年1月15日')
            expect(page.get_by_test_id('pay-total')).to_have_text('¥5,520')
            page.click('.pay-title')
            expect(page.locator('.pt-main')).to_have_text('2026年12月15日')
        check('PAY-03', '給料日の切り替え（12月の勤務は1月15日払い）', pay_nav)

        def payday_badge():
            page.click('.tabbar [data-tab="confirmed"]')
            show_dec()
            expect(cell(page, '2026-12-15').locator('.pay-badge')).to_be_visible()
            expect(cell(page, '2026-12-14').locator('.pay-badge')).to_have_count(0)
            cell(page, '2026-12-15').click()
            expect(page.get_by_test_id('payday-line')).to_contain_text('¥27,684')
            page.get_by_test_id('payday-line').click()
            expect(page.locator('.pt-main')).to_have_text('2026年12月15日')
        check('PAY-04', '確定カレンダーの給料日に¥印、タップで給料計算へ', payday_badge)

        def pay_closing():
            page.click('.pay-page [data-action="settings"]')
            page.select_option('[data-ps-f="closingDay"]', '15')
            page.select_option('[data-ps-f="payMonthOffset"]', '0')
            page.select_option('[data-ps-f="payDay"]', '25')
            expect(page.get_by_test_id('ps-example')).to_have_text('15日締め、当月25日払い。')
            page.click('[data-ps="save"]')
            page.click('.pay-title')
            expect(page.locator('.pt-main')).to_have_text('2026年12月25日')
            expect(page.locator('.ph-sub')).to_have_text('11月16日〜12月15日の勤務')
            expect(page.get_by_test_id('pay-total')).to_have_text('¥5,520')
            page.click('.pay-page [data-action="settings"]')
            page.select_option('[data-ps-f="closingDay"]', '0')
            page.select_option('[data-ps-f="payMonthOffset"]', '1')
            page.select_option('[data-ps-f="payDay"]', '15')
            page.click('[data-ps="save"]')
            page.click('.pay-title')
            expect(page.get_by_test_id('pay-total')).to_have_text('¥27,684')
        check('PAY-05', '締め日・給料日を変えると対象期間が変わる', pay_closing)

        def pay_persist():
            page.wait_for_timeout(400)
            page.reload()
            page.click('.tabbar [data-tab="pay"]')
            expect(page.get_by_test_id('pay-total')).to_have_text('¥27,684')
            page.click('.tabbar [data-tab="other"]')
            expect(page.locator('.pay-summary')).to_have_text('時給1,200円')
            page.emulate_media(color_scheme='dark')
            page.click('.tabbar [data-tab="pay"]')
            page.screenshot(path=OUT / 'v2_13_pay_dark.png')
            page.emulate_media(color_scheme='light')
            page.click('.tabbar [data-tab="hope"]')
        check('PAY-06', '再起動後も給料の設定と計算が残る', pay_persist)

        def t30():
            page.evaluate("""() => {
              navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
              document.execCommand = () => false;
            }""")
            page.click('[data-action="copy"]')
            page.click('[data-cp="copy"]')
            page.get_by_test_id('copy-confirm').click()
            expect(page.get_by_test_id('manual-copy')).to_be_visible()
            expect(page.get_by_test_id('toast')).to_have_count(0)
            page.locator('.dialog-actions button').click()
            page.click('[data-cp="close"]')
        check('T30', 'コピー失敗時は手動コピーを提示', t30)

        def t31():
            page.evaluate("""() => {
              IDBObjectStore.prototype.put = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
            }""")
            show_dec()
            cell(page, '2026-12-20').click()
            add_btn()
            page.click('[data-sh="available"]')
            expect(page.get_by_test_id('save-error')).to_contain_text('保存に失敗しました')
            page.reload()
            show_dec()
            expect(cell(page, '2026-12-20').locator('.cal-val')).to_have_count(0)
        check('T31', '保存失敗を通知し、保存済みと誤表示しない', t31)

        def dark():
            page.emulate_media(color_scheme='dark')
            assert page.evaluate("getComputedStyle(document.body).backgroundColor") == 'rgb(0, 0, 0)'
            page.screenshot(path=OUT / 'v2_07_dark.png')
            add_btn()
            page.screenshot(path=OUT / 'v2_08_sheet_dark.png')
            page.locator('.backdrop').click(position={'x': 10, 'y': 10})
            page.emulate_media(color_scheme='light')
        check('T28', 'ライト・ダークに追従（エミュレーション）', dark)

        def offline():
            page.evaluate("navigator.serviceWorker.ready.then(() => true)")
            page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
            ctx.set_offline(True)
            page.reload()
            show_dec()
            cell(page, '2026-12-21').click()
            add_btn()
            page.click('[data-sh="unavailable"]')
            expect(cell(page, '2026-12-21')).to_contain_text('×')
            page.wait_for_timeout(500)  # 端末への保存の完了を待ってから再起動する
            page.reload()
            show_dec()
            expect(cell(page, '2026-12-21')).to_contain_text('×')
            ctx.set_offline(False)
        check('T29', 'オフラインで入力・保存（PC Chrome）', offline)

        check('-', 'ページ上のJavaScriptエラーなし', lambda: (_ for _ in ()).throw(AssertionError(errors)) if errors else None)
        browser.close()

    width = max(len(r[0]) for r in results)
    for tid, name, status, msg in results:
        print(f'{status}  {tid.ljust(width)}  {name}' + (f'  -- {msg}' if msg else ''))
    failed = [r for r in results if r[2] == 'FAIL']
    print(f'\n{len(results) - len(failed)}/{len(results)} passed. screenshots: {OUT}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
