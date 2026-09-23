/* ============================================================
 * 사무실 파티션 좌석 조명 제어 3D
 *  - 배치도(docs/layout.png) 실측 → data.js (좌석 72석 / 조명 30개)
 *  - 조명 또는 좌석을 클릭하면 해당 조명을 켜고 끈다
 *  - 제어 API: POST {url}  {gwip, data:[{address, value}]}
 * ============================================================ */
(function () {
  'use strict';

  const D = ROOM3D;
  const R = D.room;

  /* ---------------- 치수 상수 (m) ---------------- */
  const DESK_H = 0.72;        // 책상 상판 높이
  const DESK_DEPTH = 0.70;    // 책상 깊이
  const PART_H = 1.25;        // 파티션 높이
  const PART_T = 0.05;        // 파티션 두께
  const BAR_H = R.h - 0.10;   // 조명 높이
  const CLUSTERS = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]];

  const COL = {
    floor: 0xd9dee6, carpet: 0xccd2db, wall: 0xf2f4f7,
    desk: 0xd9c3a3, deskEdge: 0x8d7355, part: 0xb8c0cc, partTop: 0x97a1b0,
    chair: 0x3f4756, monitor: 0x222833, screen: 0x11161f,
    barOff: 0x9aa3b2, barOn: 0xfff2c4, frame: 0x6b7280,
  };

  /* ---------------- 기본 장면 ---------------- */
  const wrap = document.getElementById('canvas-wrap');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  wrap.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 3;
  controls.maxDistance = 90;

  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6b7280, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 0.45);
  sun.position.set(-18, 34, 12);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.2);
  fill.position.set(16, 20, -14);
  scene.add(fill);

  /* ---------------- 실(室) 구조 ---------------- */
  const roomGroup = new THREE.Group();
  scene.add(roomGroup);

  // 바닥
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(R.w + 1.2, R.d + 1.2),
    new THREE.MeshLambertMaterial({ color: COL.floor }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
  roomGroup.add(floor);

  // 벽 (낮게 세워 내부가 보이도록)
  const WALL_H = 1.6;
  const wallMat = new THREE.MeshLambertMaterial({ color: COL.wall, side: THREE.DoubleSide });
  function wall(x, z, w, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
    m.position.set(x, WALL_H / 2, z);
    roomGroup.add(m);
  }
  const T = 0.16;
  wall((R.x0 + R.x1) / 2, R.z0, R.w, T);                 // 북
  wall((R.x0 + R.x1) / 2, R.z1, R.w, T);                 // 남
  wall(R.x1, (R.z0 + R.z1) / 2, T, R.d);                 // 동
  // 서측 벽은 출입구를 비워 둔다
  const doorHalf = R.door.w / 2;
  const westTop = R.door.z - doorHalf - R.z0;
  const westBot = R.z1 - (R.door.z + doorHalf);
  wall(R.x0, R.z0 + westTop / 2, T, westTop);
  wall(R.x0, R.z1 - westBot / 2, T, westBot);

  // 출입구 바닥 표시
  const doorPad = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, R.door.w),
    new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.22 }));
  doorPad.rotation.x = -Math.PI / 2;
  doorPad.position.set(R.x0 - 0.7, 0.02, R.door.z);
  roomGroup.add(doorPad);

  // 천장 (기본 숨김)
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(R.w, R.d),
    new THREE.MeshLambertMaterial({ color: 0xf8fafc, side: THREE.DoubleSide }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set((R.x0 + R.x1) / 2, R.h, (R.z0 + R.z1) / 2);
  ceil.visible = false;
  roomGroup.add(ceil);

  /* ---------------- 이름표 텍스처 ---------------- */
  const plateCache = {};
  function plateTexture(name, hex) {
    const key = name + hex;
    if (plateCache[key]) return plateCache[key];
    const c = document.createElement('canvas');
    c.width = 384; c.height = 148;
    const g = c.getContext('2d');
    g.fillStyle = hex; g.fillRect(0, 0, 384, 148);
    g.strokeStyle = 'rgba(30,41,59,.55)'; g.lineWidth = 7;
    g.strokeRect(4, 4, 376, 140);
    g.fillStyle = '#1e293b';
    g.font = 'bold 84px "Malgun Gothic", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, 192, 80);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    plateCache[key] = t;
    return t;
  }

  /* ---------------- 좌석(파티션 자리) ---------------- */
  const seatObjs = [];     // {data, tile, plate, group}
  const byAddr = {};       // addr -> {light, seats[]}

  const deskMatCache = {};
  function deskMatFor(hex) {
    if (!deskMatCache[hex]) {
      const c = new THREE.Color(hex).lerp(new THREE.Color(COL.desk), 0.30);
      deskMatCache[hex] = new THREE.MeshLambertMaterial({ color: c });
    }
    return deskMatCache[hex];
  }
  const partMat = new THREE.MeshLambertMaterial({ color: COL.part });
  const chairMat = new THREE.MeshLambertMaterial({ color: COL.chair });
  const monMat = new THREE.MeshLambertMaterial({ color: COL.monitor });
  const scrMat = new THREE.MeshBasicMaterial({ color: COL.screen });

  const geoDesk = new THREE.BoxGeometry(DESK_DEPTH, 0.04, 1.50);
  const geoLeg = new THREE.BoxGeometry(0.05, DESK_H, 0.05);
  const geoSeat = new THREE.BoxGeometry(0.46, 0.08, 0.46);
  const geoBack = new THREE.BoxGeometry(0.08, 0.50, 0.44);
  const geoPost = new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8);
  const geoMonArm = new THREE.BoxGeometry(0.06, 0.26, 0.06);
  const geoMon = new THREE.BoxGeometry(0.05, 0.34, 0.60);
  const geoScr = new THREE.PlaneGeometry(0.55, 0.30);

  D.seats.forEach(s => {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    scene.add(g);

    // 연구실 색 바닥 타일 (배치도와 동일한 색 구분)
    const tile = new THREE.Mesh(
      new THREE.PlaneGeometry(s.w - 0.06, s.d - 0.06),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(s.color), transparent: true, opacity: 0.55,
        emissive: new THREE.Color(s.color), emissiveIntensity: 0,
      }));
    tile.rotation.x = -Math.PI / 2;
    tile.position.y = 0.012;
    tile.userData.seat = s;
    g.add(tile);

    // 좌석 방향: 클러스터 왼쪽 열은 +x(중앙 스파인)를 향한다
    const dir = (s.col % 2 === 0) ? 1 : -1;
    const deskX = dir * (s.w / 2 - DESK_DEPTH / 2 - 0.04);

    if (!s.empty) {
      const desk = new THREE.Mesh(geoDesk, deskMatFor(s.color));
      desk.position.set(deskX, DESK_H, 0);
      g.add(desk);
      [-0.68, 0.68].forEach(dz => {
        const l1 = new THREE.Mesh(geoLeg, chairMat);
        l1.position.set(deskX - DESK_DEPTH / 2 + 0.06, DESK_H / 2, dz);
        g.add(l1);
        const l2 = new THREE.Mesh(geoLeg, chairMat);
        l2.position.set(deskX + DESK_DEPTH / 2 - 0.06, DESK_H / 2, dz);
        g.add(l2);
      });

      // 이름표 (상판 위, 위에서 읽힘)
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.88, 0.34),
        new THREE.MeshBasicMaterial({ map: plateTexture(s.name, s.color), transparent: true }));
      plate.rotation.x = -Math.PI / 2;
      plate.rotation.z = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      plate.position.set(deskX - dir * 0.10, DESK_H + 0.025, 0);
      g.add(plate);

      // 모니터
      const arm = new THREE.Mesh(geoMonArm, monMat);
      arm.position.set(deskX + dir * 0.22, DESK_H + 0.13, 0);
      g.add(arm);
      const mon = new THREE.Mesh(geoMon, monMat);
      mon.position.set(deskX + dir * 0.22, DESK_H + 0.42, 0);
      g.add(mon);
      const scr = new THREE.Mesh(geoScr, scrMat);
      scr.position.set(deskX + dir * 0.19, DESK_H + 0.42, 0);
      scr.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(scr);

      // 의자
      const cx = deskX - dir * 0.62;
      const st = new THREE.Mesh(geoSeat, chairMat);
      st.position.set(cx, 0.45, 0);
      g.add(st);
      const bk = new THREE.Mesh(geoBack, chairMat);
      bk.position.set(cx - dir * 0.20, 0.72, 0);
      g.add(bk);
      const po = new THREE.Mesh(geoPost, chairMat);
      po.position.set(cx, 0.21, 0);
      g.add(po);
    }

    const rec = { data: s, tile: tile, group: g };
    seatObjs.push(rec);
    (byAddr[s.addr] = byAddr[s.addr] || { seats: [] }).seats.push(rec);
  });

  /* ---------------- 파티션 (클러스터 단위) ---------------- */
  function panel(x, z, w, d, h) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), partMat);
    m.position.set(x, h / 2, z);
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.035, d + 0.02),
      new THREE.MeshLambertMaterial({ color: COL.partTop }));
    cap.position.set(x, h + 0.015, z);
    scene.add(cap);
  }

  ['N', 'S'].forEach(blk => {
    CLUSTERS.forEach(pair => {
      const cells = D.seats.filter(s => s.block === blk && pair.indexOf(s.col) >= 0);
      if (!cells.length) return;
      const xs = cells.map(s => s.x), zs = cells.map(s => s.z);
      const w = cells[0].w, d = cells[0].d;
      const x0 = Math.min.apply(null, xs) - w / 2, x1 = Math.max.apply(null, xs) + w / 2;
      const z0 = Math.min.apply(null, zs) - d / 2, z1 = Math.max.apply(null, zs) + d / 2;

      // 앞뒤(남북) 외곽만 세운다.
      // 좌우 끝은 앉은 사람의 등 뒤 = 드나드는 곳이라 열어 둔다.
      panel((x0 + x1) / 2, z0, x1 - x0, PART_T, PART_H);
      panel((x0 + x1) / 2, z1, x1 - x0, PART_T, PART_H);
      // 중앙 스파인 (두 열 사이, 마주보는 좌석 분리)
      panel((x0 + x1) / 2, (z0 + z1) / 2, PART_T, z1 - z0, PART_H);
      // 행 사이 칸막이 (낮게)
      const rowZ = Array.from(new Set(zs)).sort((a, b) => a - b);
      for (let i = 0; i + 1 < rowZ.length; i++) {
        panel((x0 + x1) / 2, (rowZ[i] + rowZ[i + 1]) / 2, x1 - x0, PART_T, PART_H * 0.78);
      }
    });
  });

  /* ---------------- 천장 조명 ---------------- */
  const lightObjs = [];
  const geoGlowPool = new THREE.PlaneGeometry(1, 1);

  function poolTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,236,170,.85)');
    grd.addColorStop(0.55, 'rgba(255,236,170,.30)');
    grd.addColorStop(1, 'rgba(255,236,170,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  const poolTex = poolTexture();

  D.lights.forEach(L => {
    const grp = new THREE.Group();
    grp.position.set(L.x, 0, L.z);
    scene.add(grp);

    // 등기구 마운트 (좁게 — 위에서 봐도 발광면을 가리지 않음)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(L.len, 0.05, 0.10),
      new THREE.MeshLambertMaterial({ color: COL.frame }));
    body.position.y = BAR_H + 0.13;
    grp.add(body);

    // 발광면 (모든 방향에서 점등이 보이도록 두껍게)
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(L.len, 0.13, 0.26),
      new THREE.MeshLambertMaterial({
        color: COL.barOff, emissive: new THREE.Color(0xffe0a0), emissiveIntensity: 0,
      }));
    lens.position.y = BAR_H + 0.03;
    lens.userData.light = L;
    grp.add(lens);

    // 바닥 빛 웅덩이
    const pool = new THREE.Mesh(geoGlowPool, new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.035;
    pool.scale.set(L.len + 2.0, 3.9, 1);
    grp.add(pool);

    const rec = { data: L, lens: lens, pool: pool, body: body, on: false };
    lightObjs.push(rec);
    const b = (byAddr[L.addr] = byAddr[L.addr] || { seats: [] });
    b.light = rec;
  });

  /* ---------------- 인물 피규어 ---------------- */
  // figures.js 는 const 선언이라 window 에 붙지 않는다 — 직접 참조한다
  const FIGS = (typeof FIGURES !== 'undefined') ? FIGURES : [];
  const FIGKEY = 'room3d.figmap';
  let figMap = {};
  try { figMap = JSON.parse(localStorage.getItem(FIGKEY) || '{}'); } catch (e) { figMap = {}; }
  People.init(scene, D.seats, R, figMap, FIGS);

  /* ---------------- 상태 & 표시 갱신 ---------------- */
  const state = {};                  // addr -> bool
  D.lights.forEach(L => { state[L.addr] = false; });
  let selectedAddr = null;
  let labFilter = null;

  function applyLight(addr) {
    const b = byAddr[addr];
    if (!b) return;
    const on = !!state[addr];
    if (b.light) {
      b.light.on = on;
      b.light.lens.material.emissiveIntensity = on ? 1.0 : 0;
      b.light.lens.material.color.setHex(on ? COL.barOn : COL.barOff);
      b.light.pool.material.opacity = on ? 0.15 : 0;
    }
    b.seats.forEach(s => { s.tile.material.emissiveIntensity = on ? 0.42 : 0; });
  }

  function refreshUI() {
    const n = D.lights.filter(L => state[L.addr]).length;
    document.getElementById('onCount').textContent = n;
    // 켜진 조명 수에 따라 실내 기본 밝기 반응
    const k = n / D.lights.length;
    hemi.intensity = 0.34 + 0.30 * k;
    sun.intensity = 0.30 + 0.22 * k;
    document.querySelectorAll('.lbtn').forEach(btn => {
      const a = +btn.dataset.addr;
      btn.classList.toggle('on', !!state[a]);
      btn.classList.toggle('sel', a === selectedAddr);
    });
  }

  /* ---------------- 제어 API ----------------
     공개판에는 사내 설비 주소가 없다. 그때는 시뮬레이션만 남고
     주소 입력란도 화면에 없으므로, 둘 다 없는 상태를 정상으로 다룬다. */
  const API = D.api || null;
  const cfg = { url: API ? API.url : '', gwip: API ? API.gwip : '', mode: 'sim' };
  const elUrl = document.getElementById('apiUrl');
  const elGw = document.getElementById('apiGw');
  if (elUrl && elGw) {
    elUrl.value = cfg.url; elGw.value = cfg.gwip;
    elUrl.onchange = () => { cfg.url = elUrl.value.trim(); };
    elGw.onchange = () => { cfg.gwip = elGw.value.trim(); };
  }

  document.querySelectorAll('#modes label').forEach(lb => {
    lb.onclick = () => {
      cfg.mode = lb.dataset.m;
      document.querySelectorAll('#modes label').forEach(o => o.classList.toggle('sel', o === lb));
      toast(cfg.mode === 'real' ? '실제 제어 모드 — 사내망에서만 동작합니다' : '시뮬레이션 모드 — 화면만 바뀝니다');
    };
  });

  async function send(entries) {
    if (cfg.mode === 'sim') return { simulated: true };
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gwip: cfg.gwip, data: entries }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json().catch(() => ({}));
  }

  async function setLights(addrs, value) {
    addrs.forEach(a => { state[a] = !!value; applyLight(a); });
    refreshUI();
    try {
      await send(addrs.map(a => ({ address: a, value: value ? 1 : 0 })));
      if (cfg.mode === 'real') {
        toast(`${addrs.length}개 조명 ${value ? '켜짐' : '꺼짐'}`, 'ok');
      }
    } catch (e) {
      addrs.forEach(a => { state[a] = !value; applyLight(a); });   // 실패 시 되돌림
      refreshUI();
      toast('제어 실패: ' + e.message + ' — 사내망 연결을 확인하세요', 'err');
    }
  }

  const toggle = addr => setLights([addr], !state[addr]);

  /* ---------------- 사이드바 ---------------- */
  const BLOCKS = [
    { key: 'N', name: '북측 블록', rows: ['1열', '2열', '3열'] },
    { key: 'S', name: '남측 블록', rows: ['1열', '2열', '3열'] },
  ];
  const panelEl = document.getElementById('lightPanel');
  BLOCKS.forEach(B => {
    const box = document.createElement('div');
    box.className = 'blk';
    const addrs = D.lights.filter(L => L.block === B.key).map(L => L.addr);
    box.innerHTML = `<div class="bhead"><strong>${B.name}</strong>
      <span><button data-on="1">켜기</button> <button data-on="0">끄기</button></span></div>`;
    box.querySelectorAll('.bhead button').forEach(b => {
      b.onclick = () => setLights(addrs, b.dataset.on === '1');
    });
    B.rows.forEach((rn, ri) => {
      const row = document.createElement('div');
      row.className = 'lrow';
      row.innerHTML = `<span class="rlab">${ri + 1}</span>`;
      D.lights.filter(L => L.block === B.key && L.row === ri)
        .sort((a, b) => a.col - b.col)
        .forEach(L => {
          const b = document.createElement('button');
          b.className = 'lbtn';
          b.dataset.addr = L.addr;
          b.textContent = L.addr;
          b.onclick = () => { selectedAddr = L.addr; toggle(L.addr); };
          row.appendChild(b);
        });
      box.appendChild(row);
    });
    panelEl.appendChild(box);
  });

  document.getElementById('allOn').onclick = () => setLights(D.lights.map(L => L.addr), true);
  document.getElementById('allOff').onclick = () => setLights(D.lights.map(L => L.addr), false);

  const pingBtn = document.getElementById('ping');
  if (pingBtn) pingBtn.onclick = async () => {
    if (cfg.mode === 'sim') return toast('시뮬레이션 모드입니다 — 실제 제어로 바꾸면 확인합니다');
    toast('연결 확인 중…');
    try {
      await send([{ address: D.lights[0].addr, value: state[D.lights[0].addr] ? 1 : 0 }]);
      toast('게이트웨이 응답 정상', 'ok');
    } catch (e) {
      toast('응답 없음: ' + e.message, 'err');
    }
  };

  // 범례
  const legEl = document.getElementById('legend');
  D.labs.forEach(L => {
    const n = D.seats.filter(s => !s.empty && s.lab === L.name).length;
    if (!n) return;
    const d = document.createElement('div');
    d.className = 'leg';
    d.innerHTML = `<span class="sw" style="background:${L.color}"></span>
                   <span>${L.name}</span><span class="ct">${n}명</span>`;
    d.onclick = () => {
      labFilter = (labFilter === L.name) ? null : L.name;
      document.querySelectorAll('.leg').forEach(o => o.classList.toggle('dim',
        labFilter && o !== d));
      seatObjs.forEach(o => {
        const hit = !labFilter || o.data.lab === labFilter;
        o.tile.material.opacity = hit ? 0.9 : 0.12;
      });
    };
    legEl.appendChild(d);
  });

  // 검색
  const q = document.getElementById('q');
  const results = document.getElementById('results');
  q.oninput = () => {
    const v = q.value.trim();
    if (!v) {
      results.innerHTML = '<div class="empty">이름을 입력하면 좌석을 찾아 이동합니다.</div>';
      return;
    }
    const hits = D.seats.filter(s => !s.empty &&
      (s.name.indexOf(v) >= 0 || String(s.addr).indexOf(v) === 0)).slice(0, 30);
    if (!hits.length) { results.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>'; return; }
    results.innerHTML = '';
    hits.forEach(s => {
      const d = document.createElement('div');
      d.className = 'hit';
      d.innerHTML = `<span class="sw" style="background:${s.color}"></span>
        <span class="nm">${s.name}</span><span class="mt">조명 ${s.addr}</span>`;
      d.onclick = () => { focusSeat(s); selectedAddr = s.addr; refreshUI(); };
      results.appendChild(d);
    });
  };

  /* ---------------- 카메라 이동 ---------------- */
  let fly = null;
  function flyTo(p, t, ms) {
    fly = { p0: camera.position.clone(), p1: p, t0: controls.target.clone(), t1: t, k: 0, ms: ms || 900 };
  }
  function focusSeat(s) {
    flyTo(new THREE.Vector3(s.x + 3.2, 5.2, s.z + 5.4), new THREE.Vector3(s.x, 0.8, s.z));
    pulse(s.addr);
  }
  let pulseAddr = null, pulseT = 0;
  function pulse(addr) { pulseAddr = addr; pulseT = 0; }

  const CENTER = new THREE.Vector3((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2);
  const VIEWS = {
    iso: [new THREE.Vector3(CENTER.x - 3, 20, CENTER.z + 24), CENTER.clone()],
    top: [new THREE.Vector3(CENTER.x, 30, CENTER.z + 0.01), CENTER.clone()],
    eye: [new THREE.Vector3(R.x0 + 1.5, 1.65, R.door.z), new THREE.Vector3(CENTER.x, 1.4, R.door.z)],
  };
  function setView(k, btn) {
    flyTo(VIEWS[k][0].clone(), VIEWS[k][1].clone());
    document.querySelectorAll('#vTop,#vIso,#vEye').forEach(b => b.classList.toggle('act', b === btn));
    setCeiling(k === 'eye');      // 탑뷰/조감뷰에서는 천장을 걷어 내부를 본다
  }
  function setCeiling(v) {
    ceil.visible = v;
    document.getElementById('tCeil').classList.toggle('act', v);
  }
  document.getElementById('vTop').onclick = e => setView('top', e.target);
  document.getElementById('vIso').onclick = e => setView('iso', e.target);
  document.getElementById('vEye').onclick = e => setView('eye', e.target);
  document.getElementById('tCeil').onclick = () => setCeiling(!ceil.visible);
  document.getElementById('tName').onclick = e => {
    const v = !e.target.classList.contains('act');
    e.target.classList.toggle('act', v);
    seatObjs.forEach(o => o.group.children.forEach(c => {
      if (c.material && c.material.map && c.geometry.type === 'PlaneGeometry'
          && c !== o.tile) c.visible = v;
    }));
  };

  camera.position.copy(VIEWS.iso[0]);
  controls.target.copy(VIEWS.iso[1]);

  // ?cam=x,y,z,tx,ty,tz — 화면 캡처·시연용 시점 고정
  (function () {
    const a = (new URLSearchParams(location.search).get('cam') || '').split(',').map(Number);
    if (a.length === 6 && a.every(isFinite)) {
      camera.position.set(a[0], a[1], a[2]);
      controls.target.set(a[3], a[4], a[5]);
      controls.update();
    }
  })();

  /* ---------------- 마우스 상호작용 ---------------- */
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const tip = document.getElementById('tip');
  let hovered = null;

  function pickables() {
    const arr = [];
    seatObjs.forEach(o => arr.push(o.tile));
    lightObjs.forEach(o => arr.push(o.lens));
    return arr;
  }

  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(pickables(), false)[0];
    return hit ? hit.object : null;
  }

  renderer.domElement.addEventListener('pointermove', ev => {
    const o = pick(ev);
    hovered = o;
    if (!o) { tip.style.display = 'none'; renderer.domElement.style.cursor = 'grab'; return; }
    renderer.domElement.style.cursor = 'pointer';
    let html;
    if (o.userData.seat) {
      const s = o.userData.seat;
      html = `<b>${s.empty ? '공석' : s.name}</b><br>
              <span class="s">${s.lab}</span><br>
              <span class="l">조명 ${s.addr}</span> · ${state[s.addr] ? '켜짐' : '꺼짐'}`;
    } else {
      const L = o.userData.light;
      const seats = byAddr[L.addr].seats.filter(x => !x.data.empty).map(x => x.data.name);
      html = `<b>조명 ${L.addr}</b><br>
              <span class="s">${L.block === 'N' ? '북측' : '남측'} ${L.row + 1}열</span> ·
              <span class="l">${state[L.addr] ? '켜짐' : '꺼짐'}</span><br>
              <span class="s">담당 ${seats.length}석${seats.length ? ': ' + seats.slice(0, 4).join(', ') : ''}${seats.length > 4 ? ' 외' : ''}</span>`;
    }
    tip.innerHTML = html;
    tip.style.display = 'block';
    const vr = document.getElementById('view').getBoundingClientRect();
    tip.style.left = (ev.clientX - vr.left + 16) + 'px';
    tip.style.top = (ev.clientY - vr.top + 14) + 'px';
  });
  renderer.domElement.addEventListener('pointerleave', () => { tip.style.display = 'none'; });

  let downPos = null;
  renderer.domElement.addEventListener('pointerdown', ev => { downPos = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', ev => {
    if (!downPos) return;
    const moved = Math.hypot(ev.clientX - downPos[0], ev.clientY - downPos[1]);
    downPos = null;
    if (moved > 5) return;                       // 드래그는 회전으로 처리
    const o = pick(ev);
    if (!o) return;
    const addr = o.userData.seat ? o.userData.seat.addr : o.userData.light.addr;
    if (o.userData.seat && !o.userData.seat.empty) setFigTarget(o.userData.seat.name);
    selectedAddr = addr;
    pulse(addr);
    toggle(addr);
  });

  /* ---------------- 피규어 배정 ---------------- */
  const figGrid = document.getElementById('figGrid');
  const figTargetEl = document.getElementById('figTarget');
  let figTarget = null;

  function saveFigMap() {
    try { localStorage.setItem(FIGKEY, JSON.stringify(figMap)); } catch (e) { /* 무시 */ }
  }
  function refreshFigGrid() {
    const used = {};
    Object.keys(figMap).forEach(nm => { used[figMap[nm]] = nm; });
    figGrid.querySelectorAll('img').forEach(im => {
      const id = im.dataset.fig;
      im.classList.toggle('used', !!used[id] && used[id] !== figTarget);
      im.classList.toggle('sel', figTarget && figMap[figTarget] === id);
      im.title = used[id] ? used[id] : '미배정';
    });
  }
  function setFigTarget(name) {
    figTarget = name;
    figTargetEl.textContent = name + ' — 사진을 고르세요';
    figTargetEl.classList.add('on');
    refreshFigGrid();
  }
  function addFigThumb(f) {
    const im = document.createElement('img');
    im.src = f.face; im.dataset.fig = f.id; im.alt = f.id;
    im.onclick = () => {
      if (!figTarget) return toast('먼저 좌석을 클릭해 대상을 고르세요');
      Object.keys(figMap).forEach(nm => { if (figMap[nm] === f.id) delete figMap[nm]; });
      figMap[figTarget] = f.id;
      People.setFigure(figTarget, f);
      saveFigMap(); refreshFigGrid();
      toast(figTarget + ' → ' + f.id + ' 배정', 'ok');
    };
    figGrid.appendChild(im);
    return im;
  }
  (FIGS).forEach(addFigThumb);
  document.getElementById('figClear').onclick = () => {
    if (!figTarget) return toast('먼저 좌석을 클릭하세요');
    delete figMap[figTarget];
    People.setFigure(figTarget, null);
    saveFigMap(); refreshFigGrid();
    toast(figTarget + ' 배정 해제');
  };
  document.getElementById('figExport').onclick = () => {
    const txt = JSON.stringify(figMap, null, 2);
    navigator.clipboard && navigator.clipboard.writeText(txt);
    console.log('FIGURE_MAP =', txt);
    toast(Object.keys(figMap).length + '건 복사됨 (콘솔에도 출력)', 'ok');
  };
  Object.keys(figMap).forEach(nm => {
    const f = (FIGS).find(x => x.id === figMap[nm]);
    if (f) People.setFigure(nm, f);
  });
  refreshFigGrid();

  /* ---------------- 토스트 ---------------- */
  const toastEl = document.getElementById('toast');
  function toast(msg, kind) {
    const d = document.createElement('div');
    d.className = 'msg' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    toastEl.appendChild(d);
    setTimeout(() => {
      d.style.transition = 'opacity .35s'; d.style.opacity = '0';
      setTimeout(() => d.remove(), 360);
    }, 2600);
  }

  /* ---------------- 렌더 루프 ---------------- */
  const rose = document.getElementById('rose');
  const tmp = new THREE.Vector3();
  const clock = new THREE.Clock();
  let lastStat = { seated: -1, gone: -1, moving: -1 };
  const elCache = {};
  function setText(id, v) {
    if (!(id in elCache)) elCache[id] = document.getElementById(id);
    if (elCache[id]) elCache[id].textContent = v;
  }

  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  addEventListener('resize', resize);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    if (fly) {
      fly.k = Math.min(fly.k + dt * 1000 / fly.ms, 1);
      const e = fly.k < 0.5 ? 2 * fly.k * fly.k : 1 - Math.pow(-2 * fly.k + 2, 2) / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (fly.k >= 1) fly = null;
    }

    // 선택 강조 깜빡임
    if (pulseAddr !== null) {
      pulseT += dt;
      const b = byAddr[pulseAddr];
      const k = Math.max(0, 1 - pulseT / 2.2);
      const s = 0.55 + Math.sin(pulseT * 9) * 0.45;
      if (b) b.seats.forEach(o => {
        o.tile.material.emissiveIntensity = state[pulseAddr]
          ? 0.42 + k * s * 0.5 : k * s * 0.55;
      });
      if (pulseT > 2.2) { const a = pulseAddr; pulseAddr = null; applyLight(a); }
    }

    // 호버 강조
    seatObjs.forEach(o => {
      const want = (hovered === o.tile) ? 0.95 : 0.55;
      if (!labFilter || o.data.lab === labFilter) {
        o.tile.material.opacity += (want - o.tile.material.opacity) * 0.25;
      }
    });

    // 인물: 조명이 켜진 자리는 근무, 꺼진 자리는 퇴근
    People.update(Math.min(dt, 0.05), clock.elapsedTime, a => !!state[a]);
    const st = People.stats();
    if (st.seated !== lastStat.seated || st.gone !== lastStat.gone
        || st.moving !== lastStat.moving) {
      setText('sitCount', st.seated);
      setText('moveCount', st.moving);
      setText('goneCount', st.gone);
      lastStat = st;
    }

    controls.update();

    // 나침반
    tmp.copy(controls.target).sub(camera.position);
    const az = Math.atan2(tmp.x, -tmp.z) * 180 / Math.PI;
    rose.setAttribute('transform', `rotate(${(-az).toFixed(2)} 40 40)`);

    renderer.render(scene, camera);
  }

  /* ---------------- 외부 훅 ----------------
     공개판의 좌석 설정 도구(setup.js)가 쓴다. 내부판에서는 호출되지 않는다. */
  window.Room = {
    data: D,
    seats: seatObjs,
    toast: toast,

    /** 좌석 이름을 바꾸고 이름표·피규어 배정을 함께 옮긴다 */
    renameSeat: function (oldName, newName) {
      newName = String(newName || '').trim().slice(0, 12);
      if (!newName || newName === oldName) return false;
      if (seatObjs.some(r => r.data.name === newName)) {
        toast('이미 있는 이름입니다: ' + newName);
        return false;
      }
      const rec = seatObjs.find(r => r.data.name === oldName);
      if (!rec) return false;

      // seatObjs[].data 와 D.seats[], People 내부의 seat 은 모두 같은 객체다.
      // 이름만 바꾸면 인물 쪽에도 그대로 반영되므로 재초기화가 필요 없다.
      rec.data.name = newName;
      if (rec.plate) {
        rec.plate.material.map = plateTexture(newName, rec.data.color);
        rec.plate.material.needsUpdate = true;
      }
      if (figMap[oldName]) {                       // 배정된 사진도 새 이름으로 옮긴다
        figMap[newName] = figMap[oldName];
        delete figMap[oldName];
        saveFigMap();
        const f = FIGS.find(x => x.id === figMap[newName]);
        if (f) People.setFigure(newName, f);
      }
      if (figTarget === oldName) setFigTarget(newName);
      refreshUI();
      return true;
    },

    /** 사용자가 올린 사진을 피규어 목록에 추가한다 */
    addFigure: function (fig) {
      if (!fig || !fig.id || !fig.face) return false;
      if (FIGS.some(f => f.id === fig.id)) return false;
      FIGS.push(fig);
      addFigThumb(fig);
      refreshFigGrid();
      return true;
    },

    listFigures: function () { return FIGS.slice(); },
    getFigMap: function () { return Object.assign({}, figMap); },
  };

  D.lights.forEach(L => applyLight(L.addr));
  refreshUI();
  animate();
  document.getElementById('loading').style.display = 'none';
  toast('3D 사무실 준비 완료 — 조명 30개 · 좌석 72석');
})();
