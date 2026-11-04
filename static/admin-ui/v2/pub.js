/* 로컬 미리보기 전용. 실제 콘솔에는 들어가지 않는다.
   화면 이동([data-pub-href]) · 메뉴 접기 · 툴팁([data-tip]) · 키트에 없는 동작 안내만 맡는다. */
(function () {
  var tip = document.createElement('div');
  tip.id = 'tip'; tip.className = 'pub-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.appendChild(tip);
  function place(el) {
    tip.style.left = '0px'; tip.style.top = '0px';
    var r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    var top = r.top - th - 8; if (top < 56) { top = r.bottom + 8; }
    tip.style.top = Math.max(8, top) + 'px';
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8)) + 'px';
  }
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.hidden = true; return; }
    tip.textContent = el.getAttribute('data-tip'); tip.hidden = false; place(el);
  });
  window.addEventListener('scroll', function () { tip.hidden = true; }, true);

  function toast(text) {
    var root = document.getElementById('toast-root');
    if (!root) { return; }
    root.innerHTML = '<div class="pub-toast" role="status">' + text + '</div>';
    setTimeout(function () { root.innerHTML = ''; }, 1800);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pub-href], [data-navcollapse], [data-navexpand], [data-soon], [data-cm], [data-m], [data-menu], [data-board]');
    if (!t) { return; }
    if (t.hasAttribute('data-pub-href')) { e.preventDefault(); location.href = t.getAttribute('data-pub-href'); return; }
    var shell = document.getElementById('shell');
    if (t.hasAttribute('data-navcollapse')) { shell.classList.add('is-nav-collapsed'); return; }
    if (t.hasAttribute('data-navexpand')) { shell.classList.remove('is-nav-collapsed'); return; }
    e.preventDefault();
    toast('이 키트에는 없는 화면·동작입니다.');
  });
})();
