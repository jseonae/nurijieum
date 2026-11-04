// CSRF: <meta name="_csrf"> 의 토큰을 fetch 헤더(X-CSRF-Token)로 보낸다. 서버 CsrfInterceptor 가 변경 요청마다 검사한다.
window.cmsCsrf = (function () {
  function token() {
    var m = document.querySelector('meta[name="_csrf"]');
    return m ? (m.getAttribute('content') || '') : '';
  }
  function headerName() {
    var m = document.querySelector('meta[name="_csrf_header"]');
    return m ? (m.getAttribute('content') || 'X-CSRF-Token') : 'X-CSRF-Token';
  }
  return {
    token: token,
    headers: function (extra) {
      var h = extra ? Object.assign({}, extra) : {};
      var t = token();
      if (t) { h[headerName()] = t; }
      return h;
    }
  };
})();

/*
 * admin-shell.js — 관리자 콘솔 셸 동작 (TRACK 8 — 반응형 모바일 드로어 + 포커스 관리).
 *
 * 외부 라이브러리 없는 순수 바닐라 JS. IIFE 패턴.
 *
 *   1) 모바일 드로어 토글 (≤1024px, CSS 가 .cms-admin-shell--drawer-open 클래스로 시각 처리):
 *      - .cms-admin-drawer-toggle 버튼 감지; 없으면 아무것도 하지 않음.
 *      - .cms-admin-drawer-overlay 요소가 없으면 동적 생성하여 .cms-admin-shell 에 추가.
 *      - open()  : cms-admin-shell--drawer-open 추가, aria-expanded=true, 오버레이 표시,
 *                  #admin-sidenav 내 첫 포커스 가능 요소로 포커스 이동.
 *      - close() : 클래스 제거, aria-expanded=false, 오버레이 숨김, 토글 버튼으로 포커스 복원.
 *      - 토글 버튼 클릭 → open/close 전환.
 *      - 오버레이 클릭 → close.
 *      - Escape 키 (드로어 열려 있을 때) → close.
 *      - 드로어 안의 nav 링크 클릭 → close (모바일 UX).
 *      - Tab 키 포커스 트랩: #admin-sidenav + 토글 버튼 안에서 순환.
 *
 *   2) 스킵 링크 포커스:
 *      - .cms-admin-skip-link (href="#main-content") 클릭 시
 *        #main-content (tabindex=-1) 로 focus() 보장.
 *
 * window.cmsAdminShell = { init: init } 으로 외부 재사용 가능.
 */
(function () {
  'use strict';

  /* ── 유틸리티 ──────────────────────────────────────────────────── */

  /** 요소 내에서 포커스 가능한 첫 번째 요소를 반환한다. */
  function firstFocusable(container) {
    return container.querySelector(
      'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
  }

  /**
   * 요소 내의 모든 포커스 가능한 요소 목록을 반환한다.
   * tabindex="-1" 은 프로그래매틱 포커스용이므로 트랩 순환 대상에서 제외한다.
   */
  function focusableList(container) {
    return Array.prototype.slice.call(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  /* ── 1) 모바일 드로어 ─────────────────────────────────────────── */

  function initDrawer(root) {
    var shell    = root.querySelector('.cms-admin-shell');
    var toggle   = root.querySelector('.cms-admin-drawer-toggle');

    // 토글 버튼이 없으면 이 기능 전체 비활성화
    if (!shell || !toggle) { return; }

    var sidenav  = root.querySelector('#admin-sidenav');

    // 오버레이 요소 확보: 마크업에 없으면 생성
    var overlay  = shell.querySelector('.cms-admin-drawer-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'cms-admin-drawer-overlay';
      overlay.setAttribute('hidden', '');
      shell.appendChild(overlay);
    }

    var isOpen = false;

    /** 드로어를 연다. */
    function open() {
      if (isOpen) { return; }
      isOpen = true;
      shell.classList.add('cms-admin-shell--drawer-open');
      toggle.setAttribute('aria-expanded', 'true');
      overlay.removeAttribute('hidden');

      // #admin-sidenav 내 첫 포커스 가능 요소로 포커스 이동
      if (sidenav) {
        var first = firstFocusable(sidenav);
        if (first) { first.focus(); }
      }

      // 드로어가 열려 있는 동안 문서 수준 키다운 리스너 등록
      document.addEventListener('keydown', onKeyDown);
    }

    /** 드로어를 닫는다. */
    function close() {
      if (!isOpen) { return; }
      isOpen = false;
      shell.classList.remove('cms-admin-shell--drawer-open');
      toggle.setAttribute('aria-expanded', 'false');
      overlay.setAttribute('hidden', '');

      // 포커스를 토글 버튼으로 복원
      toggle.focus();

      document.removeEventListener('keydown', onKeyDown);
    }

    /** 드로어 열림 상태에서 전역 키보드 처리. */
    function onKeyDown(e) {
      if (!isOpen) { return; }

      // Escape → 닫기
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      // Tab → #admin-sidenav + 토글 버튼 안에서 포커스 트랩
      if (e.key === 'Tab' && sidenav) {
        var navItems  = focusableList(sidenav);
        // 토글 버튼을 트랩 범위에 포함시킴
        var trapItems = navItems.concat([toggle]);
        if (!trapItems.length) { return; }

        var first = trapItems[0];
        var last  = trapItems[trapItems.length - 1];
        var active = document.activeElement;

        if (e.shiftKey) {
          // Shift+Tab: 첫 요소에서 → 마지막 요소로 순환
          if (active === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          // Tab: 마지막 요소에서 → 첫 요소로 순환
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    /* 이벤트 바인딩 */

    // 토글 버튼 클릭
    toggle.addEventListener('click', function () {
      if (isOpen) { close(); } else { open(); }
    });

    // 오버레이 클릭 → 닫기
    overlay.addEventListener('click', function () {
      close();
    });

    // 드로어 내 nav 링크 클릭 → 닫기 (내비게이션 UX)
    if (sidenav) {
      sidenav.addEventListener('click', function (e) {
        var target = e.target;
        // 클릭된 요소 또는 그 조상 중 <a> 태그가 있으면 닫기
        while (target && target !== sidenav) {
          if (target.tagName === 'A') {
            close();
            return;
          }
          target = target.parentElement;
        }
      });
    }
  }

  /* ── 2) 스킵 링크 포커스 보장 ────────────────────────────────── */

  function initSkipLink(root) {
    // #main-content 가 tabindex 없으면 프로그래매틱 포커스용 -1 부여(페이지별 마크업 편집 회피).
    var main = (root.getElementById ? root.getElementById('main-content') : document.getElementById('main-content'))
            || document.getElementById('main-content');
    if (main && !main.hasAttribute('tabindex')) { main.setAttribute('tabindex', '-1'); }
    var links = root.querySelectorAll('.cms-admin-skip-link');
    links.forEach(function (link) {
      link.addEventListener('click', function (e) {
        var href   = link.getAttribute('href') || '';
        var target = href.startsWith('#') ? document.getElementById(href.slice(1)) : null;
        if (target) {
          e.preventDefault();
          target.focus();
        }
      });
    });
  }

  /* ── 진입점 ──────────────────────────────────────────────────── */

  function init(root) {
    root = root || document;
    initDrawer(root);
    initSkipLink(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  window.cmsAdminShell = { init: init };
})();
