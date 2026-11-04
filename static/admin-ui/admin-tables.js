/**
 * TRACK 6 — 데이터 테이블 고도화 (admin-tables.js)
 * (vanilla JS, 외부 라이브러리 없음)
 *
 * 기능:
 *  1) 행 클릭 내비게이션  — <tr data-row-href="URL"> 클릭 시 해당 URL로 이동
 *     · 인터랙티브 자식(a, button, input, select, textarea, form, label) 내부 클릭은 무시
 *     · tabIndex=0, role="link", aria-label(첫 번째 셀 텍스트) 자동 부여
 *     · Enter / Space 키로도 내비게이션
 *
 *  2) 밀도 토글 — [data-density-toggle] 버튼이 .cms-admin-table--compact 클래스를 토글
 *     · data-target 셀렉터로 대상 테이블 결정; 없으면 첫 번째 .cms-admin-table
 *     · localStorage 키 'cms-table-density' ('compact'|'normal') 로 상태 영속
 *     · 버튼 라벨: '밀도: 촘촘' / '밀도: 보통'
 *
 *  3) 뷰 토글(테이블↔그리드 등) — [data-view-toggle] 그룹 안의 [data-view-set="VALUE"] 버튼
 *     · 클릭 시 해당 버튼 aria-pressed=true, 형제 버튼 false
 *     · data-view-target 셀렉터가 가리키는 요소에 data-view="VALUE" 속성 설정
 *     · localStorage 키는 data-view-target 값을 사용해 그룹별로 독립 영속
 *
 *  4) 정렬 헤더 — <a class="cms-admin-th-sort"> 는 서버 사이드 GET 파라미터로 동작.
 *     aria-sort 는 서버에서 렌더링하므로 JS 개입 없음.
 *
 * 노출 API: window.cmsAdminTables = { init: init }
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────
   * 상수
   * ───────────────────────────────────────── */
  var LS_DENSITY_KEY = 'cms-table-density';

  // 클릭을 무시해야 하는 인터랙티브 요소 셀렉터
  var INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, form, label';

  /* ─────────────────────────────────────────
   * 초기화 — 이미 실행된 경우 중복 실행 방지
   * ───────────────────────────────────────── */
  var initialized = false;

  function init() {
    if (initialized) { return; }
    initialized = true;

    initRowNavigation();
    initDensityToggle();
    initViewToggle();

    /* 정렬 헤더(4번 기능):
     * .cms-admin-th-sort 앵커는 서버가 렌더링한 href(sort 파라미터 포함)를 그대로
     * 사용하는 일반 GET 링크이므로 JS 처리 불필요. aria-sort도 서버에서 주입됨. */
  }

  /* ═══════════════════════════════════════════
   * 1) 행 클릭 내비게이션
   * ═══════════════════════════════════════════ */
  function initRowNavigation() {
    // 현재 DOM에 있는 행 초기화
    applyRowNavigation(document);

    // 동적으로 추가되는 행도 처리하기 위해 이벤트 위임 사용
    document.addEventListener('click', onRowClick);
    document.addEventListener('keydown', onRowKeydown);
  }

  /**
   * 지정된 루트 아래의 [data-row-href] tr 에 접근성 속성을 부여한다.
   * @param {Document|Element} root
   */
  function applyRowNavigation(root) {
    var rows = root.querySelectorAll('tr[data-row-href]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-row-nav-init') === '1') { continue; }

      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'link');

      // aria-label: 첫 번째 셀의 텍스트 콘텐츠 사용 (없으면 생략)
      var firstCell = row.querySelector('td, th');
      if (firstCell) {
        var cellText = (firstCell.textContent || '').trim();
        if (cellText) {
          row.setAttribute('aria-label', cellText);
        }
      }

      row.setAttribute('data-row-nav-init', '1');
    }
  }

  /**
   * 클릭 이벤트 위임 핸들러 — 인터랙티브 자식 내부 클릭은 무시.
   * @param {MouseEvent} e
   */
  function onRowClick(e) {
    var row = e.target.closest('tr[data-row-href]');
    if (!row) { return; }

    // 인터랙티브 자식에서 발생한 클릭은 무시
    if (e.target.closest(INTERACTIVE_SELECTOR)) { return; }

    var href = row.getAttribute('data-row-href');
    if (href) {
      window.location.href = href;
    }
  }

  /**
   * 키보드 이벤트 위임 핸들러 — Enter / Space 로 내비게이션.
   * @param {KeyboardEvent} e
   */
  function onRowKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') { return; }

    var row = e.target.closest('tr[data-row-href]');
    if (!row) { return; }

    // Space 는 스크롤 기본 동작 방지
    if (e.key === ' ') { e.preventDefault(); }

    var href = row.getAttribute('data-row-href');
    if (href) {
      window.location.href = href;
    }
  }

  /* ═══════════════════════════════════════════
   * 2) 밀도 토글
   * ═══════════════════════════════════════════ */
  function initDensityToggle() {
    var buttons = document.querySelectorAll('[data-density-toggle]');
    if (!buttons.length) { return; }

    // localStorage 에서 저장된 밀도 복원
    var savedDensity = lsGet(LS_DENSITY_KEY); // 'compact' | 'normal' | null

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var table = getDensityTarget(btn);

      // 초기 상태 적용
      if (table) {
        if (savedDensity === 'compact') {
          table.classList.add('cms-admin-table--compact');
        } else if (savedDensity === 'normal') {
          table.classList.remove('cms-admin-table--compact');
        }
        // savedDensity가 null이면 현재 서버 렌더링 상태 유지
      }

      updateDensityLabel(btn, table);
      btn.addEventListener('click', makeDensityClickHandler(btn));
    }
  }

  /**
   * 밀도 토글 버튼의 대상 테이블을 결정한다.
   * @param {Element} btn
   * @returns {Element|null}
   */
  function getDensityTarget(btn) {
    var targetSel = btn.getAttribute('data-target');
    if (targetSel) {
      try {
        return document.querySelector(targetSel);
      } catch (e) {
        // 잘못된 셀렉터 — 폴백 사용
      }
    }
    return document.querySelector('.cms-admin-table');
  }

  /**
   * @param {Element} btn
   * @returns {Function}
   */
  function makeDensityClickHandler(btn) {
    return function () {
      var table = getDensityTarget(btn);
      if (!table) { return; }

      var isCompact = table.classList.toggle('cms-admin-table--compact');
      lsSet(LS_DENSITY_KEY, isCompact ? 'compact' : 'normal');
      updateDensityLabel(btn, table);
    };
  }

  /**
   * 버튼 텍스트를 현재 밀도 상태에 맞게 갱신한다.
   * @param {Element} btn
   * @param {Element|null} table
   */
  function updateDensityLabel(btn, table) {
    var isCompact = table ? table.classList.contains('cms-admin-table--compact') : false;
    btn.textContent = isCompact ? '밀도: 촘촘' : '밀도: 보통';
  }

  /* ═══════════════════════════════════════════
   * 3) 뷰 토글 (테이블↔그리드 등)
   * ═══════════════════════════════════════════ */
  function initViewToggle() {
    var groups = document.querySelectorAll('[data-view-toggle]');
    if (!groups.length) { return; }

    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      var targetSel = group.getAttribute('data-view-target');
      if (!targetSel) { continue; }

      var targetEl = null;
      try {
        targetEl = document.querySelector(targetSel);
      } catch (e) {
        // 잘못된 셀렉터
        continue;
      }
      if (!targetEl) { continue; }

      // localStorage 에서 저장된 뷰 복원
      var lsKey = 'cms-view-toggle:' + targetSel;
      var savedView = lsGet(lsKey);

      if (savedView) {
        applyView(group, targetEl, savedView);
      }

      // 클릭 이벤트 등록
      group.addEventListener('click', makeViewClickHandler(group, targetEl, lsKey));
    }
  }

  /**
   * @param {Element} group
   * @param {Element} targetEl
   * @param {string} lsKey
   * @returns {Function}
   */
  function makeViewClickHandler(group, targetEl, lsKey) {
    return function (e) {
      var btn = e.target.closest('[data-view-set]');
      if (!btn || !group.contains(btn)) { return; }

      var value = btn.getAttribute('data-view-set');
      applyView(group, targetEl, value);
      lsSet(lsKey, value);
    };
  }

  /**
   * 그룹의 버튼 aria-pressed 를 갱신하고 대상 요소에 data-view 를 설정한다.
   * @param {Element} group
   * @param {Element} targetEl
   * @param {string} value
   */
  function applyView(group, targetEl, value) {
    var buttons = group.querySelectorAll('[data-view-set]');
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      var match = b.getAttribute('data-view-set') === value;
      b.setAttribute('aria-pressed', match ? 'true' : 'false');
    }
    targetEl.setAttribute('data-view', value);
  }

  /* ═══════════════════════════════════════════
   * localStorage 헬퍼 — 예외 방어 처리
   * ═══════════════════════════════════════════ */

  /**
   * @param {string} key
   * @returns {string|null}
   */
  function lsGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  function lsSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // 스토리지 용량 초과 등 무시
    }
  }

  /* ═══════════════════════════════════════════
   * 전역 API 노출
   * ═══════════════════════════════════════════ */
  window.cmsAdminTables = { init: init };

  /* ─────────────────────────────────────────
   * 부트스트랩 — DOMContentLoaded 또는 즉시 실행
   * ───────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
