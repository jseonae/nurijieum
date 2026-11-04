/*
 * admin-inline-detail.js — 진보적 향상(Progressive Enhancement) 인라인 상세 로더.
 *
 * 목록 행 트리거(<a>/<button>)에 다음을 두면 동작한다:
 *   data-detail-url="..."        상세 fragment(text/html)를 반환하는 URL
 *   aria-controls="패널id"        행 아래에 둘 빈 패널 컨테이너의 id
 *   data-detail-group="그룹키"    (선택) 같은 그룹은 한 번에 하나만 펼침
 *
 * 클릭 시 풀 네비게이션 대신 fragment 를 fetch 해 패널에 주입한다(리로드 없음 →
 * 스크롤 위치 보존). aria-expanded 토글 · 패널 포커스 이동 · aria-live 알림으로
 * KRDS/WAI-ARIA 디스클로저 규약과 웹접근성을 만족한다.
 *
 * JS 가 없거나 패널이 없으면 트리거의 href 로 정상 풀 네비게이션(접근성 폴백).
 * 모든 치수는 CSS(rem)에 위임하므로 글자크기 토글이 그대로 반영된다.
 */
(function () {
  'use strict';

  var LIVE_ID = 'cms-inline-detail-live';

  function liveRegion() {
    var el = document.getElementById(LIVE_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = LIVE_ID;
      el.className = 'cms-admin-sr-only';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    return el;
  }

  function announce(msg) {
    var el = liveRegion();
    el.textContent = '';
    window.setTimeout(function () { el.textContent = msg; }, 30);
  }

  function panelFor(trigger) {
    var id = trigger.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  function closePanel(trigger, panel) {
    panel.hidden = true;
    panel.innerHTML = '';
    trigger.setAttribute('aria-expanded', 'false');
  }

  function focusInto(panel) {
    var target = panel.querySelector(
      '[autofocus], h1, h2, h3, [tabindex], input:not([type=hidden]), select, textarea, button, a[href]');
    if (target) {
      if (!target.hasAttribute('tabindex') && /^H[1-6]$/.test(target.tagName)) {
        target.setAttribute('tabindex', '-1');
      }
    } else {
      panel.setAttribute('tabindex', '-1');
      target = panel;
    }
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  }

  function openPanel(trigger, panel) {
    var url = trigger.getAttribute('data-detail-url');
    if (!url) { return; }
    panel.hidden = false;
    panel.setAttribute('aria-busy', 'true');
    panel.innerHTML = '<p class="cms-admin-inline-detail__loading">상세를 불러오는 중…</p>';
    trigger.setAttribute('aria-expanded', 'true');
    fetch(url, {
      headers: { 'X-Requested-With': 'fetch', 'Accept': 'text/html' },
      credentials: 'same-origin'
    })
      .then(function (r) {
        if (!r.ok) { throw new Error('HTTP ' + r.status); }
        return r.text();
      })
      .then(function (html) {
        panel.innerHTML = html;
        panel.removeAttribute('aria-busy');
        // 주입된 내용의 선언적 상호작용 재초기화(reveal/tabs/autosubmit/navgroups).
        if (window.cmsAdminInteractions && window.cmsAdminInteractions.init) {
          window.cmsAdminInteractions.init(panel);
        }
        // UI v2(admin-v2.js 패널/드롭메뉴/태그)·라이브 에디터도 주입 영역에 재초기화(없으면 무시 → legacy 무영향)
        if (window.nvAdmin && window.nvAdmin.init) { window.nvAdmin.init(panel); }
        if (window.cmsContentEditor && window.cmsContentEditor.init) { window.cmsContentEditor.init(panel); }
        focusInto(panel);
        announce('상세 영역이 열렸습니다.');
      })
      .catch(function (err) {
        panel.removeAttribute('aria-busy');
        panel.innerHTML = '<p class="cms-admin-inline-detail__error" role="alert">'
          + '상세를 불러오지 못했습니다. (' + String((err && err.message) || err) + ')</p>';
      });
  }

  function onTriggerClick(e) {
    var trigger = e.currentTarget;
    var panel = panelFor(trigger);
    if (!panel) { return; }            // 패널 없으면 기본 네비게이션 허용(폴백)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }  // 새 탭 등은 그대로
    e.preventDefault();
    var open = trigger.getAttribute('aria-expanded') === 'true';
    var group = trigger.getAttribute('data-detail-group');
    if (group && !open) {
      document.querySelectorAll(
        '[data-detail-url][data-detail-group="' + group + '"][aria-expanded="true"]'
      ).forEach(function (other) {
        if (other !== trigger) {
          var op = panelFor(other);
          if (op) { closePanel(other, op); }
        }
      });
    }
    if (open) { closePanel(trigger, panel); }
    else { openPanel(trigger, panel); }
  }

  function init(root) {
    (root || document).querySelectorAll('[data-detail-url]').forEach(function (trigger) {
      if (trigger.__inlineDetailBound) { return; }
      trigger.__inlineDetailBound = true;
      if (!trigger.hasAttribute('aria-expanded')) {
        trigger.setAttribute('aria-expanded', 'false');
      }
      trigger.addEventListener('click', onTriggerClick);
    });
  }

  if (document.readyState !== 'loading') { init(document); }
  else { document.addEventListener('DOMContentLoaded', function () { init(document); }); }

  window.cmsAdminInlineDetail = { init: init };
})();
