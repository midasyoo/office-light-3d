/* ============================================================
 * 사무실 인물 피규어 — 착석 근무 / 퇴근 보행 애니메이션
 *
 *  조명 켜짐 : 자리에 앉아 모니터를 보며 고개를 좌우로 돌린다
 *  조명 꺼짐 : 일어나 통로로 나와 중앙 복도를 지나 서측 출입구로 걸어 나간다
 *
 *  app.js 에서 People.init(...) 로 만들고 People.update(dt, isOn) 로 갱신한다.
 * ============================================================ */
window.People = (function () {
  'use strict';

  /* ---------------- 치수 (m) ---------------- */
  const P = {
    headR: 0.29,          // 인형 머리 (바블헤드라 크게)
    torsoW: 0.40, torsoH: 0.44, torsoD: 0.23,
    hipSit: 0.47,         // 앉았을 때 골반 높이 (의자 좌판)
    hipStand: 0.84,       // 섰을 때 골반 높이
    thigh: 0.34, shin: 0.36,
    arm: 0.32,
    speed: 1.9,           // 보행 속도 m/s
    stand: 0.55,          // 이 거리까지는 '일어서는 중'
  };

  const SKIN = 0xf2cba6;

  /* ---------------- 공용 지오메트리 ---------------- */
  const G = {
    head: new THREE.SphereGeometry(P.headR, 14, 12),
    hairTop: new THREE.SphereGeometry(P.headR * 1.04, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.34),
    hairBack: new THREE.SphereGeometry(P.headR * 0.99, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    face: new THREE.PlaneGeometry(P.headR * 1.42, P.headR * 1.42),
    torso: new THREE.BoxGeometry(P.torsoW, P.torsoH, P.torsoD),
    neck: new THREE.CylinderGeometry(0.07, 0.08, 0.10, 8),
    arm: new THREE.BoxGeometry(0.095, P.arm, 0.105),
    thigh: new THREE.BoxGeometry(0.135, P.thigh, 0.155),
    shin: new THREE.BoxGeometry(0.12, P.shin, 0.13),
    shoe: new THREE.BoxGeometry(0.135, 0.075, 0.23),
  };

  const matCache = {};
  function mat(hex) {
    if (!matCache[hex]) matCache[hex] = new THREE.MeshLambertMaterial({ color: hex });
    return matCache[hex];
  }
  const skinMat = mat(SKIN);

  /* ---------------- 얼굴 텍스처 ---------------- */
  const texCache = {};
  const loader = new THREE.TextureLoader();

  function figureFace(uri) {
    if (!texCache[uri]) {
      const t = loader.load(uri);
      t.anisotropy = 4;
      texCache[uri] = t;
    }
    return texCache[uri];
  }

  // 사진이 배정되지 않은 사람은 간단한 얼굴을 그려 쓴다
  function genericFace(seed, glasses) {
    const key = 'gen' + seed + (glasses ? 'g' : '');
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f2cba6';
    g.beginPath(); g.arc(64, 66, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2d25';
    const ey = 62, ex = 19;
    g.beginPath(); g.ellipse(64 - ex, ey, 6, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(64 + ex, ey, 6, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2d25'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64 - ex - 9, ey - 13); g.lineTo(64 - ex + 9, ey - 15); g.stroke();
    g.beginPath(); g.moveTo(64 + ex - 9, ey - 15); g.lineTo(64 + ex + 9, ey - 13); g.stroke();
    g.strokeStyle = '#a8604e'; g.lineWidth = 3;
    g.beginPath(); g.arc(64, 82, 11, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
    if (glasses) {
      g.strokeStyle = 'rgba(40,50,65,.75)'; g.lineWidth = 2.6;
      g.beginPath(); g.arc(64 - ex, ey, 13, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(64 + ex, ey, 13, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(64 - ex + 13, ey); g.lineTo(64 + ex - 13, ey); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    texCache[key] = t;
    return t;
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  const SHIRTS = [0x5b7fb4, 0x8a9ba8, 0x6f7d8c, 0xb0b7bf, 0x7a8b76, 0x9a8f80, 0x4f5b6b, 0xa8b2bd];
  const PANTS = [0x333a45, 0x2b2f38, 0x3f4650, 0x45403c];
  const HAIRS = [0x1b1714, 0x241d18, 0x2f2620, 0x14100e];

  /* ---------------- 인물 1명 ---------------- */
  function build(seat, fig, seed) {
    const root = new THREE.Group();

    const shirt = fig ? new THREE.Color(fig.top).getHex() : SHIRTS[seed % SHIRTS.length];
    const pants = fig ? new THREE.Color(fig.bottom).getHex() : PANTS[(seed >> 3) % PANTS.length];
    const hairC = HAIRS[(seed >> 5) % HAIRS.length];
    const shirtM = mat(shirt), pantsM = mat(pants), hairM = mat(hairC);

    // 골반 -> 상체
    const hip = new THREE.Group();
    root.add(hip);

    const torso = new THREE.Mesh(G.torso, shirtM);
    torso.position.y = P.torsoH / 2;
    hip.add(torso);

    const neck = new THREE.Mesh(G.neck, skinMat);
    neck.position.y = P.torsoH + 0.04;
    hip.add(neck);

    // 머리 (좌우로 돌아간다)
    const head = new THREE.Group();
    head.position.y = P.torsoH + 0.10 + P.headR * 0.72;
    hip.add(head);
    head.add(new THREE.Mesh(G.head, skinMat));
    const hairTop = new THREE.Mesh(G.hairTop, hairM);
    hairTop.position.y = 0.010;
    head.add(hairTop);
    const hairBack = new THREE.Mesh(G.hairBack, hairM);   // 뒤통수 볼륨
    hairBack.position.set(0, 0.004, -P.headR * 0.17);
    head.add(hairBack);
    const face = new THREE.Mesh(G.face, new THREE.MeshBasicMaterial({
      map: fig ? figureFace(fig.face) : genericFace(seed % 4, seed % 3 === 0),
      transparent: true,
    }));
    face.position.z = P.headR * 1.06;     // 머리·머리카락보다 앞에 둔다
    face.position.y = -0.012;
    head.add(face);

    // 팔 (어깨가 회전축)
    function arm(sx) {
      const g = new THREE.Group();
      g.position.set(sx * (P.torsoW / 2 + 0.045), P.torsoH - 0.05, 0);
      const m = new THREE.Mesh(G.arm, shirtM);
      m.position.y = -P.arm / 2;
      g.add(m);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), skinMat);
      hand.position.y = -P.arm - 0.02;
      g.add(hand);
      hip.add(g);
      return g;
    }
    const armL = arm(-1), armR = arm(1);

    // 다리 (골반이 회전축, 무릎에서 한 번 더)
    function leg(sx) {
      const g = new THREE.Group();
      g.position.set(sx * 0.11, 0, 0);
      const th = new THREE.Mesh(G.thigh, pantsM);
      th.position.y = -P.thigh / 2;
      g.add(th);
      const knee = new THREE.Group();
      knee.position.y = -P.thigh;
      g.add(knee);
      const sh = new THREE.Mesh(G.shin, pantsM);
      sh.position.y = -P.shin / 2;
      knee.add(sh);
      const shoe = new THREE.Mesh(G.shoe, mat(0x17171a));
      shoe.position.set(0, -P.shin - 0.03, 0.045);
      knee.add(shoe);
      hip.add(g);
      return { g: g, knee: knee };
    }
    const legL = leg(-1), legR = leg(1);

    return { root: root, hip: hip, head: head, armL: armL, armR: armR,
             legL: legL, legR: legR };
  }

  /* ---------------- 퇴근 경로 ---------------- */
  function buildPath(seat, room, lane) {
    const dir = (seat.col % 2 === 0) ? 1 : -1;      // 책상(중앙 칸막이) 방향
    const deskX = dir * (seat.w / 2 - 0.70 / 2 - 0.04);
    const chairX = seat.x + deskX - dir * 0.62;     // 의자 = 출발점
    const aisleX = seat.x - dir * (seat.w / 2 + 0.55);  // 책상 반대쪽 통로
    const corrZ = room.door.z + lane;               // 중앙 복도 (레인 분산)
    return [
      { x: chairX, z: seat.z },                     // 0 착석
      { x: aisleX, z: seat.z },                     // 1 통로로 나옴
      { x: aisleX, z: corrZ },                      // 2 중앙 복도까지
      { x: room.x0 + 0.6, z: corrZ },               // 3 출입구 앞
      { x: room.x0 - 2.4, z: corrZ },               // 4 퇴장
    ];
  }

  function measure(path) {
    const seg = [];
    let total = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const d = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].z - path[i].z);
      seg.push(d); total += d;
    }
    return { seg: seg, total: total };
  }

  function pointAt(path, seg, s) {
    let d = s;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) {
        const k = seg[i] < 1e-6 ? 0 : Math.min(d / seg[i], 1);
        const a = path[i], b = path[i + 1];
        return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k,
                 fx: b.x - a.x, fz: b.z - a.z };
      }
      d -= seg[i];
    }
    const a = path[path.length - 2], b = path[path.length - 1];
    return { x: b.x, z: b.z, fx: b.x - a.x, fz: b.z - a.z };
  }

  /* ---------------- 공개 API ---------------- */
  const people = [];

  function init(scene, seats, room, figMap, figures) {
    const byId = {};
    (figures || []).forEach(f => { byId[f.id] = f; });

    seats.filter(s => !s.empty).forEach((seat, i) => {
      const seed = hash(seat.name);
      const fig = byId[(figMap || {})[seat.name]] || null;
      const body = build(seat, fig, seed);
      scene.add(body.root);

      const lane = ((i % 9) - 4) * 0.30;      // 복도를 9개 레인으로 나눠 겹침 완화
      const path = buildPath(seat, room, lane);
      const m = measure(path);
      const dir = (seat.col % 2 === 0) ? 1 : -1;

      people.push({
        seat: seat, body: body, path: path, seg: m.seg, total: m.total,
        s: 0, dir: dir, mv: 1, phase: (seed % 628) / 100, delay: (seed % 23) * 0.16,
        sp: 0.82 + ((seed >> 7) % 40) / 100,   // 걸음 속도 편차
        wait: 0, fig: fig, figId: fig ? fig.id : null,
      });
    });
    return people;
  }

  function setFigure(name, fig) {
    people.forEach(p => {
      if (p.seat.name !== name) return;
      p.fig = fig; p.figId = fig ? fig.id : null;
      const seed = hash(name);
      const face = p.body.head.children[3];
      face.material.map = fig ? figureFace(fig.face)
                              : genericFace(seed % 4, seed % 3 === 0);
      face.material.needsUpdate = true;
      const shirt = fig ? new THREE.Color(fig.top).getHex() : SHIRTS[seed % SHIRTS.length];
      p.body.hip.children[0].material = mat(shirt);
    });
  }

  /* 매 프레임 갱신. isOn(addr) 가 true 면 착석 근무, false 면 퇴근 */
  function update(dt, t, isOn) {
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      const on = isOn(p.seat.addr);
      const target = on ? 0 : p.total;

      // 출발 지연 — 모두 한꺼번에 움직이지 않도록
      let mv = 0;
      if (Math.abs(p.s - target) > 1e-4) {
        p.wait += dt;
        if (p.wait > p.delay) {
          mv = target > p.s ? 1 : -1;
          const step = P.speed * p.sp * dt;
          p.s += mv * Math.min(step, Math.abs(target - p.s));
          p.mv = mv;                 // 진행 방향 기억 (복귀 시 -1)
        }
      } else {
        p.wait = 0;
      }

      const b = p.body;
      const seated = p.s < 1e-4;
      const rise = Math.min(p.s / P.stand, 1);        // 0 앉음 → 1 섬

      const pt = pointAt(p.path, p.seg, p.s);
      b.root.position.set(pt.x, 0, pt.z);

      if (seated) {
        // 책상(모니터) 쪽을 향해 앉는다
        b.root.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        // 경로 접선에 진행 방향을 곱해 항상 가는 쪽을 본다
        const fx = pt.fx * p.mv, fz = pt.fz * p.mv;
        const L = Math.hypot(fx, fz) || 1;
        const want = Math.atan2(fx / L, fz / L);
        let d = want - b.root.rotation.y;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        b.root.rotation.y += d * Math.min(dt * 6, 1);
      }

      // 골반 높이: 앉음 → 섬
      const hipY = P.hipSit + (P.hipStand - P.hipSit) * rise;
      const walk = rise > 0.95 && mv !== 0;
      b.hip.position.y = hipY + (walk ? Math.abs(Math.sin(t * 7 + p.phase)) * 0.025 : 0);

      if (rise < 1) {
        // 앉은 자세: 허벅지 수평, 정강이 수직
        const th = -Math.PI / 2 * (1 - rise);
        b.legL.g.rotation.x = th; b.legR.g.rotation.x = th;
        b.legL.knee.rotation.x = -th; b.legR.knee.rotation.x = -th;
      } else {
        const sw = walk ? Math.sin(t * 7 + p.phase) * 0.55 : 0;
        b.legL.g.rotation.x = sw; b.legR.g.rotation.x = -sw;
        b.legL.knee.rotation.x = Math.max(0, -sw) * 0.7;
        b.legR.knee.rotation.x = Math.max(0, sw) * 0.7;
      }

      if (seated) {
        // 근무 중: 모니터를 보며 고개를 좌우로, 손은 자판 위
        b.head.rotation.y = Math.sin(t * 0.55 + p.phase) * 0.45;
        b.head.rotation.x = Math.sin(t * 0.9 + p.phase) * 0.05 + 0.06;
        const typ = Math.sin(t * 7 + p.phase) * 0.05;
        b.armL.rotation.x = -1.15 + typ;
        b.armR.rotation.x = -1.15 - typ;
        b.armL.rotation.z = 0.18; b.armR.rotation.z = -0.18;
      } else {
        b.head.rotation.y *= 0.9;
        b.head.rotation.x *= 0.9;
        const sw = walk ? Math.sin(t * 7 + p.phase) * 0.42 : 0;
        b.armL.rotation.x = -sw; b.armR.rotation.x = sw;
        b.armL.rotation.z = 0.10; b.armR.rotation.z = -0.10;
      }

      // 출입구를 벗어나면 숨긴다
      const out = p.s > p.total - 1.8;
      b.root.visible = !out || p.s < p.total - 0.05;
      if (out) {
        const k = Math.max(0, 1 - (p.s - (p.total - 1.8)) / 1.8);
        b.root.scale.setScalar(0.35 + 0.65 * k);
      } else if (b.root.scale.x !== 1) {
        b.root.scale.setScalar(1);
      }
    }
  }

  function stats() {
    let seated = 0, moving = 0, gone = 0;
    people.forEach(p => {
      if (p.s < 1e-4) seated++;
      else if (p.s >= p.total - 1e-4) gone++;
      else moving++;
    });
    return { seated: seated, moving: moving, gone: gone, total: people.length };
  }

  return { init: init, update: update, setFigure: setFigure, stats: stats,
           list: people };
})();
