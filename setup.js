/* ============================================================================
 *  좌석 설정 — 공개판 전용
 *
 *  좌석 이름을 바꾸고, 사진을 올려 자리에 배정한다.
 *  입력한 내용은 전부 이 브라우저(localStorage) 안에만 남는다.
 *  서버로 올리지 않고, 올릴 곳도 없다 — 공개판은 정적 파일뿐이다.
 *
 *  app.js 가 노출한 window.Room 훅만 사용하며, app.js 자체는 건드리지 않는다.
 * ========================================================================== */
(function () {
  'use strict';

  var NAME_KEY = 'room3d.names.v1';     // {원래이름: 바꾼이름}
  var PHOTO_KEY = 'room3d.photos.v1';   // [{id, face}]
  var MAX_PHOTOS = 40;
  var FACE_PX = 160;                     // 얼굴 텍스처 한 변 (원본은 버린다)

  var Room = window.Room;
  if (!Room) return;                     // 내부판에서는 훅이 없어도 그냥 넘어간다

  var $ = function (id) { return document.getElementById(id); };
  var nameInput = $('seatName');
  var renameBtn = $('seatRename');
  var addBtn = $('figAdd');
  var fileInput = $('figFile');
  var resetBtn = $('figReset');
  if (!nameInput || !fileInput) return;

  var toast = Room.toast || function () {};

  /* ── 저장 ──────────────────────────────────────────────────────────── */
  function load(key, dflt) {
    try { return JSON.parse(localStorage.getItem(key)) || dflt; }
    catch (e) { return dflt; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {
      toast('저장 공간이 부족합니다. 사진을 줄여 주세요.');
      return false;
    }
  }

  var nameMap = load(NAME_KEY, {});
  var photos = load(PHOTO_KEY, []);

  /* ── 1) 저장해 둔 사진 복원 ────────────────────────────────────────── */
  photos.forEach(function (p) { Room.addFigure(p); });

  /* ── 2) 저장해 둔 이름 복원 ────────────────────────────────────────── */
  Object.keys(nameMap).forEach(function (orig) {
    Room.renameSeat(orig, nameMap[orig]);
  });

  /* ── 3) 좌석을 클릭하면 이름 칸에 채운다 ───────────────────────────── */
  var figTargetEl = $('figTarget');
  if (figTargetEl) {
    new MutationObserver(function () {
      var t = figTargetEl.textContent || '';
      var m = t.split(' — ')[0].trim();
      if (m && figTargetEl.classList.contains('on')) {
        nameInput.value = m;
        nameInput.dataset.current = m;
      }
    }).observe(figTargetEl, { childList: true, characterData: true, subtree: true });
  }

  /* ── 4) 이름 바꾸기 ────────────────────────────────────────────────── */
  function doRename() {
    var cur = nameInput.dataset.current;
    var next = nameInput.value.trim();
    if (!cur) return toast('먼저 좌석을 클릭하세요');
    if (!next) return toast('새 이름을 입력하세요');
    if (next === cur) return;

    if (!Room.renameSeat(cur, next)) return;

    // 원래 이름을 기준으로 기록해 두어야 새로고침 후에도 같은 자리에 붙는다
    var orig = cur;
    Object.keys(nameMap).forEach(function (k) { if (nameMap[k] === cur) orig = k; });
    nameMap[orig] = next;
    save(NAME_KEY, nameMap);

    nameInput.dataset.current = next;
    toast(cur + ' → ' + next + ' 로 변경', 'ok');
  }
  renameBtn.addEventListener('click', doRename);
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); doRename(); }
  });

  /* ── 5) 사진 추가 ──────────────────────────────────────────────────── */
  addBtn.addEventListener('click', function () { fileInput.click(); });

  /** 얼굴이 들어갈 정사각형으로 잘라 줄인다. 원본 해상도는 저장하지 않는다. */
  function toSquare(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = Math.min(img.width, img.height);
        var c = document.createElement('canvas');
        c.width = c.height = FACE_PX;
        var g = c.getContext('2d');
        // 가운데를 정사각형으로 자르되, 얼굴이 대체로 위쪽에 있으므로 조금 위를 잡는다
        g.drawImage(img, (img.width - s) / 2, (img.height - s) * 0.32, s, s,
                    0, 0, FACE_PX, FACE_PX);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 읽지 못했습니다')); };
      img.src = url;
    });
  }

  fileInput.addEventListener('change', async function () {
    var files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (!files.length) return;

    var room = MAX_PHOTOS - photos.length;
    if (room <= 0) return toast('사진은 최대 ' + MAX_PHOTOS + '장까지 넣을 수 있습니다');
    if (files.length > room) {
      toast('최대 ' + MAX_PHOTOS + '장까지만 — ' + room + '장만 넣습니다');
      files = files.slice(0, room);
    }

    var added = 0;
    for (var i = 0; i < files.length; i++) {
      if (!/^image\//.test(files[i].type)) continue;
      try {
        var face = await toSquare(files[i]);
        var base = (files[i].name || 'photo').replace(/\.[^.]+$/, '').slice(0, 12) || '사진';
        var id = base;
        for (var n = 2; photos.some(function (p) { return p.id === id; }); n++) id = base + n;
        var fig = { id: id, face: face };
        if (Room.addFigure(fig)) { photos.push(fig); added++; }
      } catch (e) { /* 개별 실패는 건너뛴다 */ }
    }
    if (added) {
      save(PHOTO_KEY, photos);
      toast(added + '장 추가 — 좌석을 고른 뒤 사진을 클릭하면 배정됩니다', 'ok');
    } else {
      toast('추가된 사진이 없습니다');
    }
  });

  /* ── 6) 전체 초기화 ────────────────────────────────────────────────── */
  resetBtn.addEventListener('click', function () {
    if (!confirm('바꾼 이름과 올린 사진을 모두 지우고 처음 상태로 되돌립니다.\n계속할까요?')) return;
    try {
      localStorage.removeItem(NAME_KEY);
      localStorage.removeItem(PHOTO_KEY);
      localStorage.removeItem('room3d.figmap');     // app.js 의 배정 정보
    } catch (e) { /* 무시 */ }
    location.reload();
  });
})();
