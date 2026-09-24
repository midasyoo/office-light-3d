/* ============================================================
 *  스마트폰 화면 컨트롤러
 *
 *  app.js 는 손대지 않는다. 같은 DOM id 를 그대로 쓰되,
 *  조작 방식만 손가락에 맞춘다.
 *   - 바텀시트 3단계(접힘 / 반 / 전체) + 손잡이 끌기
 *   - 탭 전환(조명 / 검색 / 좌석 / 연구실 / 제어)
 *   - 좌석을 누르면 좌석 탭으로 따라간다
 * ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var sheet = $('msheet');
  var handle = $('mhandle');

  /* ---------------- 바텀시트 ---------------- */
  var STATES = ['peek', 'half', 'full'];
  var state = 'peek';

  function setSheet(s) {
    state = s;
    sheet.classList.remove('half', 'full');
    if (s !== 'peek') sheet.classList.add(s);
    document.body.classList.toggle('sheet-open', s !== 'peek');
  }
  function openSheet() { if (state === 'peek') setSheet('half'); }

  // 손잡이 끌기 — 놓은 방향으로 한 단계 움직인다
  var dragY = null, dragFrom = null;
  handle.addEventListener('pointerdown', function (e) {
    dragY = e.clientY;
    dragFrom = state;
    sheet.style.transition = 'none';
    handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', function (e) {
    if (dragY === null) return;
    var h = window.innerHeight;
    var base = { peek: h * 0.88 - 132, half: h * 0.46, full: 0 }[dragFrom];
    var dy = Math.max(0, base + (e.clientY - dragY));
    sheet.style.transform = 'translateY(' + dy + 'px)';
  });
  function endDrag(e) {
    if (dragY === null) return;
    var dy = e.clientY - dragY;
    dragY = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    var i = STATES.indexOf(dragFrom);
    if (dy < -40) setSheet(STATES[Math.min(2, i + 1)]);
    else if (dy > 40) setSheet(STATES[Math.max(0, i - 1)]);
    else setSheet(dragFrom);
  }
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', function () {
    if (dragY === null) return;
    dragY = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    setSheet(dragFrom);
  });
  // 끌지 않고 툭 누르면 열고 닫는다
  handle.addEventListener('click', function () {
    setSheet(state === 'peek' ? 'half' : 'peek');
  });

  /* ---------------- 탭 ---------------- */
  function showPane(name) {
    var tabs = document.querySelectorAll('.mtab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('on', tabs[i].dataset.pane === name);
    }
    var panes = document.querySelectorAll('.mpane');
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.toggle('on', panes[j].id === 'mpane-' + name);
    }
    $('mbody').scrollTop = 0;
    openSheet();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.mtab'), function (t) {
    t.addEventListener('click', function () { showPane(t.dataset.pane); });
  });

  /* ---------------- 3D 를 가리지 않도록 ----------------
     화면을 보려고 누른 것이므로, 조명을 켜고 끌 때는 시트를 내린다. */
  $('lightPanel').addEventListener('click', function (e) {
    if (e.target.classList.contains('lbtn') && state === 'full') setSheet('half');
  });

  // 검색 결과를 고르면 그 좌석으로 날아간다 — 시트를 접어 화면을 보여준다
  $('results').addEventListener('click', function () {
    setTimeout(function () { setSheet('peek'); }, 40);
  });
  $('q').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') e.target.blur();
  });

  /* ---------------- 좌석을 누르면 좌석 탭으로 ----------------
     app.js 가 #figTarget 에 on 클래스를 붙이는 것을 신호로 삼는다. */
  var figTarget = $('figTarget');
  if (figTarget) {
    new MutationObserver(function () {
      if (figTarget.classList.contains('on') && state !== 'peek') showPane('seat');
    }).observe(figTarget, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------------- 근무 인원 수 미러링 ----------------
     app.js 는 #sitCount 하나만 갱신한다. 상단 배지와 조명 탭 양쪽에
     같은 값을 보여주기 위해 값이 바뀔 때 따라 쓴다. */
  var src = $('sitCount'), dst = $('sitCount2');
  if (src && dst) {
    new MutationObserver(function () { dst.textContent = src.textContent; })
      .observe(src, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- 화면 회전·주소창 변화 ---------------- */
  var t = null;
  function relayout() {
    clearTimeout(t);
    t = setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 220);
  }
  window.addEventListener('orientationchange', relayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', relayout);

  /* ---------------- 서비스워커 (설치형일 때만 의미 있다) ---------------- */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {
        /* 오프라인 캐시는 있으면 좋은 기능일 뿐, 없어도 앱은 그대로 돈다 */
      });
    });
  }

  /* ---------------- 첫 화면 ---------------- */
  setSheet('peek');
})();
