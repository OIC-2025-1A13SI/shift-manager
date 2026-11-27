// @ts-check
/** 給料計算タブ（docs/v2_redesign.md §3.6） */
import { el, esc, delegate } from '../dom.js';
import { parseDateKey, todayKey, addMonths, weekdayOf, WEEKDAYS } from '../../domain/calendar.js';
import { summarizePay, upcomingPayMonth, formatDuration, formatYen } from '../../domain/pay.js';
import { formatConfirmed } from '../../domain/confirmed.js';
import { openPaySettings } from '../components/paySettingsPage.js';

/** @typedef {import('../../application/controller.js').State} State */
/** @typedef {ReturnType<typeof import('../../application/controller.js').createController>} Controller */

/** "11月1日" @param {string} d */
const md = (d) => `${parseDateKey(d).month}月${parseDateKey(d).day}日`;

/** @param {Controller} c @param {() => Date} now */
export function createPayScreen(c, now) {
  const root = el(`<div class="screen pay-screen" data-screen="pay"></div>`);
  const current = () => c.getState().payMonth ?? upcomingPayMonth(todayKey(now()), c.getState().data.pay);

  delegate(root, {
    prev: () => c.setPayMonth(addMonths(current(), -1)),
    next: () => c.setPayMonth(addMonths(current(), 1)),
    upcoming: () => c.setPayMonth(null),
    settings: () => openPaySettings(c),
  });

  /** @param {State} s */
  function update(s) {
    const pay = s.data.pay;
    const m = current();
    const r = summarizePay(m, s.data.confirmed, s.data.hopes, pay);
    const { sum } = r;
    const p = parseDateKey(r.period.payday);
    const noWage = pay.hourlyWage === null;
    const target = pay.monthlyTarget;
    const ratio = target > 0 ? Math.min(sum.total / target, 1) : 0;
    const diff = target - sum.total;
    const banners = [s.loadError, s.saveError].filter(Boolean).map((x) => `<div class="banner" role="alert">${esc(x)}</div>`).join('');

    const rows = r.days.map(({ date, c: cf, pay: dp }) => {
      const wd = weekdayOf(date);
      return `<div class="pay-row">
          <span class="pr-date">${md(date)}<span class="${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">(${WEEKDAYS[wd]})</span></span>
          <span class="pr-time">${esc(formatConfirmed(cf))}${cf.breakMinutes || cf.solo ? `<small>${esc([cf.breakMinutes ? `休憩${cf.breakMinutes}分` : '', cf.solo ? '一人' : ''].filter(Boolean).join('・'))}</small>` : ''}</span>
          <span class="pr-hours">${dp ? esc(formatDuration(dp.paidMinutes)) : ''}</span>
          <span class="pr-yen">${dp ? esc(formatYen(dp.total)) : '—'}</span>
        </div>`;
    }).join('');

    root.innerHTML = `
      <header class="navbar pay-nav">
        <span class="left"><button type="button" class="month-arrow" data-action="prev" aria-label="前の給料日">‹</button></span>
        <button type="button" class="pay-title" data-action="upcoming" aria-label="次の給料日に戻る">
          <span class="pt-main">${p.year}年${p.month}月${p.day}日</span><span class="pt-sub">支給分</span>
        </button>
        <span class="right"><button type="button" class="month-arrow" data-action="next" aria-label="次の給料日">›</button></span>
      </header>
      <main class="page pay-page">
        ${banners}
        ${noWage ? `<div class="banner info" data-testid="no-wage">基本時給が未設定です。<button type="button" class="inline-link" data-action="settings">給料の設定</button>で時給を入れると計算できます。</div>` : ''}
        <section class="pay-hero" aria-label="見込み給料">
          <div class="ph-label">見込み給料（確定シフト）</div>
          <div class="ph-amount" data-testid="pay-total">${esc(formatYen(sum.total))}</div>
          <div class="ph-sub">${esc(`${md(r.period.from)}〜${md(r.period.to)}の勤務`)}</div>
          <div class="ph-stats">
            <div><span>出勤</span><strong data-testid="pay-days">${sum.days}日</strong></div>
            <div><span>勤務時間</span><strong data-testid="pay-hours">${esc(formatDuration(sum.paidMinutes))}</strong></div>
            <div><span>うち深夜</span><strong>${esc(formatDuration(sum.nightMinutes))}</strong></div>
          </div>
          ${r.computable ? '' : '<p class="ph-warn">時給が決まらない日があるため、その日の給料は含めていません。</p>'}
        </section>

        ${target > 0 ? `
        <section class="pay-card" aria-label="目標">
          <div class="row-between"><span class="pc-title">目標 ${esc(formatYen(target))}</span>
            <span class="pc-note" data-testid="pay-target">${diff > 0 ? `あと ${esc(formatYen(diff))}` : `${esc(formatYen(-diff))} 上回っています`}</span></div>
          <div class="target-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${sum.total}">
            <span style="width:${(ratio * 100).toFixed(1)}%"></span></div>
        </section>` : ''}

        <section class="pay-card" aria-label="内訳">
          <div class="pc-title">内訳</div>
          <dl class="breakdown">
            <div><dt>通常分</dt><dd data-testid="pay-base">${esc(formatYen(sum.base))}</dd></div>
            <div><dt>深夜割増</dt><dd data-testid="pay-night">${esc(formatYen(sum.nightPremium))}</dd></div>
            <div><dt>一人シフト加算</dt><dd data-testid="pay-solo">${esc(formatYen(sum.soloBonus))}</dd></div>
            <div><dt>交通費</dt><dd data-testid="pay-transport">${esc(formatYen(sum.transport))}</dd></div>
            <div class="total"><dt>合計</dt><dd>${esc(formatYen(sum.total))}</dd></div>
          </dl>
        </section>

        ${r.hope.days || r.hope.unknown ? `
        <section class="pay-card" aria-label="希望の日を含めた見込み">
          <div class="pc-title">まだ確定していない希望の日</div>
          ${r.hope.days ? `<p class="pc-line" data-testid="pay-hope">希望どおりに確定すると ＋${esc(formatYen(r.hope.total))}（${r.hope.days}日）→ 合計 <strong>${esc(formatYen(sum.total + r.hope.total))}</strong></p>` : ''}
          ${r.hope.unknown ? `<p class="pc-note">${r.hope.unknown}日は時間が決まらないため含めていません。</p>` : ''}
          <p class="pc-note">休憩なし・一人シフトなしとして計算しています。</p>
        </section>` : ''}

        <section class="pay-card" aria-label="日ごとの給料">
          <div class="pc-title">日ごとの給料</div>
          ${rows || '<p class="pc-note">この期間の確定シフトはまだありません。確定シフトタブで入力すると、ここに並びます。</p>'}
        </section>

        <button type="button" class="dashed-add" data-action="settings">給料の設定</button>
      </main>`;
  }

  return { el: root, update };
}
