/**
 * TRACK 7 — 본문 에디터 라이브 미리보기 (vanilla, no framework)
 *
 * 요구사항:
 *  - 페이지 내 `.cms-admin-editor` 마다 독립 인스턴스 생성
 *  - 형식(HTML/MARKDOWN/TEXT)에 따라 샌드박스 iframe 미리보기
 *  - 디바운스 250ms + AbortController로 중복 fetch 취소
 *  - 뷰 토글(편집/분할/미리보기) — data-view 속성 + aria-pressed 관리
 *  - "이미지 삽입" 버튼 · 붙여넣기/끌어 놓기한 그림 파일은 content-image-picker.js 창에 위임,
 *    삽입 후 미리보기 갱신을 위해 textarea 'input' 이벤트 감지 +
 *    피커 버튼 클릭 시 단기 지연 후 추가 갱신 예약
 *  - .cms-admin-editor__live — aria-live 영역에 갱신 알림 후 1초 뒤 초기화
 *
 * 보안:
 *  - HTML/MARKDOWN/TEXT 모두 sandboxed iframe srcdoc 으로만 렌더
 *  - innerHTML 에 사용자 입력 직접 주입 금지
 */
(function () {
  'use strict';

  // ── 유틸: HTML 이스케이프 ─────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── 샌드박스 iframe srcdoc 빌더 ──────────────────────────────────────
  function buildSrcdoc(innerHtml) {
    return '<!doctype html><meta charset="utf-8">'
      + '<style>body{margin:8px;font-family:inherit;font-size:14px;line-height:1.6;color:#222}img{max-width:100%;height:auto}pre{white-space:pre-wrap;word-break:break-all}'
      + 'figure{margin:1em 0}figcaption{font-size:.9em;color:#555}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px}'
      + '.__se__float-left{float:left;margin:0 1em .5em 0}.__se__float-right{float:right;margin:0 0 .5em 1em}.__se__float-center{text-align:center}'
      + '.__se__float-center figure{display:inline-block}blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #ccc;color:#555}</style>'
      + innerHtml;
  }

  // ── 에디터 인스턴스 초기화 ───────────────────────────────────────────
  function initEditor(root) {
    // 이미 바인딩된 에디터는 건너뛴다(인라인 상세 주입·details 재오픈 시 중복 방지).
    if (root.__cmsEditorBound) return;
    root.__cmsEditorBound = true;
    var previewUrl   = root.getAttribute('data-preview-url') || '';
    var textarea     = root.querySelector('.cms-admin-editor__textarea');
    var formatSelect = root.querySelector('.cms-admin-editor__format');
    var liveRegion   = root.querySelector('.cms-admin-editor__live');
    var previewWrap  = root.querySelector('.cms-admin-editor__preview');
    var viewToggleBtns = root.querySelectorAll('[data-view-set]');
    var mediaPickerBtn = root.querySelector('[data-media-picker]');

    // 필수 요소 없으면 조용히 종료
    if (!textarea || !previewWrap) return;

    var iframe = null;          // 샌드박스 iframe (최초 렌더 시 생성)
    var debounceTimer = null;   // 디바운스 타이머 ID
    var abortCtrl = null;       // 진행 중인 fetch AbortController

    // ── iframe 확보 ───────────────────────────────────────────────────
    function ensureIframe() {
      if (iframe) return iframe;
      iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin');
      iframe.setAttribute('title', '본문 미리보기');
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
      previewWrap.appendChild(iframe);
      return iframe;
    }

    // ── iframe srcdoc 갱신 ────────────────────────────────────────────
    function setIframeSrcdoc(srcdoc) {
      var fr = ensureIframe();
      fr.srcdoc = srcdoc;
    }

    // ── aria-live 알림 ────────────────────────────────────────────────
    function notifyLive() {
      if (!liveRegion) return;
      liveRegion.textContent = '미리보기 갱신됨';
      setTimeout(function () {
        if (liveRegion) liveRegion.textContent = '';
      }, 1000);
    }

    // ── 미리보기 오류 메시지 표시 ─────────────────────────────────────
    function showPreviewError() {
      setIframeSrcdoc(buildSrcdoc('<p style="color:#c00;font-size:13px;">미리보기를 불러올 수 없습니다.</p>'));
    }

    // ── 실제 렌더 ─────────────────────────────────────────────────────
    function render() {
      var format = formatSelect ? formatSelect.value : 'HTML';
      var value  = textarea.value || '';

      if (format === 'HTML' || format === 'HTML_RAW') {
        // 사용자 HTML(또는 퍼블리싱 원문 HTML_RAW) → sandboxed iframe srcdoc
        setIframeSrcdoc(buildSrcdoc(value));
        notifyLive();

      } else if (format === 'TEXT') {
        // 일반 텍스트 → <pre> 안에 이스케이프 후 iframe
        setIframeSrcdoc(buildSrcdoc('<pre>' + escapeHtml(value) + '</pre>'));
        notifyLive();

      } else if (format === 'MARKDOWN') {
        // MARKDOWN → 서버 사이드 렌더 (POST → HTML 반환)
        if (!previewUrl) {
          showPreviewError();
          return;
        }

        // 진행 중인 fetch 취소
        if (abortCtrl) {
          try { abortCtrl.abort(); } catch (e) { /* noop */ }
        }

        // AbortController 지원 여부 확인
        if (typeof AbortController !== 'undefined') {
          abortCtrl = new AbortController();
        } else {
          abortCtrl = null;
        }

        var fetchOptions = {
          method: 'POST',
          credentials: 'same-origin',
          headers: (window.cmsCsrf ? window.cmsCsrf.headers : function (h) { return h; })({
            'Content-Type': 'application/json',
            'Accept': 'text/html, application/json'
          }),
          body: JSON.stringify({ bodyFormat: 'MARKDOWN', body: value })
        };
        if (abortCtrl) {
          fetchOptions.signal = abortCtrl.signal;
        }

        fetch(previewUrl, fetchOptions)
          .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var contentType = res.headers.get('Content-Type') || '';
            if (contentType.indexOf('application/json') !== -1) {
              return res.json().then(function (data) {
                return data.html || data.content || '';
              });
            }
            return res.text();
          })
          .then(function (html) {
            setIframeSrcdoc(buildSrcdoc(html));
            notifyLive();
          })
          .catch(function (err) {
            // AbortError 는 정상 취소 — 오류 표시 안 함
            if (err && err.name === 'AbortError') return;
            showPreviewError();
          });
      }
    }

    // ── 디바운스 래퍼 ─────────────────────────────────────────────────
    function scheduleRender() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(function () {
        debounceTimer = null;
        render();
      }, 250);
    }

    // ── textarea 입력 / 형식 변경 이벤트 ─────────────────────────────
    textarea.addEventListener('input', scheduleRender);
    if (formatSelect) {
      formatSelect.addEventListener('change', scheduleRender);
    }

    // ── 미디어 피커 버튼 클릭 후 단기 지연 갱신 ─────────────────────
    // content-media-picker.js 가 textarea 에 직접 값을 주입한 뒤
    // 'input' 이벤트를 dispatch 하지 않는 경우를 대비한 안전장치.
    // 피커 모달이 닫히고 textarea 로 포커스가 복원될 때도 갱신.
    if (mediaPickerBtn) {
      mediaPickerBtn.addEventListener('click', function () {
        // 피커 사용이 완료될 충분한 여유(약 800ms) 뒤 추가 갱신 예약
        setTimeout(function () {
          scheduleRender();
        }, 800);
      });
    }

    // textarea focus 시 값이 변경되었을 수 있으므로 갱신 예약
    // (피커가 닫히면 focus 가 textarea 로 돌아옴)
    textarea.addEventListener('focus', function () {
      scheduleRender();
    });

    // ── 글상자(HTML_RAW · MARKDOWN 등 위지윅이 아닌 형식)에 붙여넣기 · 끌어 놓기한 그림 파일 ──
    // 위지윅은 onImageUploadBefore 가 받는다. 글상자도 같은 「이미지 삽입」 창에 넘긴다 — 이 콘텐츠의 이미지 폴더로 올리고
    // 대체 텍스트를 받은 뒤 커서 자리에 <img src alt> / ![alt](url) 로 넣는다. 그림 파일이 아니면 브라우저 기본 동작 그대로.
    function imageFilesOf(transfer) {
      if (!transfer) return [];
      var files = Array.prototype.slice.call(transfer.files || []);
      if (!files.length && transfer.items) {
        files = Array.prototype.map.call(transfer.items, function (item) {
          return item.kind === 'file' ? item.getAsFile() : null;
        });
      }
      return files.filter(function (f) { return f && /^image\//.test(f.type); });
    }

    function handOverImages(e, transfer) {
      var files = imageFilesOf(transfer);
      if (!files.length) return;
      e.preventDefault();   // 끌어 놓은 그림을 브라우저가 열어 화면을 떠나지 않게
      if (textarea.readOnly || textarea.disabled) return;
      var handed = window.cmsImagePicker && window.cmsImagePicker.openWithFiles(textarea, files);
      if (!handed && liveRegion) {
        liveRegion.textContent = formatSelect && formatSelect.value === 'TEXT'
          ? 'TEXT 형식에는 그림을 넣을 수 없습니다.'
          : '그림 파일은 [이미지 삽입]으로 올려 주세요(images 폴더).';
      }
    }

    textarea.addEventListener('paste', function (e) { handOverImages(e, e.clipboardData); });
    textarea.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault();
    });
    textarea.addEventListener('drop', function (e) { handOverImages(e, e.dataTransfer); });

    // ── 뷰 토글 ───────────────────────────────────────────────────────
    function setView(viewName) {
      root.setAttribute('data-view', viewName);
      for (var i = 0; i < viewToggleBtns.length; i++) {
        var btn = viewToggleBtns[i];
        var pressed = btn.getAttribute('data-view-set') === viewName;
        btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      }
    }

    for (var i = 0; i < viewToggleBtns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var viewName = btn.getAttribute('data-view-set');
          if (viewName) setView(viewName);
        });
      }(viewToggleBtns[i]));
    }

    // ── 위지윅(SunEditor) — data-wysiwyg 편집기의 HTML 초안만 ────────
    if (root.hasAttribute('data-wysiwyg')) {
      bindWysiwyg(root, textarea, formatSelect, scheduleRender);
    }

    // ── 초기 미리보기 렌더 ────────────────────────────────────────────
    scheduleRender();
  }

  /*
   * 위지윅 편집(docs/images.md §편집기): 형식이 HTML 이고 textarea 가 편집 가능할 때만 SunEditor 를 띄운다.
   *  - HTML_RAW(퍼블리싱 원문)·MARKDOWN·TEXT 는 textarea 그대로(원문 스크립트가 관리자 화면에서 돌지 않게).
   *  - 원본은 언제나 textarea — 변경 · 코드 보기 전환 · 폼 제출 때 동기화하고 'input' 을 쏴 미리보기를 갱신한다.
   *    편집기는 불러온 HTML 을 제 모양으로 다듬으므로, 손대지 않았으면(처음 다듬은 모양 그대로) 원래 글을 돌려놓는다 —
   *    고친 것 없이 저장해도 본문이 바뀐 것으로 보이지 않게(새 초안이 생기지 않게).
   *  - 툴바는 구조 서식만(KRDS — 글꼴 · 크기 · 색은 테마가 정한다). 그림은 「이미지 삽입」 창(images 폴더)으로만 넣는다 —
   *    붙여넣기 · 끌어 놓기로 들어온 그림 파일도 base64 로 박지 않고 그 창에서 폴더로 올린 뒤 대체 텍스트를 받아 넣는다.
   *    image 플러그인은 넣은 그림의 크기 · 정렬 · 대체 텍스트 편집용.
   *  - textarea.__cmsWysiwyg = { insertHtml(html) } 를 두어 content-media-picker.js 가 커서 위치에 넣게 한다.
   */
  function bindWysiwyg(root, textarea, formatSelect, onSynced) {
    var editor = null;
    var holder = null;
    var original = null;
    var pristine = null;

    function wanted() {
      var format = formatSelect ? formatSelect.value : 'HTML';
      return format === 'HTML' && !textarea.readOnly && !textarea.disabled;
    }

    // SunEditor 가 덧붙이는 것은 본문에 남기지 않는다: 기본값(width/height="auto", 빈 style), 내부 표시(data-se-*),
    // 선택 상태 클래스(그림을 고른 채 저장하면 se-component-selected 등이 클래스로 굳는다 — 정화는 class 를 남긴다).
    function cleanHtml(html) {
      return String(html || '')
        .replace(/\s(width|height)="auto"/g, '')
        .replace(/\sdata-se-[a-z-]+="[^"]*"/g, '')
        .replace(/\s?\b(se-component-selected|se-figure-selected|se-figure-over-selected)\b/g, '')
        .replace(/\sclass=""/g, '')
        .replace(/\sstyle=""/g, '');
    }

    function sync() {
      // pristine 은 붙이기가 끝나야 생긴다 — 붙이는 중 SunEditor 가 보내는 onChange 로 본문(정규화된 html)을 덮어쓰지 않는다
      if (!editor || pristine === null) return;
      var html = cleanHtml(editor.$.html.get());
      if (pristine !== null && html === pristine) html = original;
      if (textarea.value !== html) {
        textarea.value = html;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (onSynced) onSynced();
    }

    function mount() {
      if (editor || !wanted() || !window.SUNEDITOR) return;
      var P = window.SUNEDITOR.plugins;
      holder = document.createElement('div');
      holder.className = 'cms-admin-wysiwyg';
      textarea.parentNode.insertBefore(holder, textarea);
      textarea.hidden = true;
      // 숨은 textarea 의 required 는 브라우저 검사에서 「포커스할 수 없는 칸」 오류를 낸다 — 붙어 있는 동안만 뗀다.
      if (textarea.required) {
        textarea.required = false;
        textarea.setAttribute('data-wysiwyg-required', '');
      }
      editor = window.SUNEDITOR.create(holder, {
        lang: window.SUNEDITOR_LANG && window.SUNEDITOR_LANG.ko,
        width: '100%',
        minHeight: textarea.getAttribute('data-wysiwyg-min-height') || '40rem',
        plugins: [P.blockStyle, P.list_numbered, P.list_bulleted, P.align, P.hr, P.table, P.link, P.blockquote, P.image],
        buttonList: [
          ['undo', 'redo'], ['blockStyle'], ['bold', 'underline', 'italic', 'strike'], ['removeFormat'],
          ['list_numbered', 'list_bulleted', 'outdent', 'indent'], ['align'], ['hr', 'table', 'link', 'blockquote'],
          ['codeView', 'fullScreen']
        ],
        // 문단 형식: 본문 · 제목 h2~h4(h1 은 페이지 제목) · 인용.
        blockStyle: { items: ['p', 'h2', 'h3', 'h4', 'blockquote'] },
        // 그림 편집 창에는 파일 올리기 칸을 두지 않는다(올리기는 「이미지 삽입」 창 → images 폴더).
        image: { createFileInput: false, createUrlInput: true, useFormatType: false },
        events: {
          onChange: sync,
          onToggleCodeView: sync,
          onBlur: sync,
          // 붙여넣기 · 끌어 놓기로 들어온 그림 파일: 본문에 base64 로 박지 않고 「이미지 삽입」 창에 넘긴다 — 그 콘텐츠의 이미지 폴더로
          // 올라가 골라진 상태로 열리고, 대체 텍스트를 쓰고 [넣기]를 누르면 /images/… 주소로 들어간다.
          onImageUploadBefore: function (params) {
            var files = params && params.info && params.info.files ? Array.prototype.slice.call(params.info.files) : [];
            var handed = files.length && window.cmsImagePicker && window.cmsImagePicker.openWithFiles(textarea, files);
            if (!handed) {
              var live = root.querySelector('.cms-admin-editor__live');
              if (live) live.textContent = '그림 파일은 [이미지 삽입]으로 올려 주세요(images 폴더).';
            }
            return false;
          }
        }
      });
      original = textarea.value;
      editor.$.html.set(textarea.value || '');
      pristine = cleanHtml(editor.$.html.get());
      // SunEditor 는 붙인 요소 옆(형제)에 자기 틀(.sun-editor)을 만든다 — 같은 칸(부모) 전체에서 찾는다.
      labelUnnamedButtons(holder.parentNode);
      textarea.__cmsWysiwyg = {
        insertHtml: function (html) {
          editor.$.html.insert(html);
          sync();
        }
      };
    }

    // SunEditor 의 목록 종류 화살표(.se-sub-arrow-btn) 같은 보조 버튼은 이름이 없다(axe button-name) — 안 보이는 툴팁 글자는 이름이
    // 되지 않으므로, 보이는 글자가 없는 버튼에 툴팁(또는 옆 주 버튼) 이름을 aria-label 로 붙인다.
    function labelUnnamedButtons(scope) {
      scope.querySelectorAll('button').forEach(function (b) {
        if (b.getAttribute('aria-label') || b.getAttribute('aria-labelledby')) return;
        var visible = Array.prototype.filter.call(b.childNodes, function (n) {
          return !(n.classList && n.classList.contains('se-tooltip-inner'));
        }).map(function (n) { return n.textContent; }).join('').trim();
        if (visible) return;
        var tip = b.querySelector('.se-tooltip-text');
        var main = b.previousElementSibling;
        var base = (tip && tip.textContent.trim()) || (main && (main.getAttribute('aria-label') || main.title))
          || b.title || b.getAttribute('data-command') || '도구';
        b.setAttribute('aria-label', base + (b.classList.contains('se-sub-arrow-btn') ? ' 종류 선택' : ''));
      });
    }

    function unmount() {
      if (!editor) return;
      sync();
      try { editor.destroy(); } catch (e) { /* 이미 해제됨 */ }
      editor = null;
      original = null;
      pristine = null;
      if (holder && holder.parentNode) holder.parentNode.removeChild(holder);
      holder = null;
      textarea.hidden = false;
      if (textarea.hasAttribute('data-wysiwyg-required')) {
        textarea.required = true;
        textarea.removeAttribute('data-wysiwyg-required');
      }
      delete textarea.__cmsWysiwyg;
    }

    // 숨은 칸(게시글마다 있는 수정 패널 · 닫힌 등록 패널)은 보일 때 붙인다 — 화면에 편집기 수십 개를 미리 만들지 않는다.
    function mountWhenVisible() {
      if (root.getClientRects().length > 0 || !('IntersectionObserver' in window)) {
        mount();
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) {
          io.disconnect();
          mount();
        }
      });
      io.observe(root);
    }

    if (formatSelect) {
      formatSelect.addEventListener('change', function () {
        if (wanted()) mount(); else unmount();
      });
    }
    // 폼 제출 직전 동기화 — 본문 textarea 는 form= 속성으로 폼 밖에 있을 수 있어 문서에서 잡는다.
    document.addEventListener('submit', function (e) {
      if (editor && textarea.form && e.target === textarea.form) sync();
    }, true);

    // 페이지 끝의 SunEditor 스크립트(defer)가 이 파일보다 늦게 실행되므로 없으면 DOMContentLoaded 뒤에 다시 본다.
    if (window.SUNEDITOR) {
      mountWhenVisible();
    } else {
      document.addEventListener('DOMContentLoaded', mountWhenVisible);
    }
  }

  // ── 지정 루트(기본 document) 하위 에디터 초기화 ──────────────────────
  // 인라인 상세 fragment 주입 후 재초기화(cmsContentEditor.init(panel))에 대비해
  // root 인자를 받고, 이미 바인딩된 인스턴스는 initEditor 내부 가드로 건너뛴다.
  function init(root) {
    var scope = root || document;
    var editors = scope.querySelectorAll('.cms-admin-editor');
    for (var i = 0; i < editors.length; i++) {
      initEditor(editors[i]);
    }
    // 편집기 틀(.cms-admin-editor) 없이 위지윅만 쓰는 textarea(팝업 내용 등) — 형식 선택 · 미리보기 없음, 언제나 HTML.
    var plain = scope.querySelectorAll('textarea[data-wysiwyg-textarea]');
    for (var j = 0; j < plain.length; j++) {
      if (plain[j].__cmsWysiwygBound) continue;
      plain[j].__cmsWysiwygBound = true;
      bindWysiwyg(plain[j].parentNode, plain[j], null, null);
    }
    bindUnsavedGuard(scope);
  }

  // ── 콘텐츠 수정 화면: 저장하지 않은 채 다른 폼을 보내면 묻기 ─────────
  // [수정하기] 폼(form[data-content-save-form])의 칸(form= 로 붙은 칸 포함)을 처음 값과 견준다. 같은 화면([data-content-editor-page])의
  // 다른 폼(게시하기 · 예약 · 검토 요청 · SEO 저장 등)은 저장된 버전만 다루므로, 고친 것이 있으면 보내기 전에 묻는다.
  // 따로 묻는 폼(삭제)은 data-unsaved-skip 으로 뺀다. 위지윅은 바뀌면 · 칸을 떠나면 글상자에 옮겨 두므로 글상자 값으로 본다.
  // 인라인 상세(innerHTML 로 넣은 조각)는 init(panel) 때 처음 값을 잡는다.
  var unsavedGuardInstalled = false;

  function saveFields(form) {
    return Array.prototype.filter.call(form.elements, function (el) {
      return el.name && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button';
    });
  }

  function bindUnsavedGuard(scope) {
    var forms = Array.prototype.slice.call(scope.querySelectorAll('form[data-content-save-form]'));
    if (scope.matches && scope.matches('form[data-content-save-form]')) forms.push(scope);
    forms.forEach(function (form) {
      if (!form.__cmsUnsavedInitial) {
        form.__cmsUnsavedInitial = saveFields(form).map(function (el) { return el.value; });
      }
    });
    if (unsavedGuardInstalled || !forms.length) return;
    unsavedGuardInstalled = true;
    document.addEventListener('submit', function (e) {
      var target = e.target;
      if (!target || !target.closest || target.hasAttribute('data-content-save-form') || target.hasAttribute('data-unsaved-skip')) return;
      var page = target.closest('[data-content-editor-page]');
      var save = page && page.querySelector('form[data-content-save-form]');
      var initial = save && save.__cmsUnsavedInitial;
      if (!initial) return;
      var dirty = saveFields(save).some(function (el, i) { return el.value !== initial[i]; });
      if (dirty && !window.confirm('고친 내용을 아직 저장하지 않았습니다. 이대로 계속하면 고친 내용은 사라집니다.\n'
          + '먼저 [수정하기]로 저장하려면 [취소]를 누르세요.')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  // ── 전역 노출 ─────────────────────────────────────────────────────────
  window.cmsContentEditor = { init: init };

  // ── <details> 펼침 시 내부 에디터 지연 바인딩 ────────────────────────
  // 상세는 details(예: "본문 수정") 안에 에디터를 두므로, 최초 펼침 시점에
  // 바인딩해 인라인 주입된 콘텐츠에서도 미리보기가 동작하도록 한다.
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.tagName === 'DETAILS' && d.open) {
      init(d);
    }
  }, true);

  // ── DOMContentLoaded 부트스트랩 ──────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }
}());
