// @ts-check
/** 時・分の2列ホイール（v2: 時は10〜30、分は00〜59の1分刻み。30時は30:00のみ） */
import { el } from '../dom.js';
import { createWheel } from './wheel.js';
import { hourOptions, minuteOptions, clampTime, MAX_MINUTES } from '../../domain/shift.js';

/**
 * @param {{ value: number, label: string, onChange: (minutes: number) => void }} p
 */
export function createTimePicker(p) {
  const root = el(`<div class="time-picker" role="group" aria-label="${p.label}"></div>`);
  let h = Math.floor(p.value / 60);
  let m = p.value % 60;
  const emit = () => {
    const v = clampTime(h, m);
    // 30時を選んだら分は00に合わせる
    if (v === MAX_MINUTES && m !== 0) {
      m = 0;
      minute.setValue(0);
    }
    p.onChange(v);
  };
  const hour = createWheel({
    options: hourOptions(), value: h, label: `${p.label}の時`, format: (v) => String(v),
    onChange: (v) => { h = v; emit(); },
  });
  const minute = createWheel({
    options: minuteOptions(), value: m, label: `${p.label}の分`, format: (v) => String(v).padStart(2, '0'),
    onChange: (v) => { m = v; emit(); },
  });
  root.append(hour.el, el(`<div class="time-colon" aria-hidden="true">:</div>`), minute.el);
  return {
    el: root,
    attach() {
      hour.attach();
      minute.attach();
    },
  };
}
