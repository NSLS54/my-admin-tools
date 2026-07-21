/* ─────────────────────────────────────────────
   개인자산관리 — 애플리케이션 로직
   데이터는 브라우저 localStorage에 저장됩니다.
   ───────────────────────────────────────────── */

(function () {
  'use strict';

  const STORAGE_KEY = 'pam-data-v1';
  const THEME_KEY = 'pam-theme';

  const CATEGORIES = [
    { key: 'realestate', label: '부동산', icon: '🏠', colorVar: '--c-realestate' },
    { key: 'stock', label: '주식', icon: '📈', colorVar: '--c-stock' },
    { key: 'crypto', label: '가상자산', icon: '🪙', colorVar: '--c-crypto' },
    { key: 'deposit', label: '예금', icon: '🏦', colorVar: '--c-deposit' },
  ];

  // 카테고리 내부 항목용 팔레트
  const ITEM_PALETTE = [
    '#3b6ef5', '#e5484d', '#f5a623', '#2fa66a', '#7a5cf0',
    '#12a5b8', '#e0679e', '#8a9a2f', '#c26a3c', '#5570a8',
  ];

  /* ───────── 데이터 ───────── */

  let data = load();
  // { passwordHash: string|null, months: { 'YYYY-MM': { saved, realestate:[], stock:[], crypto:[], deposit:[] } } }

  const unlockedMonths = new Set(); // 이번 세션에서 비밀번호로 잠금 해제한 월
  let currentMonth = thisMonth();
  let selectedCategory = null; // null = 전체

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.months) return parsed;
      }
    } catch (e) { /* 손상된 데이터는 무시 */ }
    return { passwordHash: null, months: {} };
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function emptyMonth() {
    return { saved: false, realestate: [], stock: [], crypto: [], deposit: [] };
  }

  function getMonth(m) {
    if (!data.months[m]) data.months[m] = emptyMonth();
    return data.months[m];
  }

  function thisMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function isEditable(m) {
    const md = data.months[m];
    if (!md || !md.saved) return true;
    return unlockedMonths.has(m);
  }

  /* ───────── 비밀번호 (4자리) ───────── */

  function hashPin(pin) {
    // 간단한 솔트 해시 — 평문 저장 방지 목적
    let h = 5381;
    const s = 'pam-salt::' + pin;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return 'h' + h.toString(36);
  }

  /* ───────── 금액 계산/표기 ───────── */

  function itemValue(catKey, item) {
    if (catKey === 'realestate') {
      return item.dealType === '매매' ? (item.price || 0) : (item.deposit || 0);
    }
    if (catKey === 'stock' || catKey === 'crypto') {
      // 현재 평가금액이 입력되어 있으면 평가금액, 아니면 매입금액 기준
      return item.currentValue || item.amount || 0;
    }
    return item.amount || 0;
  }

  // 직전 월(데이터가 있는 가장 가까운 이전 월) 키
  function prevMonthKey(m) {
    const keys = Object.keys(data.months).filter(function (k) {
      return k < m && monthTotal(data.months[k]) > 0;
    }).sort();
    return keys.length ? keys[keys.length - 1] : null;
  }

  function catTotal(monthData, catKey) {
    return (monthData[catKey] || []).reduce((s, it) => s + itemValue(catKey, it), 0);
  }

  function monthTotal(monthData) {
    return CATEGORIES.reduce((s, c) => s + catTotal(monthData, c.key), 0);
  }

  function comma(n) {
    return Number(n).toLocaleString('ko-KR');
  }

  function formatKRW(n) {
    n = Math.round(n || 0);
    if (n === 0) return '0원';
    const eok = Math.floor(n / 1e8);
    const man = Math.floor((n % 1e8) / 1e4);
    const won = n % 1e4;
    const parts = [];
    if (eok) parts.push(comma(eok) + '억');
    if (man) parts.push(comma(man) + '만');
    if (!eok && !man) return comma(n) + '원';
    if (won) parts.push(comma(won) + '원');
    else parts[parts.length - 1] += '원';
    return parts.join(' ');
  }

  function shortKRW(n) {
    n = Math.round(n || 0);
    if (n >= 1e8) {
      const v = n / 1e8;
      return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + '억';
    }
    if (n >= 1e4) return comma(Math.round(n / 1e4)) + '만';
    return comma(n);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cssColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // 주택청약저축 가입기간: "N년 M개월"
  function subscriptionPeriod(joinDate) {
    if (!joinDate) return '';
    const from = new Date(joinDate + 'T00:00:00');
    const now = new Date();
    let months = (now.getFullYear() - from.getFullYear()) * 12 + (now.getMonth() - from.getMonth());
    if (now.getDate() < from.getDate()) months--;
    if (months < 0) months = 0;
    const y = Math.floor(months / 12), m = months % 12;
    if (y && m) return y + '년 ' + m + '개월';
    if (y) return y + '년';
    return m + '개월';
  }

  /* ───────── 상단 시계 (백분의 일 초 포함) ───────── */

  const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
  const clockDateEl = document.getElementById('clock-date');
  const clockTimeEl = document.getElementById('clock-time');

  function tickClock() {
    const d = new Date();
    clockDateEl.textContent =
      d.getFullYear() + '년 ' + String(d.getMonth() + 1).padStart(2, '0') + '월 ' +
      String(d.getDate()).padStart(2, '0') + '일 (' + DAY_NAMES[d.getDay()] + ')';
    clockTimeEl.textContent =
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0') + '.' +
      String(Math.floor(d.getMilliseconds() / 10)).padStart(2, '0');
  }
  setInterval(tickClock, 10);
  tickClock();

  /* ───────── 테마 전환 ───────── */

  const themeBtn = document.getElementById('theme-toggle');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeBtn.textContent = theme === 'light' ? '🌙 어둡게' : '☀️ 밝게';
    localStorage.setItem(THEME_KEY, theme);
  }

  themeBtn.addEventListener('click', function () {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'light' ? 'dark' : 'light');
    renderCharts(); // 차트 색상 변수 갱신
  });

  applyTheme(localStorage.getItem(THEME_KEY) || 'light');

  /* ───────── 비밀번호 모달 ───────── */

  const pwModal = document.getElementById('pw-modal');
  const pwTitle = document.getElementById('pw-title');
  const pwDesc = document.getElementById('pw-desc');
  const pwInput = document.getElementById('pw-input');
  const pwError = document.getElementById('pw-error');
  let pwCallback = null;

  function openPwModal(title, desc, callback) {
    pwTitle.textContent = title;
    pwDesc.textContent = desc;
    pwInput.value = '';
    pwError.classList.add('hidden');
    pwCallback = callback;
    pwModal.classList.remove('hidden');
    pwInput.focus();
  }

  function closePwModal() {
    pwModal.classList.add('hidden');
    pwCallback = null;
  }

  function submitPw() {
    const pin = pwInput.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      pwError.textContent = '숫자 4자리를 입력하세요.';
      pwError.classList.remove('hidden');
      return;
    }
    const cb = pwCallback;
    if (cb) cb(pin);
  }

  document.getElementById('pw-confirm').addEventListener('click', submitPw);
  document.getElementById('pw-cancel').addEventListener('click', closePwModal);
  pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitPw(); });
  pwInput.addEventListener('input', function () {
    pwInput.value = pwInput.value.replace(/\D/g, '').slice(0, 4);
  });

  /* ───────── 항목 입력 모달 ───────── */

  const itemModal = document.getElementById('item-modal');
  const itemModalTitle = document.getElementById('item-modal-title');
  const itemForm = document.getElementById('item-form');
  let editingCat = null;   // 카테고리 key
  let editingIndex = -1;   // -1 = 신규

  function moneyField(id, label, value) {
    return '<div class="form-field"><label for="' + id + '">' + label + '</label>' +
      '<input type="text" id="' + id + '" inputmode="numeric" placeholder="0" value="' +
      (value ? comma(value) : '') + '"></div>';
  }

  function textField(id, label, value, placeholder) {
    return '<div class="form-field"><label for="' + id + '">' + label + '</label>' +
      '<input type="text" id="' + id + '" placeholder="' + esc(placeholder || '') + '" value="' + esc(value || '') + '"></div>';
  }

  function selectField(id, label, options, value) {
    return '<div class="form-field"><label for="' + id + '">' + label + '</label>' +
      '<select id="' + id + '">' +
      options.map(function (o) {
        return '<option value="' + o + '"' + (o === value ? ' selected' : '') + '>' + o + '</option>';
      }).join('') + '</select></div>';
  }

  function bindMoneyInputs() {
    itemForm.querySelectorAll('input[inputmode="numeric"]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        const digits = inp.value.replace(/\D/g, '');
        inp.value = digits ? comma(Number(digits)) : '';
      });
    });
  }

  function readMoney(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    return Number(el.value.replace(/\D/g, '')) || 0;
  }

  function readText(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function renderItemForm(catKey, item) {
    item = item || {};
    let html = '';

    if (catKey === 'realestate') {
      const dt = item.dealType || '매매';
      html += textField('f-name', '부동산 이름', item.name, '예: OO아파트 101동');
      html += selectField('f-dealtype', '구분 (매매/전세/월세)', ['매매', '전세', '월세'], dt);
      html += '<div id="f-dynamic"></div>';
      itemForm.innerHTML = html;

      const dynamic = document.getElementById('f-dynamic');
      function renderDynamic(type) {
        if (type === '매매') {
          dynamic.innerHTML = moneyField('f-price', '매매금액 (원)', item.price);
        } else if (type === '전세') {
          dynamic.innerHTML = moneyField('f-deposit', '보증금 (원)', item.deposit);
        } else {
          dynamic.innerHTML =
            moneyField('f-deposit', '보증금 (원)', item.deposit) +
            moneyField('f-rent', '월세 (원)', item.monthlyRent);
        }
        bindMoneyInputs();
      }
      renderDynamic(dt);
      document.getElementById('f-dealtype').addEventListener('change', function (e) {
        renderDynamic(e.target.value);
      });

    } else if (catKey === 'stock' || catKey === 'crypto') {
      html += textField('f-name', '종목명', item.name, catKey === 'stock' ? '예: 삼성전자' : '예: 비트코인');
      html += moneyField('f-amount', '매입금액 (원)', item.amount);
      html += moneyField('f-current', '현재 평가금액 (원, 선택)', item.currentValue);
      html += '<span class="form-hint">평가금액을 입력하면 수익률이 표시되고 자산 가치에 반영됩니다.</span>';
      itemForm.innerHTML = html;
      bindMoneyInputs();

    } else if (catKey === 'deposit') {
      const dt = item.depositType || '정기예금';
      html += textField('f-name', '상품명/은행명', item.name, '예: OO은행 정기예금');
      html += selectField('f-deptype', '예금 종류', ['정기예금', '적금', '주택청약저축'], dt);
      html += '<div id="f-dynamic"></div>';
      itemForm.innerHTML = html;

      const dynamic = document.getElementById('f-dynamic');
      function renderDynamic(type) {
        let inner = moneyField('f-amount', '현재 잔액 (원)', item.amount);
        if (type === '적금' || type === '주택청약저축') {
          inner += moneyField('f-monthly', '월 불입금액 (원)', item.monthlyPayment);
        }
        if (type === '주택청약저축') {
          inner += '<div class="form-field"><label for="f-joindate">최초 가입일</label>' +
            '<input type="date" id="f-joindate" value="' + esc(item.joinDate || '') + '"></div>' +
            '<span class="form-hint" id="f-period">' +
            (item.joinDate ? '가입기간: ' + subscriptionPeriod(item.joinDate) : '') + '</span>';
        }
        dynamic.innerHTML = inner;
        bindMoneyInputs();
        const jd = document.getElementById('f-joindate');
        if (jd) {
          jd.addEventListener('change', function () {
            document.getElementById('f-period').textContent =
              jd.value ? '가입기간: ' + subscriptionPeriod(jd.value) : '';
          });
        }
      }
      renderDynamic(dt);
      document.getElementById('f-deptype').addEventListener('change', function (e) {
        renderDynamic(e.target.value);
      });
    }
  }

  function openItemModal(catKey, index) {
    editingCat = catKey;
    editingIndex = (index == null ? -1 : index);
    const cat = CATEGORIES.find(function (c) { return c.key === catKey; });
    const item = editingIndex >= 0 ? getMonth(currentMonth)[catKey][editingIndex] : null;
    itemModalTitle.textContent = cat.label + ' 항목 ' + (item ? '수정' : '추가');
    renderItemForm(catKey, item);
    itemModal.classList.remove('hidden');
    const first = itemForm.querySelector('input, select');
    if (first) first.focus();
  }

  function closeItemModal() {
    itemModal.classList.add('hidden');
    editingCat = null;
    editingIndex = -1;
  }

  function saveItemFromForm() {
    const catKey = editingCat;
    const name = readText('f-name');
    if (!name) { alert('이름을 입력하세요.'); return; }

    const item = { name: name };

    if (catKey === 'realestate') {
      item.dealType = readText('f-dealtype');
      if (item.dealType === '매매') {
        item.price = readMoney('f-price');
        if (!item.price) { alert('매매금액을 입력하세요.'); return; }
      } else {
        item.deposit = readMoney('f-deposit');
        if (!item.deposit) { alert('보증금을 입력하세요.'); return; }
        if (item.dealType === '월세') item.monthlyRent = readMoney('f-rent');
      }
    } else if (catKey === 'stock' || catKey === 'crypto') {
      item.amount = readMoney('f-amount');
      if (!item.amount) { alert('매입금액을 입력하세요.'); return; }
      const cv = readMoney('f-current');
      if (cv) item.currentValue = cv;
    } else if (catKey === 'deposit') {
      item.depositType = readText('f-deptype');
      item.amount = readMoney('f-amount');
      if (!item.amount) { alert('현재 잔액을 입력하세요.'); return; }
      if (item.depositType === '적금' || item.depositType === '주택청약저축') {
        item.monthlyPayment = readMoney('f-monthly');
      }
      if (item.depositType === '주택청약저축') {
        const jd = readText('f-joindate');
        if (!jd) { alert('최초 가입일을 입력하세요.'); return; }
        item.joinDate = jd;
      }
    }

    const md = getMonth(currentMonth);
    if (editingIndex >= 0) md[catKey][editingIndex] = item;
    else md[catKey].push(item);
    persist();
    closeItemModal();
    render();
  }

  document.getElementById('item-save').addEventListener('click', saveItemFromForm);
  document.getElementById('item-cancel').addEventListener('click', closeItemModal);

  /* ───────── 좌측 패널 렌더링 ───────── */

  const monthInput = document.getElementById('month-input');
  const categoryList = document.getElementById('category-list');
  const totalAmountEl = document.getElementById('total-amount');
  const lockBadge = document.getElementById('lock-badge');
  const saveBtn = document.getElementById('save-btn');
  const editBtn = document.getElementById('edit-btn');
  const totalDeltaEl = document.getElementById('total-delta');
  const copyPrevBtn = document.getElementById('copy-prev-btn');

  monthInput.value = currentMonth;
  monthInput.addEventListener('change', function () {
    if (!monthInput.value) { monthInput.value = currentMonth; return; }
    currentMonth = monthInput.value;
    selectedCategory = null;
    render();
  });

  function itemSubText(catKey, item) {
    if (catKey === 'realestate') {
      if (item.dealType === '매매') return '매매';
      let t = item.dealType + ' · 보증금';
      if (item.dealType === '월세' && item.monthlyRent) t += ' · 월세 ' + formatKRW(item.monthlyRent);
      return t;
    }
    if (catKey === 'stock' || catKey === 'crypto') {
      if (item.currentValue && item.amount) {
        const pct = ((item.currentValue - item.amount) / item.amount) * 100;
        return '매입 ' + formatKRW(item.amount) + ' · 수익률 ' +
          (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
      }
      return '매입금액';
    }
    if (catKey === 'deposit') {
      let t = item.depositType;
      if (item.monthlyPayment) t += ' · 월 ' + formatKRW(item.monthlyPayment);
      if (item.depositType === '주택청약저축' && item.joinDate) {
        t += ' · 가입 ' + item.joinDate + ' (가입기간 ' + subscriptionPeriod(item.joinDate) + ')';
      }
      return t;
    }
    return '';
  }

  function renderLeftPanel() {
    const md = getMonth(currentMonth);
    const editable = isEditable(currentMonth);
    const total = monthTotal(md);

    totalAmountEl.textContent = formatKRW(total);
    lockBadge.classList.toggle('hidden', !(md.saved && !editable));
    saveBtn.classList.toggle('hidden', !editable);
    editBtn.classList.toggle('hidden', editable);

    // 전월 대비 증감
    const prevKey = prevMonthKey(currentMonth);
    if (prevKey && total > 0) {
      const prevTotal = monthTotal(data.months[prevKey]);
      const diff = total - prevTotal;
      const pct = prevTotal ? (diff / prevTotal) * 100 : 0;
      const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
      totalDeltaEl.textContent = '전월(' + prevKey.replace('-', '.') + ') 대비 ' + arrow + ' ' +
        formatKRW(Math.abs(diff)) + ' (' + (diff >= 0 ? '+' : '') + pct.toFixed(1) + '%)';
      totalDeltaEl.classList.remove('hidden');
    } else {
      totalDeltaEl.classList.add('hidden');
    }

    // 현재 월이 비어 있고 이전 월 데이터가 있으면 불러오기 버튼 표시
    const isEmpty = CATEGORIES.every(function (c) { return md[c.key].length === 0; });
    copyPrevBtn.classList.toggle('hidden', !(editable && isEmpty && prevKey));
    if (prevKey) copyPrevBtn.textContent = '📋 이전 월(' + prevKey.replace('-', '.') + ') 데이터 불러오기';

    categoryList.innerHTML = CATEGORIES.map(function (cat) {
      const items = md[cat.key];
      const total = catTotal(md, cat.key);
      const selected = selectedCategory === cat.key;
      const color = cssColor(cat.colorVar);

      const rows = items.length
        ? items.map(function (it, i) {
            return '<div class="item-row">' +
              '<div class="item-main">' +
                '<span class="item-name">' + esc(it.name) + '</span>' +
                '<span class="item-sub">' + esc(itemSubText(cat.key, it)) + '</span>' +
              '</div>' +
              '<span class="item-value">' + formatKRW(itemValue(cat.key, it)) + '</span>' +
              (editable
                ? '<button class="item-btn" data-act="edit" data-cat="' + cat.key + '" data-idx="' + i + '" title="수정">✏️</button>' +
                  '<button class="item-btn danger" data-act="del" data-cat="' + cat.key + '" data-idx="' + i + '" title="삭제">🗑️</button>'
                : '') +
              '</div>';
          }).join('')
        : '<div class="empty-note">등록된 항목이 없습니다.</div>';

      return '<div class="category-card' + (selected ? ' selected' : '') + '" data-cat="' + cat.key + '">' +
        '<div class="category-head" data-act="select" data-cat="' + cat.key + '">' +
          '<span class="cat-dot" style="background:' + color + '"></span>' +
          '<span class="cat-name">' + cat.icon + ' ' + cat.label + '</span>' +
          '<span class="cat-total">' + formatKRW(total) + '</span>' +
          '<button class="cat-add" data-act="add" data-cat="' + cat.key + '" title="항목 추가"' +
            (editable ? '' : ' disabled') + '>＋</button>' +
        '</div>' +
        '<div class="item-list">' + rows + '</div>' +
        '</div>';
    }).join('');
  }

  categoryList.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const cat = btn.getAttribute('data-cat');

    if (act === 'add') {
      e.stopPropagation();
      if (!isEditable(currentMonth)) return;
      openItemModal(cat, null);
    } else if (act === 'edit') {
      openItemModal(cat, Number(btn.getAttribute('data-idx')));
    } else if (act === 'del') {
      if (confirm('이 항목을 삭제하시겠습니까?')) {
        getMonth(currentMonth)[cat].splice(Number(btn.getAttribute('data-idx')), 1);
        persist();
        render();
      }
    } else if (act === 'select') {
      selectedCategory = (selectedCategory === cat) ? null : cat;
      render();
    }
  });

  /* ───────── 저장 / 수정(비밀번호) ───────── */

  saveBtn.addEventListener('click', function () {
    const md = getMonth(currentMonth);
    if (monthTotal(md) === 0 &&
        !CATEGORIES.some(function (c) { return md[c.key].length > 0; })) {
      alert('저장할 자산 항목을 먼저 입력하세요.');
      return;
    }

    function doSave() {
      md.saved = true;
      md.savedAt = new Date().toISOString();
      unlockedMonths.delete(currentMonth);
      persist();
      render();
      alert(currentMonth.replace('-', '년 ') + '월 자산이 저장되었습니다.\n수정하려면 비밀번호 4자리가 필요합니다.');
    }

    if (!data.passwordHash) {
      openPwModal('비밀번호 설정', '처음 저장합니다. 수정 시 사용할 숫자 4자리 비밀번호를 설정하세요.', function (pin) {
        data.passwordHash = hashPin(pin);
        closePwModal();
        doSave();
      });
    } else {
      doSave();
    }
  });

  editBtn.addEventListener('click', function () {
    openPwModal('비밀번호 입력', '저장된 데이터를 수정하려면 비밀번호 4자리를 입력하세요.', function (pin) {
      if (hashPin(pin) === data.passwordHash) {
        unlockedMonths.add(currentMonth);
        closePwModal();
        render();
      } else {
        pwError.textContent = '비밀번호가 올바르지 않습니다.';
        pwError.classList.remove('hidden');
        pwInput.value = '';
        pwInput.focus();
      }
    });
  });

  /* ───────── 이전 월 데이터 불러오기 ───────── */

  copyPrevBtn.addEventListener('click', function () {
    const prevKey = prevMonthKey(currentMonth);
    if (!prevKey) return;
    if (!confirm(prevKey.replace('-', '.') + ' 데이터를 ' + currentMonth.replace('-', '.') +
        ' 입력값으로 복사하시겠습니까?\n복사 후 자유롭게 수정한 뒤 저장하면 됩니다.')) return;
    const clone = JSON.parse(JSON.stringify(data.months[prevKey]));
    clone.saved = false;
    delete clone.savedAt;
    data.months[currentMonth] = clone;
    persist();
    render();
  });

  /* ───────── 데이터 내보내기 / 가져오기 ───────── */

  const importFileInput = document.getElementById('import-file');

  document.getElementById('export-btn').addEventListener('click', function () {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'asset-data-' + d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('import-btn').addEventListener('click', function () {
    // 저장된 데이터를 덮어쓰므로, 비밀번호가 설정돼 있으면 확인 후 진행
    if (data.passwordHash) {
      openPwModal('비밀번호 입력', '데이터를 가져오면 기존 데이터를 덮어씁니다. 비밀번호 4자리를 입력하세요.', function (pin) {
        if (hashPin(pin) === data.passwordHash) {
          closePwModal();
          importFileInput.click();
        } else {
          pwError.textContent = '비밀번호가 올바르지 않습니다.';
          pwError.classList.remove('hidden');
          pwInput.value = '';
          pwInput.focus();
        }
      });
    } else {
      importFileInput.click();
    }
  });

  importFileInput.addEventListener('change', function () {
    const file = importFileInput.files[0];
    importFileInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.months !== 'object' || parsed.months === null) {
          throw new Error('형식 오류');
        }
        if (!confirm('가져온 데이터로 현재 데이터를 완전히 교체합니다. 계속하시겠습니까?')) return;
        data = { passwordHash: parsed.passwordHash || null, months: parsed.months };
        Object.keys(data.months).forEach(function (m) {
          const md = data.months[m];
          CATEGORIES.forEach(function (c) { if (!Array.isArray(md[c.key])) md[c.key] = []; });
        });
        unlockedMonths.clear();
        persist();
        selectedCategory = null;
        render();
        alert('데이터를 가져왔습니다.');
      } catch (e) {
        alert('올바른 자산 데이터 파일이 아닙니다.');
      }
    };
    reader.readAsText(file);
  });

  /* ───────── 비밀번호 변경 ───────── */

  document.getElementById('pw-change-btn').addEventListener('click', function () {
    function setNewPin() {
      openPwModal('새 비밀번호 설정', '새로 사용할 숫자 4자리 비밀번호를 입력하세요.', function (pin) {
        data.passwordHash = hashPin(pin);
        persist();
        closePwModal();
        alert('비밀번호가 변경되었습니다.');
      });
    }
    if (data.passwordHash) {
      openPwModal('현재 비밀번호 입력', '비밀번호를 변경하려면 현재 비밀번호 4자리를 입력하세요.', function (pin) {
        if (hashPin(pin) === data.passwordHash) {
          setNewPin();
        } else {
          pwError.textContent = '비밀번호가 올바르지 않습니다.';
          pwError.classList.remove('hidden');
          pwInput.value = '';
          pwInput.focus();
        }
      });
    } else {
      setNewPin();
    }
  });

  /* ───────── 중앙 패널: 도넛 차트 ───────── */

  const donutTitle = document.getElementById('donut-title');
  const donutArea = document.getElementById('donut-area');
  const donutLegend = document.getElementById('donut-legend');

  function polar(cx, cy, r, angle) {
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function arcPath(cx, cy, rOut, rIn, a0, a1) {
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const [x0, y0] = polar(cx, cy, rOut, a0);
    const [x1, y1] = polar(cx, cy, rOut, a1);
    const [x2, y2] = polar(cx, cy, rIn, a1);
    const [x3, y3] = polar(cx, cy, rIn, a0);
    return 'M' + x0 + ' ' + y0 +
      ' A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
      ' L' + x2 + ' ' + y2 +
      ' A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + ' Z';
  }

  function renderDonut() {
    const md = getMonth(currentMonth);
    let slices; // [{label, value, color}]
    let centerLabel;

    if (selectedCategory) {
      const cat = CATEGORIES.find(function (c) { return c.key === selectedCategory; });
      donutTitle.textContent = cat.label + ' 상세 구성 — ' + currentMonth.replace('-', '.');
      centerLabel = cat.label;
      slices = md[cat.key].map(function (it, i) {
        return {
          label: it.name + (cat.key === 'realestate' ? ' (' + it.dealType + ')' :
                 cat.key === 'deposit' ? ' (' + it.depositType + ')' : ''),
          value: itemValue(cat.key, it),
          color: ITEM_PALETTE[i % ITEM_PALETTE.length],
        };
      });
    } else {
      donutTitle.textContent = '전체 자산 구성 — ' + currentMonth.replace('-', '.');
      centerLabel = '총 자산';
      slices = CATEGORIES.map(function (c) {
        return { label: c.icon + ' ' + c.label, value: catTotal(md, c.key), color: cssColor(c.colorVar) };
      });
    }

    slices = slices.filter(function (s) { return s.value > 0; });
    const total = slices.reduce(function (s, x) { return s + x.value; }, 0);

    if (!total) {
      donutArea.innerHTML = '<div class="chart-empty">표시할 자산이 없습니다.<br>좌측 패널에서 항목을 추가하세요.<br><br>💡 좌측 자산 항목을 클릭하면 해당 자산의<br>구체적인 구성을 볼 수 있습니다.</div>';
      donutLegend.innerHTML = '';
      return;
    }

    const size = 280, cx = size / 2, cy = size / 2, rOut = 110, rIn = 72;
    let svg = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="280" height="280" role="img" aria-label="자산 구성 도넛 차트">';

    if (slices.length === 1) {
      svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((rOut + rIn) / 2) + '" fill="none"' +
        ' stroke="' + slices[0].color + '" stroke-width="' + (rOut - rIn) + '"></circle>';
    } else {
      let angle = -Math.PI / 2;
      const gap = 0.02; // 조각 사이 간격(라디안)
      slices.forEach(function (s) {
        const sweep = (s.value / total) * Math.PI * 2;
        const a0 = angle + gap / 2;
        const a1 = angle + sweep - gap / 2;
        if (a1 > a0) {
          svg += '<path d="' + arcPath(cx, cy, rOut, rIn, a0, a1) + '" fill="' + s.color + '">' +
            '<title>' + esc(s.label) + ': ' + formatKRW(s.value) +
            ' (' + Math.round((s.value / total) * 100) + '%)</title></path>';
        }
        angle += sweep;
      });
    }

    svg += '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" class="donut-center-label">' + esc(centerLabel) + '</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" class="donut-center-value">' + esc(shortKRW(total)) + '</text>';
    svg += '</svg>';
    donutArea.innerHTML = svg;

    donutLegend.innerHTML = slices.map(function (s) {
      return '<div class="legend-item">' +
        '<span class="legend-swatch" style="background:' + s.color + '"></span>' +
        '<span class="legend-name">' + esc(s.label) + '</span>' +
        '<span class="legend-value">' + formatKRW(s.value) + '</span>' +
        '<span class="legend-pct">' + ((s.value / total) * 100).toFixed(1) + '%</span>' +
        '</div>';
    }).join('');
  }

  /* ───────── 우측 패널: 추이 막대 차트 ───────── */

  const barTitle = document.getElementById('bar-title');
  const barArea = document.getElementById('bar-area');
  const barLegend = document.getElementById('bar-legend');

  function renderBars() {
    const months = Object.keys(data.months)
      .filter(function (m) { return monthTotal(data.months[m]) > 0; })
      .sort();

    const cat = selectedCategory
      ? CATEGORIES.find(function (c) { return c.key === selectedCategory; })
      : null;
    barTitle.textContent = (cat ? cat.label : '총 자산') + ' 추이';

    if (!months.length) {
      barArea.innerHTML = '<div class="chart-empty">추이 데이터가 없습니다.<br>월별 자산을 입력·저장하면 막대차트로 표시됩니다.</div>';
      barLegend.innerHTML = '';
      return;
    }

    const values = months.map(function (m) {
      return cat ? catTotal(data.months[m], cat.key) : monthTotal(data.months[m]);
    });
    const maxVal = Math.max.apply(null, values.concat([1]));

    const barW = 44, gapW = 26, padL = 56, padR = 16, padT = 30, padB = 34;
    const chartH = 230;
    const width = padL + months.length * (barW + gapW) + padR;
    const height = padT + chartH + padB;

    let svg = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" role="img" aria-label="자산 추이 막대 차트">';

    // 눈금선 4개
    for (let g = 0; g <= 4; g++) {
      const gv = maxVal * g / 4;
      const gy = padT + chartH - (chartH * g / 4);
      svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (width - padR) + '" y2="' + gy + '" class="bar-grid-line"></line>';
      svg += '<text x="' + (padL - 6) + '" y="' + (gy + 4) + '" text-anchor="end" class="bar-axis-text">' + shortKRW(gv) + '</text>';
    }

    months.forEach(function (m, i) {
      const x = padL + gapW / 2 + i * (barW + gapW);
      const md = data.months[m];
      const total = values[i];
      const fullH = maxVal ? (total / maxVal) * chartH : 0;
      let yCursor = padT + chartH;

      if (cat) {
        const h = fullH;
        svg += '<rect class="bar-rect" data-month="' + m + '" x="' + x + '" y="' + (yCursor - h) +
          '" width="' + barW + '" height="' + h + '" rx="4" fill="' + cssColor(cat.colorVar) + '">' +
          '<title>' + m + ' ' + cat.label + ': ' + formatKRW(total) + '</title></rect>';
      } else {
        // 전체: 카테고리별 누적 막대
        CATEGORIES.forEach(function (c) {
          const v = catTotal(md, c.key);
          if (v <= 0) return;
          const h = (v / maxVal) * chartH;
          yCursor -= h;
          svg += '<rect class="bar-rect" data-month="' + m + '" x="' + x + '" y="' + yCursor +
            '" width="' + barW + '" height="' + h + '" fill="' + cssColor(c.colorVar) + '">' +
            '<title>' + m + ' ' + c.label + ': ' + formatKRW(v) + '</title></rect>';
        });
      }

      if (total > 0) {
        svg += '<text x="' + (x + barW / 2) + '" y="' + (padT + chartH - fullH - 6) +
          '" text-anchor="middle" class="bar-value-text">' + shortKRW(total) + '</text>';
      }
      const isCur = m === currentMonth;
      svg += '<text x="' + (x + barW / 2) + '" y="' + (padT + chartH + 18) +
        '" text-anchor="middle" class="bar-axis-text"' +
        (isCur ? ' style="font-weight:700;fill:var(--accent)"' : '') + '>' +
        m.slice(2).replace('-', '.') + '</text>';
    });

    svg += '</svg>';
    barArea.innerHTML = svg;

    barLegend.innerHTML = cat
      ? ''
      : CATEGORIES.map(function (c) {
          return '<div class="legend-item">' +
            '<span class="legend-swatch" style="background:' + cssColor(c.colorVar) + '"></span>' +
            '<span class="legend-name">' + c.icon + ' ' + c.label + '</span>' +
            '</div>';
        }).join('');
  }

  // 막대 클릭 → 해당 월로 이동
  barArea.addEventListener('click', function (e) {
    const rect = e.target.closest('.bar-rect');
    if (!rect) return;
    currentMonth = rect.getAttribute('data-month');
    monthInput.value = currentMonth;
    render();
  });

  /* ───────── 전체 렌더링 ───────── */

  function renderCharts() {
    renderDonut();
    renderBars();
  }

  function render() {
    renderLeftPanel();
    renderCharts();
  }

  render();
})();
