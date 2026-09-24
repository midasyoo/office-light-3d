/* 앱 설치 안내.
 *
 *  Chrome·Edge 계열은 설치 가능 시점에 beforeinstallprompt 를 준다.
 *  그때만 단추를 만들어 붙이고, 이미 설치해 열었거나 설치를 지원하지 않는
 *  브라우저에서는 아무것도 보여주지 않는다 — 누를 수 없는 단추는 없느니만 못하다.
 *
 *  iOS Safari 는 이 이벤트를 주지 않는다. 대신 "공유 → 홈 화면에 추가"를
 *  손수 눌러야 하므로 그 안내만 띄운다.
 */
(function () {
  'use strict';

  var slot = document.getElementById('installSlot');
  var standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  if (standalone) return;                       // 이미 앱으로 열려 있다

  var deferred = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();                          // 브라우저 기본 배너 대신 우리 단추를 쓴다
    deferred = e;
    if (!slot || slot.querySelector('button')) return;

    var b = document.createElement('button');
    b.id = 'mInstall';
    b.type = 'button';
    b.className = 'primary';          // 데스크탑 화면의 기본 단추 모양을 따른다
    b.style.width = '100%';
    b.textContent = '앱으로 설치';
    b.addEventListener('click', function () {
      if (!deferred) return;
      var prompt = deferred;
      deferred = null;
      b.disabled = true;
      prompt.prompt();
      prompt.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') {
          b.remove();
        } else {
          b.disabled = false;
          b.textContent = '앱으로 설치';
        }
      }).catch(function () { b.disabled = false; });
    });
    slot.appendChild(b);
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    var b = document.getElementById('mInstall');
    if (b) b.remove();
  });

  // iOS Safari — 설치 이벤트가 없으므로 방법만 알려 준다
  var ua = navigator.userAgent;
  var iOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var webkitOnly = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  if (iOS && webkitOnly) {
    var hint = document.getElementById('iosHint');
    if (hint) hint.style.display = 'block';
  }
})();
