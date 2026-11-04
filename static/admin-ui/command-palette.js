/*
 * command-palette.js — 글로벌 커맨드 팔레트(헤더 검색 단추 · 「/」 키) + 헤더 시스템 헬스 닷(lazy hydrate).
 *  - 팔레트 항목은 header.html 에서 navGroups 로 서버 렌더 → JS 는 열기/필터/키보드/포커스 복원만.
 *  - 헬스 닷은 data-health-endpoint 를 fetch 해 {up,total,down} 으로 색·라벨 갱신(렌더 비차단).
 *  content-media-picker.js / popup-image-picker.js 와 같은 독립 IIFE.
 */
(function () {
  'use strict';

  // ---- 커맨드 팔레트 ----
  var modal, input, results, emptyMsg, lastTrigger, items;

  function visibleItems() {
    return items.filter(function (el) { return !el.hidden; });
  }

  function clearSelection() {
    items.forEach(function (el) { el.removeAttribute('aria-selected'); });
  }

  function select(el) {
    clearSelection();
    if (el) { el.setAttribute('aria-selected', 'true'); el.scrollIntoView({ block: 'nearest' }); }
  }

  function filter() {
    var raw = (input.value || '').trim();
    var q = raw.toLowerCase();
    items.forEach(function (el) {
      var text = (el.textContent || '').toLowerCase();
      el.hidden = q.length > 0 && text.indexOf(q) < 0;
    });
    // 그룹 라벨: 뒤따르는 항목이 모두 숨겨졌으면 라벨도 숨김
    modal.querySelectorAll('[data-cmdk-grouplabel]').forEach(function (label) {
      var anyVisible = false, n = label.nextElementSibling;
      while (n && !n.hasAttribute('data-cmdk-grouplabel') && !n.classList.contains('cms-admin-cmdk__empty')) {
        if (n.classList.contains('cms-admin-cmdk__item') && !n.hidden) { anyVisible = true; break; }
        n = n.nextElementSibling;
      }
      label.hidden = !anyVisible;
    });
    var vis = visibleItems();
    if (emptyMsg) { emptyMsg.hidden = vis.length > 0; }
    select(vis[0]);
  }

  function open(trigger) {
    lastTrigger = trigger || document.activeElement;
    modal.removeAttribute('hidden');
    input.value = '';
    filter();
    setTimeout(function () { input.focus(); }, 20);
  }

  function close() {
    if (modal.hasAttribute('hidden')) { return; }
    modal.setAttribute('hidden', '');
    if (lastTrigger && lastTrigger.focus) { lastTrigger.focus(); }
    lastTrigger = null;
  }

  function move(delta) {
    var vis = visibleItems();
    if (!vis.length) { return; }
    var cur = vis.indexOf(modal.querySelector('.cms-admin-cmdk__item[aria-selected="true"]'));
    var next = (cur < 0 ? 0 : cur + delta + vis.length) % vis.length;
    select(vis[next]);
  }

  function initPalette() {
    modal = document.getElementById('cms-cmdk');
    if (!modal) { return; }
    input = document.getElementById('cms-cmdk-input');
    results = document.getElementById('cms-cmdk-results');
    emptyMsg = document.getElementById('cms-cmdk-empty');
    items = Array.prototype.slice.call(modal.querySelectorAll('.cms-admin-cmdk__item'));

    document.querySelectorAll('[data-cmdk-open]').forEach(function (b) {
      b.addEventListener('click', function () { open(b); });
    });
    modal.querySelectorAll('[data-cmdk-close]').forEach(function (b) {
      b.addEventListener('click', close);
    });
    input.addEventListener('input', filter);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        var sel = modal.querySelector('.cms-admin-cmdk__item[aria-selected="true"]') || visibleItems()[0];
        if (!sel) { return; }
        e.preventDefault();
        window.location.href = sel.getAttribute('href');
      } else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    items.forEach(function (el) {
      el.addEventListener('mousemove', function () { select(el); });
    });

    // 전역 단축키: "/" — 입력 중이 아닐 때만(⌘K · Ctrl+K 는 뺐다 — 브라우저 단축키와 겹친다)
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && modal.hasAttribute('hidden')) {
        var t = e.target, tag = t && t.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT' && !(t && t.isContentEditable)) {
          e.preventDefault(); open(null);
        }
      }
    });
  }

  // ---- 시스템 헬스 닷 (lazy) ----
  function initHealthDot() {
    var el = document.querySelector('.cms-admin-health[data-health-endpoint]');
    if (!el) { return; }
    var url = el.getAttribute('data-health-endpoint');
    var dot = el.querySelector('.cms-admin-health-dot');
    var label = el.querySelector('.cms-admin-health__label');
    fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) { return; }
        el.classList.remove('cms-admin-health--degraded', 'cms-admin-health--down');
        if (s.down >= s.total) { el.classList.add('cms-admin-health--down'); }
        else if (s.down > 0) { el.classList.add('cms-admin-health--degraded'); }
        if (label) {
          label.textContent = (s.down === 0 ? '정상 ' : '주의 ') + s.up + '/' + s.total;
        }
        el.setAttribute('title', '업스트림 서비스 ' + s.up + '/' + s.total + ' 정상');
      })
      .catch(function () { if (label) { label.textContent = '상태 미상'; } });
  }

  function init() { initPalette(); initHealthDot(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
}());
