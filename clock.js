(() => {
  'use strict';

  // 預設灰階：背景與前景互為對比
  const DARK_GRAY = '#2b2b2b';
  const LIGHT_GRAY = '#d9d9d9';
  const FG_ON_DARK = '#e0e0e0';  // 淺灰字
  const FG_ON_LIGHT = '#333333'; // 深灰字

  const STORAGE_KEY = 'web-clock-settings';
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  const defaults = {
    mode: 'digital',     // digital | analog
    bg: 'dark',          // dark | light | custom | dynamic
    customColor: '#3a6ea5',
    speed: 10,           // 動態模式：每秒色相變化度數
    showSeconds: true,
    hour24: true,
  };

  const $ = (sel) => document.querySelector(sel);
  const root = document.documentElement;
  const body = document.body;

  const el = {
    digital: $('#digital'),
    analog: $('#analog'),
    time: $('#digital-time'),
    date: $('#digital-date'),
    hour: $('#hand-hour'),
    minute: $('#hand-minute'),
    second: $('#hand-second'),
    ticks: $('#ticks'),
    numbers: $('#numbers'),
    panel: $('#panel'),
    toggle: $('#toggle-panel'),
    custom: $('#custom-color'),
    speed: $('#speed'),
    speedRow: $('#speed-row'),
    showSeconds: $('#show-seconds'),
    hour24: $('#hour24'),
  };

  // ---------- 設定存取 ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* 無法儲存時忽略（例如隱私模式） */
    }
  }

  const settings = loadSettings();

  // ---------- 色彩工具 ----------
  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  }

  // WCAG 相對亮度
  function luminance([r, g, b]) {
    const c = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrastRatio(l1, l2) {
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
  }

  const LUM_FG_DARK = luminance(hexToRgb(FG_ON_LIGHT));
  const LUM_FG_LIGHT = luminance(hexToRgb(FG_ON_DARK));

  // 依背景挑選對比較高的灰色作為前景（指針 / 數字）
  function contrastFg(rgb) {
    const lum = luminance(rgb);
    return contrastRatio(lum, LUM_FG_DARK) >= contrastRatio(lum, LUM_FG_LIGHT)
      ? FG_ON_LIGHT
      : FG_ON_DARK;
  }

  let currentFg = null;
  function applyColors(bgCss, rgb) {
    root.style.setProperty('--bg', bgCss);
    const fg = contrastFg(rgb);
    if (fg !== currentFg) {
      currentFg = fg;
      root.style.setProperty('--fg', fg);
    }
  }

  function applyStaticBackground() {
    body.classList.toggle('dynamic', settings.bg === 'dynamic');
    el.speedRow.hidden = settings.bg !== 'dynamic';
    if (settings.bg === 'dynamic') return; // 由動畫迴圈處理

    const hex = settings.bg === 'dark' ? DARK_GRAY
      : settings.bg === 'light' ? LIGHT_GRAY
      : settings.customColor;
    applyColors(hex, hexToRgb(hex));
  }

  function updateDynamicBackground(now) {
    const hue = (now / 1000 * settings.speed) % 360;
    const rgb = hslToRgb(hue, 55, 50);
    applyColors(`rgb(${rgb.join(',')})`, rgb);
  }

  // ---------- 指針鐘刻度 ----------
  function buildDial() {
    const ns = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 60; i++) {
      const major = i % 5 === 0;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('class', `tick ${major ? 'major' : 'minor'}`);
      line.setAttribute('x1', 0);
      line.setAttribute('x2', 0);
      line.setAttribute('y1', -90);
      line.setAttribute('y2', major ? -81 : -86);
      line.setAttribute('transform', `rotate(${i * 6})`);
      el.ticks.appendChild(line);
    }
    for (let h = 1; h <= 12; h++) {
      const a = (h * 30) * Math.PI / 180;
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('class', 'num');
      text.setAttribute('x', (Math.sin(a) * 70).toFixed(2));
      text.setAttribute('y', (-Math.cos(a) * 70).toFixed(2));
      text.textContent = h;
      el.numbers.appendChild(text);
    }
  }

  // ---------- 繪製 ----------
  const pad = (n) => String(n).padStart(2, '0');
  let lastDigital = '';
  let lastDate = '';

  function renderDigital(d) {
    let h = d.getHours();
    let suffix = '';
    if (!settings.hour24) {
      suffix = h < 12 ? 'AM' : 'PM';
      h = h % 12 || 12;
    }
    let text = `${pad(h)}:${pad(d.getMinutes())}`;
    if (settings.showSeconds) text += `:${pad(d.getSeconds())}`;
    const key = text + suffix;
    if (key !== lastDigital) {
      lastDigital = key;
      el.time.textContent = text;
      if (suffix) {
        const span = document.createElement('span');
        span.className = 'ampm';
        span.textContent = suffix;
        el.time.appendChild(span);
      }
    }

    const date = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WEEKDAYS[d.getDay()]}）`;
    if (date !== lastDate) {
      lastDate = date;
      el.date.textContent = date;
    }
  }

  function renderAnalog(d) {
    const ms = d.getMilliseconds();
    const s = d.getSeconds() + ms / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    el.second.setAttribute('transform', `rotate(${s * 6})`);
    el.minute.setAttribute('transform', `rotate(${m * 6})`);
    el.hour.setAttribute('transform', `rotate(${h * 30})`);
  }

  function frame(now) {
    const d = new Date();
    if (settings.mode === 'digital') renderDigital(d);
    else renderAnalog(d);
    if (settings.bg === 'dynamic') updateDynamicBackground(now);
    requestAnimationFrame(frame);
  }

  // ---------- 套用設定 ----------
  function applyMode() {
    el.digital.hidden = settings.mode !== 'digital';
    el.analog.hidden = settings.mode !== 'analog';
    lastDigital = '';
  }

  function applyOptions() {
    body.classList.toggle('no-seconds', !settings.showSeconds);
    lastDigital = '';
  }

  function syncControls() {
    document.querySelector(`input[name="mode"][value="${settings.mode}"]`).checked = true;
    document.querySelector(`input[name="bg"][value="${settings.bg}"]`).checked = true;
    el.custom.value = settings.customColor;
    el.speed.value = settings.speed;
    el.showSeconds.checked = settings.showSeconds;
    el.hour24.checked = settings.hour24;
  }

  // ---------- 事件 ----------
  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      settings.mode = input.value;
      applyMode();
      saveSettings();
    });
  });

  document.querySelectorAll('input[name="bg"]').forEach((input) => {
    input.addEventListener('change', () => {
      settings.bg = input.value;
      applyStaticBackground();
      saveSettings();
    });
  });

  el.custom.addEventListener('input', () => {
    settings.customColor = el.custom.value;
    settings.bg = 'custom';
    document.querySelector('input[name="bg"][value="custom"]').checked = true;
    applyStaticBackground();
    saveSettings();
  });

  el.speed.addEventListener('input', () => {
    settings.speed = Number(el.speed.value);
    saveSettings();
  });

  el.showSeconds.addEventListener('change', () => {
    settings.showSeconds = el.showSeconds.checked;
    applyOptions();
    saveSettings();
  });

  el.hour24.addEventListener('change', () => {
    settings.hour24 = el.hour24.checked;
    lastDigital = '';
    saveSettings();
  });

  function setPanel(open) {
    el.panel.hidden = !open;
    el.toggle.setAttribute('aria-expanded', String(open));
  }

  el.toggle.addEventListener('click', () => setPanel(el.panel.hidden));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setPanel(false);
  });
  document.addEventListener('click', (e) => {
    if (!el.panel.hidden && !el.panel.contains(e.target) && e.target !== el.toggle) {
      setPanel(false);
    }
  });

  // ---------- 啟動 ----------
  buildDial();
  syncControls();
  applyMode();
  applyOptions();
  applyStaticBackground();
  requestAnimationFrame(frame);
})();
