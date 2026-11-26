// 定制桌宠 · 手机版前端

// ---------- 角色（形象） ----------
const CHARS = [
  { id: 'loop', name: '小人物', frames: true },
  { id: 'duo',  name: '双子',   frames: false, src: 'duo.png' },
  { id: 'a',    name: '黑发',   frames: false, src: 'char_a.png' },
  { id: 'b',    name: '粉毛',   frames: false, src: 'char_b.png' }
];
let charIdx = 0;
(function initChar() {
  try {
    const v = parseInt(localStorage.getItem('pet.char') || '0', 10);
    if (!isNaN(v) && v >= 0 && v < CHARS.length) charIdx = v;
  } catch (e) {}
})();
function curChar() { return CHARS[charIdx] || CHARS[0]; }

const FRAME_COUNT = 26;
const FPS = 20;
const SPACING = 'pet_';

const pet = document.getElementById('pet');
const fx = document.getElementById('fx');
const ctx = fx.getContext('2d');


// ---------- 角色选择面板 ----------
const picker = document.getElementById('picker');
const pickerList = document.getElementById('pickerList');

function renderPicker() {
  if (!pickerList) return;
  pickerList.innerHTML = '';
  CHARS.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'picker-item' + (i === charIdx ? ' on' : '');
    const dot = document.createElement('span');
    dot.className = 'dot';
    const name = document.createElement('span');
    name.textContent = c.name;
    row.appendChild(dot);
    row.appendChild(name);
    row.addEventListener('click', (ev) => {
      ev.stopPropagation();
      selectChar(i);
    });
    pickerList.appendChild(row);
  });
}

function openPicker() {
  if (!picker) return;
  renderPicker();
  picker.classList.remove('hidden');
  if (bridge && bridge.log) { try { bridge.log('打开角色面板'); } catch (e) {} }
}

function closePicker() {
  if (picker) picker.classList.add('hidden');
}

function isPickerOpen() {
  return picker && !picker.classList.contains('hidden');
}

function selectChar(i) {
  if (i === charIdx) { closePicker(); return; }
  charIdx = i;
  try { localStorage.setItem('pet.char', String(charIdx)); } catch (e) {}
  frames = [];
  idx = 0;
  pet.classList.remove('breathe');
  loadFrames().then(() => {
    pet.src = frames[0] ? frames[0].src : '';
    startAnim();
    spawnBubble('换成了' + curChar().name);
    if (curChar().id === 'duo') setTimeout(() => startDuoIntro(), 260);
    closePicker();
  });
}

// 点面板外面就收起
document.addEventListener('touchstart', (e) => {
  if (!isPickerOpen()) return;
  if (picker.contains(e.target)) return;
  if (e.target === pet) return;
  closePicker();
}, { passive: true });

// ---------- 台词库：按心情分组，随机且不连着重复 ----------
const DIALOG = {
  greetMorning: ['早上好呀', '新的一天', '吃过早饭了吗', '今天也要好好过'],
  greetNoon: ['中午啦', '记得吃饭', '午休一下嘛', '别空着肚子'],
  greetEvening: ['晚上好', '今天辛苦了', '回家了嘛', '该放松一下了'],
  greetNight: ['这么晚还不睡', '快去睡觉', '夜深了…', '陪你一会儿就睡'],

  calm: ['在呢', '嗯？', '怎么了', '摸摸头', '我在这儿', '今天怎么样', '有点安静呀', '歇会儿吧'],
  happy: ['嘿嘿', '开心！', '再来一次', '好耶', '今天心情不错', '陪你玩', '最喜欢你了'],
  sleepy: ['困…', '眼皮好重', '想睡一会儿', '打个小盹', 'hmm…'],
  hungry: ['有点饿', '想吃饼干', '什么时候吃饭', '肚子叫了'],
  shy: ['别戳啦', '痒痒的', '害羞…', '轻一点嘛', '讨厌啦'],
  typing: ['加油！', '手速不错', '别累着', '记得喝水', '眼睛休息一下'],
  rain: ['外面在下雨', '记得带伞', '雨声好好听', '地面滑，小心点', '淋湿要感冒的', '雨天适合待在屋里'],
  cling: ['我在这儿', '靠着边看看', '探个头', '就趴一会儿'],
};

const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
let mood = { name: 'calm', until: 0 };
let raining = false;
let weatherAt = 0;
const lastPick = {};

function pickLine(group) {
  const arr = DIALOG[group] || DIALOG.calm;
  let i = Math.floor(Math.random() * arr.length);
  if (arr.length > 1 && i === lastPick[group]) i = (i + 1) % arr.length;
  lastPick[group] = i;
  return arr[i];
}

function setMood(name, holdMs) {
  mood = { name, until: Date.now() + holdMs };
}

function currentGroup() {
  if (peekSide) return 'cling';
  if (Date.now() < mood.until) return mood.name;
  return 'calm';
}

function randomLine() {
  if (raining && Math.random() < 0.35) return pickLine('rain');
  return pickLine(currentGroup());
}

function dailyGreeting() {
  const d = new Date();
  const key = d.toDateString();
  let last = null;
  try { last = localStorage.getItem('pet.greet'); } catch (e) {}
  if (last === key) return;
  try { localStorage.setItem('pet.greet', key); } catch (e) {}
  const h = d.getHours();
  const g = h < 5 ? 'greetNight' : h < 11 ? 'greetMorning' : h < 14 ? 'greetNoon'
          : h < 19 ? 'greetEvening' : 'greetNight';
  setTimeout(() => spawnBubble(pickLine(g)), 900);
}

// 天气：先按 IP 定位，再查 open-meteo 的天气代码，判断是否在下雨
async function refreshWeather() {
  if (Date.now() - weatherAt < 30 * 60 * 1000) return;
  weatherAt = Date.now();
  try {
    const loc = await fetch('https://ipwho.is/').then((r) => r.json());
    if (!loc || loc.success === false || !loc.latitude) return;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.latitude +
                '&longitude=' + loc.longitude + '&current=weather_code';
    const w = await fetch(url).then((r) => r.json());
    const code = w && w.current && w.current.weather_code;
    const wasRain = raining;
    raining = RAIN_CODES.indexOf(code) >= 0;
    if (raining && !wasRain) setTimeout(() => spawnBubble(pickLine('rain')), 1600);
  } catch (e) { /* 没网就算了 */ }
}



let frames = [];
let idx = 0;
let dpr = Math.min(window.devicePixelRatio || 1, 3);

// ---------- 帧加载 ----------
function framePath(i) {
  return `frames/pet_${String(i).padStart(2, '0')}.png`;
}

function loadFrames() {
  const ch = curChar();
  pet.classList.toggle('duo', ch.id === 'duo');
  if (bridge && bridge.setDual) { try { bridge.setDual(ch.id === 'duo'); } catch (e) {} }
  if (!ch.frames) {
    // 单张立绘：一张图就是一个"帧"，不再逐帧播放
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = im.onerror = () => resolve();
      im.src = ch.src;
      frames = [im];
      resolve();
    });
  }
  return new Promise((resolve) => {
    let done = 0;
    for (let i = 1; i <= FRAME_COUNT; i++) {
      const im = new Image();
      im.onload = im.onerror = () => {
        if (++done === FRAME_COUNT) resolve();
      };
      im.src = framePath(i);
      frames[i - 1] = im;
    }
  });
}

function nextChar() {
  charIdx = (charIdx + 1) % CHARS.length;
  try { localStorage.setItem('pet.char', String(charIdx)); } catch (e) {}
  frames = [];
  idx = 0;
  pet.classList.remove('breathe');
  spawnBubble('换成了' + curChar().name);
  loadFrames().then(() => {
    pet.src = frames[0] ? frames[0].src : '';
    startAnim();
    if (curChar().id === 'duo') setTimeout(() => startDuoIntro(), 260);
  });
}

function startAnim() {
  if (!curChar().frames) {
    const f = frames[0];
    if (f) pet.src = f.src;
    pet.classList.add('breathe');
    return;
  }
  pet.classList.remove('breathe');
  const tick = () => {
    idx = (idx + 1) % FRAME_COUNT;
    const f = frames[idx];
    if (f && f.complete) pet.src = f.src;
    setTimeout(tick, 1000 / FPS);
  };
  tick();
}

// ---------- 气泡 ----------
const BUBBLES = [];
let lastFrameAt = 0;
const LIFE = 1100;

function resizeFx() {
  const w = fx.clientWidth || window.innerWidth;
  const h = fx.clientHeight || window.innerHeight;
  fx.width = Math.round(w * dpr);
  fx.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// 气泡样式：半透明白底 + 圆角 + 下侧小三角，指向她的头
const BUBBLE_FONT = '600 13px "Microsoft YaHei", "PingFang SC", sans-serif';
const BUBBLE_PADX = 9, BUBBLE_PADY = 5, BUBBLE_R = 10;
const BUBBLE_TAIL = 5, BUBBLE_GAP = 6;      // 站立时：气泡底边与头顶的空隙
const BUBBLE_SIDE_GAP = 9;                  // 贴角时：气泡与她的水平间隙

function measureBubbleText(text) {
  ctx.save();
  ctx.font = BUBBLE_FONT;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

function spawnBubble(text) {
  const p = pet.getBoundingClientRect();
  const tw = measureBubbleText(text);
  const w = Math.max(34, Math.round(tw) + BUBBLE_PADX * 2);
  const h = 13 + BUBBLE_PADY * 2;
  const b = { text, w, h, t0: performance.now() };

  if (peekSide && peekAnchor) {
    // 贴角时：气泡从她靠屏幕内的那一侧冒出，小三角朝她
    if (peekSide > 0) {
      b.tail = 'right';                       // 她在右边 → 气泡在她左侧，三角在右
      b.cx = peekAnchor.x - BUBBLE_SIDE_GAP - w / 2;
    } else {
      b.tail = 'left';                        // 她在左边 → 气泡在她右侧，三角在左
      b.cx = peekAnchor.x + BUBBLE_SIDE_GAP + w / 2;
    }
    b.cy = peekAnchor.y;
  } else {
    const ax = p.left + p.width / 2;
    const jitter = (Math.random() - 0.5) * Math.min(64, p.width * 0.3);
    b.tail = 'bottom';
    b.ax = ax;
    b.cx = ax + jitter;
    b.bottomY = p.top + p.height * 0.06 - BUBBLE_GAP;
    b.cy = 0;
  }

  BUBBLES.push(b);
  if (BUBBLES.length > 4) BUBBLES.shift();
}


// ---------- 新互动：摸摸头 / 喂食 / 扔小球 ----------
const PROPS = [];
let headTaps = [];

function petRect() {
  return pet.getBoundingClientRect();
}

function addFood() {
  const r = petRect();
  PROPS.push({
    kind: 'food',
    x: r.left + r.width / 2,
    y: r.top - 26,
    vy: 0,
    ty: r.top + r.height * 0.9,
    t0: performance.now(),
    landAt: 0
  });
  if (PROPS.length > 6) PROPS.shift();
}

function addBall(dir) {
  const r = petRect();
  PROPS.push({
    kind: 'ball',
    x: r.left + r.width / 2,
    y: r.top + r.height * 0.5,
    vx: (dir >= 0 ? 1 : -1) * (3.0 + Math.random() * 1.4),
    vy: -3.4,
    t0: performance.now()
  });
  if (PROPS.length > 6) PROPS.shift();
}

// 摸摸头：1.2s 内连点头顶三次
function patHead() {
  headTaps = [];
  react('shy', 760);
  spawnBubble('好舒服～');
  setTimeout(() => spawnBubble('♥'), 260);
  playSound('head');
}

// 喂食：掉一块饼干，落到脚边再"吃掉"
function feed() {
  addFood();
  spawnBubble('吃饼干～');
  setMood('happy', 90000);
  playSound('body');
  setTimeout(() => {
    react('wiggle', 420);
    spawnBubble('好吃！');
  }, 900);
}

// 扔小球：往甩动方向飞出去，落地弹两下再滚回来
function throwBall(dir) {
  addBall(dir);
  react('hop', 470);
  spawnBubble('球！');
  playSound('body');
}


// ---------- 双子小动作：推眼镜 / 玩丝线 ----------
let duoFx = null;          // {kind, t0, dur}
let lastDuoFxAt = 0;
let duoFxPending = false;

function startDuoFx(kind) {
  duoFx = { kind, t0: performance.now(), dur: kind === 'glasses' ? 1500 : 2400 };
  lastDuoFxAt = performance.now();
}

function maybeDuoFx(now) {
  if (curChar().id !== 'duo') return;
  if (duoFx) {
    if (now - duoFx.t0 > duoFx.dur) duoFx = null;
    return;
  }
  if (now - lastDuoFxAt < 11000) return;
  const pickKind = Math.random() < 0.5 ? 'glasses' : 'thread';
  startDuoFx(pickKind);
}

function drawDuoFx(now) {
  if (!duoFx || !pet.src) return;
  const r = pet.getBoundingClientRect();
  const p = (now - duoFx.t0) / duoFx.dur;
  if (p < 0 || p > 1) return;
  ctx.save();
  ctx.globalAlpha = 1;

  if (duoFx.kind === 'glasses') {
    // 左边黑发推眼镜：镜片位置一道上扬反光 + 头顶小感叹
    const gx = r.left + r.width * 0.255;
    const gy = r.top + r.height * 0.325;
    const k = Math.min(1, Math.max(0, (p - 0.15) / 0.45));
    ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2.4, r.width * 0.011);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const ox = gx + (i - 0.5) * r.width * 0.115;
      ctx.beginPath();
      ctx.moveTo(ox - r.width * 0.028, gy + r.height * 0.028 - k * r.height * 0.02);
      ctx.lineTo(ox + r.width * 0.028, gy - r.height * 0.028 - k * r.height * 0.02);
      ctx.stroke();
    }
    // 上方小亮点
    ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.85;
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(gx + r.width * 0.09, gy - r.height * 0.13, Math.max(2.6, r.width * 0.013), 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 右边粉毛玩丝线：从手边拉出一条波动的线 + 末端小珠
    const hx = r.left + r.width * 0.655;
    const hy = r.top + r.height * 0.63;
    const len = r.height * 0.30;
    const ph = p * Math.PI * 2.6;
    ctx.globalAlpha = Math.min(1, Math.sin(Math.min(1, p) * Math.PI) * 1.4);
    ctx.strokeStyle = 'rgba(240, 214, 190, 0.95)';
    ctx.lineWidth = Math.max(1.6, r.width * 0.0065);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    for (let i = 1; i <= 18; i++) {
      const t = i / 18;
      const x = hx + Math.sin(ph + t * 4.2) * (r.width * 0.045) * t + t * r.width * 0.02;
      const y = hy - t * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 246, 216, 0.95)';
    ctx.beginPath();
    ctx.arc(hx + Math.sin(ph + 4.2) * (r.width * 0.045) + r.width * 0.02,
            hy - len, Math.max(2.2, r.width * 0.011), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawExtras(now, dt) {
  maybeDuoFx(now);
  drawDuoFx(now);
  for (let i = PROPS.length - 1; i >= 0; i--) {
    const o = PROPS[i];
    const age = now - o.t0;

    if (o.kind === 'food') {
      if (o.grabbed) {
        // 被拎在手里：不落、不淡出，跟手走
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(1.08, 1.08);
        ctx.fillStyle = '#d29a55';
        ctx.strokeStyle = '#8a5a2b';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#6b3f1d';
        [[-3.6, -2.4], [3.2, -1.2], [0.4, 3.4], [-1.8, 1.8], [4.2, 3.0]].forEach(function (c) {
          ctx.beginPath();
          ctx.arc(c[0], c[1], 1.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
        continue;
      }
      if (!o.landAt) {
        o.vy += 0.55 * dt;
        o.y += o.vy * dt;
        if (o.y >= o.ty) { o.y = o.ty; o.landAt = now; }
      }
      const after = o.landAt ? now - o.landAt : 0;
      if (after > 1100) { PROPS.splice(i, 1); continue; }
      const sc = after > 700 ? Math.max(0, 1 - (after - 700) / 400) : 1;
      ctx.save();
      ctx.globalAlpha = sc;
      ctx.translate(o.x, o.y);
      ctx.scale(sc, sc);
      ctx.fillStyle = '#d29a55';
      ctx.strokeStyle = '#8a5a2b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6b3f1d';
      [[-3.6, -2.4], [3.2, -1.2], [0.4, 3.4], [-1.8, 1.8], [4.2, 3.0]].forEach(function (c) {
        ctx.beginPath();
        ctx.arc(c[0], c[1], 1.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    } else {
      // 小球：重力 + 落地反弹 + 两侧反弹
      o.vy += 0.42 * dt;
      o.x += o.vx * dt * 2.2;
      o.y += o.vy * dt;
      const w = fx.clientWidth || window.innerWidth;
      const h = fx.clientHeight || window.innerHeight;
      const floor = h - 14;
      if (o.y > floor) {
        o.y = floor;
        o.vy = -Math.abs(o.vy) * 0.55;
        o.vx *= 0.86;
        if (Math.abs(o.vy) < 0.6) o.vy = 0;
      }
      if (o.x < 12) { o.x = 12; o.vx = Math.abs(o.vx) * 0.8; }
      if (o.x > w - 12) { o.x = w - 12; o.vx = -Math.abs(o.vx) * 0.8; }
      if (age > 2600) { PROPS.splice(i, 1); continue; }
      const fade = age > 2100 ? Math.max(0, 1 - (age - 2100) / 500) : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(o.x, o.y);
      ctx.fillStyle = '#c66b3d';
      ctx.strokeStyle = '#2b2620';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, -0.9, 0.9);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawBubbles(now) {
  const w = fx.clientWidth || window.innerWidth;
  const h = fx.clientHeight || window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  // 双子入场组合动画 / 插腰站姿互动：画布优先画（气泡叠在它上面），跳过伞/探头/小动作
  if (duoIntro) {
    drawDuoIntro(now);
  } else if (duoPose) {
    drawDuoPose(now);
  }
  for (let i = BUBBLES.length - 1; i >= 0; i--) {
    const b = BUBBLES[i];
    const t = (now - b.t0) / LIFE;
    if (t >= 1) { BUBBLES.splice(i, 1); continue; }
    const rise = 12 * t;
    const alpha = t < 0.62 ? 1 : 1 - (t - 0.62) / 0.38;

    let bx = b.cx - b.w / 2;
    if (bx < 4) bx = 4;
    if (bx + b.w > w - 4) bx = w - 4 - b.w;

    let by;
    if (b.tail === 'bottom') {
      by = b.bottomY - b.h - rise;
      if (by < 6) by = 6;
    } else {
      by = b.cy - b.h / 2;
      if (by < 6) by = 6;
      if (by + b.h > h - 6) by = h - 6 - b.h;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    // 半透明白底 + 柔和投影（不描边）
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.shadowColor = 'rgba(20,24,30,0.16)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, bx, by, b.w, b.h, BUBBLE_R);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 小三角：站立时朝下、贴右角时朝右、贴左角时朝左
    ctx.beginPath();
    if (b.tail === 'bottom') {
      const tx = Math.min(Math.max(b.ax - bx, BUBBLE_R + 5), b.w - BUBBLE_R - 5);
      ctx.moveTo(bx + tx - 5, by + b.h - 1);
      ctx.lineTo(bx + tx + 5, by + b.h - 1);
      ctx.lineTo(bx + tx, by + b.h + BUBBLE_TAIL);
    } else if (b.tail === 'right') {
      const ty = by + b.h / 2;
      ctx.moveTo(bx + b.w - 1, ty - 5);
      ctx.lineTo(bx + b.w - 1, ty + 5);
      ctx.lineTo(bx + b.w + BUBBLE_TAIL, ty);
    } else {
      const ty = by + b.h / 2;
      ctx.moveTo(bx + 1, ty - 5);
      ctx.lineTo(bx + 1, ty + 5);
      ctx.lineTo(bx - BUBBLE_TAIL, ty);
    }
    ctx.closePath();
    ctx.fill();

    // 深色字
    ctx.fillStyle = '#23272d';
    ctx.font = BUBBLE_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, bx + b.w / 2, by + b.h / 2 + 0.5);
    ctx.restore();
  }
  const __now = now;
  if (!duoIntro && !duoPose) {
    // 双子入场组合动画 / 插腰站姿互动期间跳过这些 canvas 绘制，避免打架
    drawChute(__now);
    drawPeek(__now);
    if (lastFrameAt) drawExtras(__now, Math.min(3, (__now - lastFrameAt) / 16.7));
  }
  lastFrameAt = __now;
  requestAnimationFrame(drawBubbles);
}

// ---------- 音效 ----------
let audioCtx = null;
let samples = [];
let cursor = 0;

async function initSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    // file:// 页面上 fetch() 会被 CORS 拦掉（origin=null），
    // 所以优先让 Java 把 wav 字节读出来，前端只做 base64 解码。
    if (bridge && bridge.soundB64) {
      for (let i = 1; i <= 3; i++) {
        const b64 = bridge.soundB64(i);
        if (!b64) continue;
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        samples.push(await audioCtx.decodeAudioData(arr.buffer));
      }
    }
    if (samples.length) return;

    const files = ['sfx/duck1.wav', 'sfx/duck2.wav', 'sfx/duck3.wav'];
    for (const f of files) {
      const r = await fetch(f);
      const buf = await r.arrayBuffer();
      samples.push(await audioCtx.decodeAudioData(buf));
    }
  } catch (e) {
    samples = [];
  }
}

// 音效总开关：这一轮先全部静音（含落地那声小黄鸭），以后想开改回 true
const SOUND_ENABLED = false;

function playSound(zone) {
  if (!SOUND_ENABLED) return;
  if (!audioCtx || !samples.length) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const src = audioCtx.createBufferSource();
  src.buffer = samples[cursor++ % samples.length];
  src.playbackRate.value = zone === 'head' ? 1.14 : zone === 'legs' ? 0.92 : 1.0;
  const gain = audioCtx.createGain();
  gain.gain.value = zone === 'head' ? 0.4 : zone === 'legs' ? 0.5 : 0.45;
  src.connect(gain).connect(audioCtx.destination);
  src.start();
}


// ---------- 伞降（参考视频：橘色小伞慢慢飘下来）----------
let chute = null;
// 贴边探头：0 正常，-1 贴左，1 贴右
let peekSide = 0;
const CHUTE_DUR = 4400;

function startParachute() {
  if (chute || !bridge) return;
  pet.classList.remove('hop', 'wiggle', 'shy');
  chute = { t0: performance.now(), dur: CHUTE_DUR, done: 0 };
  spawnBubble('跳伞～');
  playSound('head');
}

function drawChute(now) {
  if (!chute) return;
  const h = fx.clientHeight || window.innerHeight;
  const p = Math.min(1, (now - chute.t0) / chute.dur);
  if (!chute.done && p >= 1) chute.done = now;
  const fold = chute.done ? Math.min(1, (now - chute.done) / 300) : 0;

  const ease = 1 - Math.pow(1 - p, 1.75);        // 先快后慢，像被伞拽着
  const dy = -(1 - ease) * h * 0.62;
  const sway = Math.sin(p * Math.PI * 4.6) * 5;  // 左右轻摆
  const sc = chute.done ? 1 : 0.74 + 0.26 * ease;

  pet.style.transformOrigin = '50% 90%';
  pet.style.transform =
    'translate(' + (sway * 0.5).toFixed(2) + 'px,' + dy.toFixed(2) + 'px) ' +
    'rotate(' + (sway * 0.55).toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';

  const r = pet.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cw = r.width * (1.06 - 0.5 * fold);
  const canopyY = r.top - r.height * (0.05 + 0.12 * fold);

  ctx.save();
  ctx.globalAlpha = 1 - fold;

  // 伞绳
  ctx.strokeStyle = 'rgba(120,84,44,0.7)';
  ctx.lineWidth = 1.1;
  [-0.42, -0.14, 0.14, 0.42].forEach(function (k) {
    ctx.beginPath();
    ctx.moveTo(cx + cw * k, canopyY - cw * 0.02);
    ctx.lineTo(cx + r.width * 0.2 * k, r.top + r.height * 0.05);
    ctx.stroke();
  });

  // 伞面（上半椭圆 + 橘色渐变）
  const g = ctx.createLinearGradient(cx - cw / 2, canopyY - cw * 0.5, cx + cw / 2, canopyY);
  g.addColorStop(0, '#f8bb52');
  g.addColorStop(1, '#e07c22');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#a8551a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, canopyY, cw / 2, cw * 0.46, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 伞面分块线
  ctx.strokeStyle = 'rgba(168,85,26,0.5)';
  ctx.lineWidth = 1;
  [-0.6, -0.3, 0, 0.3, 0.6].forEach(function (k) {
    ctx.beginPath();
    ctx.moveTo(cx, canopyY);
    ctx.quadraticCurveTo(cx + cw * k * 0.5, canopyY - cw * 0.34, cx + cw * k * 0.5, canopyY - cw * 0.42);
    ctx.stroke();
  });

  // 下缘小波浪
  ctx.strokeStyle = '#a8551a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let k = -0.45; k <= 0.45; k += 0.15) {
    const bx = cx + cw * k;
    ctx.moveTo(bx, canopyY);
    ctx.quadraticCurveTo(bx + cw * 0.075, canopyY + cw * 0.07, bx + cw * 0.15, canopyY);
  }
  ctx.stroke();
  ctx.restore();

  if (chute.done && fold >= 1) {
    chute = null;
    pet.style.transform = '';
    pet.style.transformOrigin = '';
    react('hop', 470);
    spawnBubble('安全着陆！');
    playSound('legs');
  }
}


// ---------- 贴边探头 ----------
// 参考 shimeji-ee / MomoDesktopPet 的做法：贴边时不复用站立帧，
// 而是只露出「头 + 一只手」这一小块，并且有探出去再缩回来的循环。
let peekT0 = 0;


// 帧四周有透明留白，贴边时如果按图片框对齐，就会在屏幕边和她之间留一条空白，
// 看起来像被切掉一块。这里量出每帧真正的不透明区域，按内容对齐。
function contentBox(img) {
  if (img.__box) return img.__box;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = nw; cv.height = nh;
  const c2 = cv.getContext('2d', { willReadFrequently: true });
  c2.drawImage(img, 0, 0);
  let x0 = nw, y0 = nh, x1 = 0, y1 = 0;
  try {
    const d = c2.getImageData(0, 0, nw, nh).data;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        if (d[(y * nw + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  } catch (e) { /* 取不到就退回整帧 */ }
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = nw - 1; y1 = nh - 1; }
  img.__box = { x0, y0, x1, y1, nw, nh };
  return img.__box;
}

function drawPeek(now) {
  if (!peekSide) return;
  const img = frames[idx];
  if (!img || !img.complete || !img.naturalWidth) return;
  if (!peekT0) peekT0 = now;

  const w = fx.clientWidth || window.innerWidth;
  const h = fx.clientHeight || window.innerHeight;
  const scrW = (window.screen && window.screen.width) || 360;

  // 参考图的姿势：不旋转、不裁切，正着贴屏幕边缘，
  // 一部分身子留在屏幕外，屏幕边缘自然竖切一条线（和微信那只看门兔一样）
  const dw = Math.min(scrW * 0.44, w * 0.92);
  const dh = dw * (img.naturalHeight / img.naturalWidth);

  // 照参考图：整只趴着不动，露出六成，外侧四成在屏幕外
  const vis = 0.6;
  const bob = 0;

  // 按「真正有画面的区域」对齐，避免帧自带透明留白在屏幕边留下空白
  const box = contentBox(img);
  const kx = dw / box.nw;          // 帧像素 → 画布像素
  const ky = dh / box.nh;
  const cw = (box.x1 - box.x0 + 1) * kx;   // 她本人的宽度
  const ch = (box.y1 - box.y0 + 1) * ky;   // 她本人的高度

  let baseX;
  if (peekSide > 0) {
    // 贴右角：她本人右侧 40% 出屏，屏幕里只剩左侧 60%
    const contentRight = w + (cw * (1 - vis));
    baseX = contentRight - (box.x1 + 1) * kx;
  } else {
    // 贴左角：她本人左侧 40% 出屏
    const contentLeft = -cw * (1 - vis);
    baseX = contentLeft - box.x0 * kx;
  }

  let baseY;
  if (peekCorner < 0) baseY = 4 - box.y0 * ky;
  else if (peekCorner > 0) baseY = h - 4 - (box.y1 + 1) * ky;
  else baseY = (h - ch) / 2 - box.y0 * ky;

  // 她露在屏幕内的那半边的中心，气泡按这个点定位
  peekAnchor = {
    x: peekSide > 0 ? w - (dw * vis) / 2 : (dw * vis) / 2,
    y: baseY + dh * 0.26 + bob,
  };

  ctx.save();
  // 轻微朝屏幕内倾一下，像探身
  const tilt = (peekSide > 0 ? -1 : 1) * 3 * Math.PI / 180;   // 固定朝屏幕内倾 3°
  ctx.translate(baseX + dw / 2, baseY + dh / 2 + bob);
  ctx.rotate(tilt);
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

// ---------- 交互 ----------
const ANIM_CLASSES = ['hop', 'wiggle', 'shy', 'spin', 'turns', 'enjoy', 'chew'];

function react(cls, ms) {
  ANIM_CLASSES.forEach(function (c) { if (c !== cls) pet.classList.remove(c); });
  void pet.offsetWidth;
  pet.classList.add(cls);
  setTimeout(() => pet.classList.remove(cls), ms);
}


// ---------- 新增互动：双击跳 / 五连点转圈 / 空闲打哈欠-睡着 ----------
// ---------- 新增互动（v1.48）----------
// 戳肚子 / 拖着挣扎 / 眼神跟随 / 发呆打盹 / 喂到嘴边 / 双击转圈 / 摸头享受
const BELLY_LINES = ['哈哈哈…痒！', '别戳肚子啦', '嘿嘿…好痒', '再戳就生气咯', '唔…！'];
const CHEW_LINES = ['唔…好吃！', '啊呜～', '谢谢！', '还要～'];
let lastBellyAt = 0;
let lookUntil = 0;
let dazed = false;
let enjoying = false;

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)] || '';
}

// 眼神跟随：用独立的 translate 属性，不抢 transform（动画还在用 transform）
function lookAt(clientX, clientY) {
  const r = pet.getBoundingClientRect();
  if (!r.width) return;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height * 0.20;
  let dx = (clientX - cx) / (r.width * 0.55);
  let dy = (clientY - cy) / (r.height * 0.55);
  if (dx > 1.5) dx = 1.5; else if (dx < -1.5) dx = -1.5;
  if (dy > 1.2) dy = 1.2; else if (dy < -1.2) dy = -1.2;
  const shift = r.width * 0.032;
  pet.style.translate = (dx * shift).toFixed(1) + 'px ' + (dy * shift * 0.45).toFixed(1) + 'px';
  lookUntil = Date.now() + 1100;
}

setInterval(function () {
  if (Date.now() > lookUntil && pet.style.translate) pet.style.translate = '';
}, 280);

function startEnjoy() {
  if (enjoying) return;
  enjoying = true;
  react('enjoy', 1900);
  spawnBubble('唔…好舒服');
  playSound('head');
}

function stopEnjoy() {
  if (!enjoying) return;
  enjoying = false;
  pet.classList.remove('enjoy');
}

// 找触点下的饼干
function foodAt(cx, cy) {
  for (let i = PROPS.length - 1; i >= 0; i--) {
    const o = PROPS[i];
    if (o.kind !== 'food' || o.eaten) continue;
    if (Math.hypot(o.x - cx, o.y - cy) < 26) return o;
  }
  return null;
}

function eatFood(o) {
  o.eaten = true;
  const i = PROPS.indexOf(o);
  if (i >= 0) PROPS.splice(i, 1);
  reactiveChew();
}

function reactiveChew() {
  react('chew', 1250);
  spawnBubble(pickOne(CHEW_LINES));
  setMood('happy', 60000);
  playSound('body');
}

let lastTouchAt = Date.now();
let tapTimes = [];
let asleep = false;

function noteTouch() {
  lastTouchAt = Date.now();
  if (dazed) {
    dazed = false;
    pet.classList.remove('daze');
  }
  if (asleep) {
    asleep = false;
    pet.classList.remove('sleep');
    react('hop', 400);
    spawnBubble('唔…醒了');
  }
}

function startIdleWatch() {
  setInterval(() => {
    if (peekSide) return;                    // 趴着的时候不发作
    const idle = Date.now() - lastTouchAt;
    if (idle > 150000 && !asleep) {
      asleep = true;
      dazed = false;
      pet.classList.remove('daze');
      pet.classList.add('sleep');
      spawnBubble('z…');
    } else if (idle > 45000 && idle < 150000 && !asleep && !dazed) {
      dazed = true;
      pet.classList.add('daze');
      if (Math.random() < 0.6) spawnBubble('好无聊…');
    } else if (idle > 20000 && idle < 45000 && !asleep && !dazed && Math.random() < 0.06) {
      react('shy', 620);
      spawnBubble('困…');
    }
  }, 1000);
}

const bridge = window.AndroidBridge || null;

let press = null;
let dragged = false;
let lastTapAt = 0;

// 拖动：用「屏幕坐标」累积，再用 rAF 每帧发一次。
// 关键：窗口是跟着手指动的，所以手指在窗口内的 clientX 几乎不变，
// 只有 screenX（相对整块屏幕）才会真实反映手指走了多远。
let pendX = 0;
let pendY = 0;
let flushQueued = false;

function screenW() {
  return (window.screen && window.screen.width) || window.innerWidth || 1;
}
function screenH() {
  return (window.screen && window.screen.height) || window.innerHeight || 1;
}

function flushMove() {
  flushQueued = false;
  if (!bridge || (!pendX && !pendY)) { pendX = 0; pendY = 0; return; }
  const fx = pendX / Math.max(1, screenW());
  const fy = pendY / Math.max(1, screenH());
  pendX = 0;
  pendY = 0;
  if (bridge.moveByScreen) bridge.moveByScreen(fx, fy);
  else if (bridge.moveByFrac) bridge.moveByFrac(fx, fy);
}

// Java 侧换档后会调这个，冒一个「小/中/大」提示
window.__onScale = function (idx) {
  spawnBubble(['小', '中', '大'][idx] || '大');
};


// ---------- 双指捏合缩放 ----------
let pinch = null;
let curScale = 1.0;

function touchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.hypot(dx, dy);
}

function beginPinch(touches) {
  if (press) {
    clearTimeout(press.feedTimer);
  clearTimeout(press.charTimer);
    clearTimeout(press.chuteTimer);
  }
  press = null;
  dragged = false;
  if (bridge && bridge.getScale) {
    try { curScale = Number(bridge.getScale()) || curScale; } catch (e) {}
  }
  pinch = { d0: Math.max(1, touchDist(touches)), s0: curScale };
}

function updatePinch(touches) {
  if (!pinch || !bridge || !bridge.setScaleF) return;
  const ratio = touchDist(touches) / pinch.d0;
  let s = pinch.s0 * ratio;
  if (s < 0.55) s = 0.55;
  if (s > 1.6) s = 1.6;
  if (Math.abs(s - curScale) < 0.02) return;
  curScale = s;
  bridge.setScaleF(s);
}

function endPinch() {
  pinch = null;
}

function onDown(e) {
  noteTouch();
  // 双子组合出场动画 / 插腰站姿互动期间忽略触摸，避免把正在播放的动画拖走/打断
  if (duoIntro || duoPose) return;
  if (e.touches && e.touches.length >= 3) {
    openPicker();
    return;
  }
  if (e.touches && e.touches.length >= 2) {
    beginPinch(e.touches);
    return;
  }
  if (chute) return;
  // 抓饼干：手指落在饼干上就拎起来，拖到嘴边会吃掉
  const tGrab = e.touches ? e.touches[0] : e;
  const grabbed = foodAt(tGrab.clientX, tGrab.clientY);
  if (grabbed) {
    press = {
      x: tGrab.clientX, y: tGrab.clientY, t0: Date.now(),
      lastX: tGrab.clientX, lastY: tGrab.clientY, lastSX: 0, lastSY: 0,
      distX: 0, distY: 0, grabFood: grabbed
    };
    grabbed.grabbed = true;
    pet.classList.add('dangle');
    return;
  }
  // 抓她 = 把她从屏幕边上叫回来
  if (bridge && bridge.unstickEdge) {
    try { bridge.unstickEdge(); } catch (err) {}
    if (peekSide) {
      peekSide = 0;
      peekCorner = 0;
      peekAnchor = null;
      pet.style.visibility = '';
    }
  }
  const t = e.touches ? e.touches[0] : e;
  const sx = (t.screenX !== undefined ? t.screenX : t.clientX);
  const sy = (t.screenY !== undefined ? t.screenY : t.clientY);
  press = {
    x: t.clientX, y: t.clientY, t0: Date.now(),
    lastX: t.clientX, lastY: t.clientY,
    lastSX: sx, lastSY: sy,
    distX: 0, distY: 0
  };
  dragged = false;
  lookAt(t.clientX, t.clientY);
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  // 长按 = 喂食（换档改成双击，见 onUp）
  const r0 = pet.getBoundingClientRect();
  const fy0 = (t.clientY - r0.top) / Math.max(1, r0.height);
  if (fy0 < 0.42) {
    // 头顶按住 0.7s = 眯眼享受；一直按住到 2.4s 才开伞
    press.enjoyTimer = setTimeout(() => {
      if (!dragged) startEnjoy();
    }, 700);
    press.chuteTimer = setTimeout(() => {
      if (!dragged && enjoying) { stopEnjoy(); startParachute(); }
    }, 2400);
  } else if (fy0 > 0.78) {
    // 腿长按 = 换角色
    press.charTimer = setTimeout(() => {
      if (!dragged) openPicker();
    }, 700);
  } else {
    // 身体长按 = 喂饼干
    press.feedTimer = setTimeout(() => {
      if (!dragged) feed();
    }, 650);
  }
}

function onMove(e) {
  if (e.touches && e.touches.length >= 2) {
    updatePinch(e.touches);
    return;
  }
  if (!press) return;
  const t = e.touches ? e.touches[0] : e;
  if (press.grabFood) {
    press.grabFood.x = t.clientX;
    press.grabFood.y = t.clientY;
    lookAt(t.clientX, t.clientY);
    return;
  }
  lookAt(t.clientX, t.clientY);
  const dx = t.clientX - press.lastX;
  const dy = t.clientY - press.lastY;
  if (!dragged && Math.hypot(t.clientX - press.x, t.clientY - press.y) > 8) {
    dragged = true;
    clearTimeout(press.feedTimer);
    clearTimeout(press.charTimer);
    clearTimeout(press.enjoyTimer);
    stopEnjoy();
    pet.classList.add('dangle');
    if (Math.random() < 0.7) spawnBubble('放我下来～');
  }
  if (dragged && bridge) {
    const sx = (t.screenX !== undefined ? t.screenX : t.clientX);
    const sy = (t.screenY !== undefined ? t.screenY : t.clientY);
    pendX += sx - press.lastSX;
    pendY += sy - press.lastSY;
    press.distX += sx - press.lastSX;
    press.distY += sy - press.lastSY;
    press.lastSX = sx;
    press.lastSY = sy;
    press.lastX = t.clientX;
    press.lastY = t.clientY;
    if (!flushQueued) {
      flushQueued = true;
      requestAnimationFrame(flushMove);
    }
  }
}

function onUp(e) {
  const remain = e.touches ? e.touches.length : 0;
  if (pinch) {
    if (remain < 2) endPinch();
    return;
  }
  if (!press) return;
  clearTimeout(press.feedTimer);
  clearTimeout(press.charTimer);
  clearTimeout(press.chuteTimer);
  clearTimeout(press.enjoyTimer);
  stopEnjoy();

  const t = e.changedTouches ? e.changedTouches[0] : e;
  const r = pet.getBoundingClientRect();
  const fy = (t.clientY - r.top) / Math.max(1, r.height);
  const held = Date.now() - press.t0;

  // 0. 松手时手里有饼干：到嘴边就吃掉，否则掉回脚下
  if (press.grabFood) {
    const o = press.grabFood;
    o.grabbed = false;
    const mouthX = r.left + r.width / 2;
    const mouthY = r.top + r.height * 0.22;
    if (Math.hypot(o.x - mouthX, o.y - mouthY) < r.width * 0.55) {
      eatFood(o);
    } else {
      o.vy = 0;
      o.ty = r.top + r.height * 0.9;
      o.landAt = 0;
      o.t0 = performance.now();
      if (o.y > o.ty) o.y = o.ty;
    }
    pet.classList.remove('dangle');
    press = null;
    dragged = false;
    return;
  }

  // A. 快速甩动 = 扔小球（位移够大、时间够短）
  if (dragged && held < 340 && Math.abs(press.distX) > 70) {
    throwBall(press.distX);
    if (pendX || pendY) flushMove();
    press = null;
    dragged = false;
    return;
  }

  if (!dragged) {
    const now = Date.now();
    noteTouch();

    // 双击 → 原地转一整圈再蹦
    if (now - lastTapAt < 320) {
      lastTapAt = 0;
      pet.classList.remove('turns');
      void pet.offsetWidth;
      pet.classList.add('turns');
      spawnBubble('转圈圈！');
      setTimeout(function () {
        pet.classList.remove('turns');
        react('hop', 420);
      }, 880);
      press = null;
      dragged = false;
      return;
    }
    lastTapAt = now;

    // 2 秒内连点五下 → 转圈晕了
    tapTimes.push(now);
    tapTimes = tapTimes.filter((v) => now - v < 2000);
    if (tapTimes.length >= 5) {
      tapTimes = [];
      react('spin', 700);
      setTimeout(() => spawnBubble('晕了晕了'), 380);
      press = null;
      dragged = false;
      return;
    }

    // B. 摸摸头：1.2s 内连点头顶三次
    if (fy < 0.42) {
      headTaps.push(now);
      headTaps = headTaps.filter((v) => now - v < 1200);
      if (headTaps.length >= 3) {
        patHead();
      } else {
        react('shy', 520);
        spawnBubble('♥');
        playSound('head');
      }
      press = null;
      dragged = false;
      return;
    }

    if (fy > 0.78) {
      react('wiggle', 400);
      playSound('legs');
    } else if (fy >= 0.50 && fy <= 0.75 && Date.now() - lastBellyAt > 1500) {
      // 戳肚子 → 痒得扭动
      lastBellyAt = Date.now();
      react('wiggle', 560);
      spawnBubble(pickOne(BELLY_LINES));
      playSound('body');
    } else {
      // 双子：点击身体 → 摆插腰站姿定格秀（画布绘制，替换默认 hop）
      const ch = curChar();
      if (ch && ch.id === 'duo' && !duoIntro) {
        startDuoPose();
        spawnBubble(randomLine());
      } else {
        react('hop', 470);
        spawnBubble(randomLine());
        playSound('body');
      }
    }
  }
  pet.classList.remove('dangle');
  if (pendX || pendY) flushMove();

  const wasDragged = dragged;
  press = null;
  dragged = false;

  if (wasDragged && bridge && bridge.snapToEdge) {
    // 松手后让 Java 判断离边缘够不够近，够近就半身挂到屏幕边上
    bridge.snapToEdge();
    setTimeout(function () {
      try {
        const side = bridge.edge ? bridge.edge() : 0;
        peekSide = side || 0;
        peekCorner = (bridge.corner ? bridge.corner() : 0) || 0;
        peekT0 = 0;
        // 只探头：把整个人物藏起来，只让 canvas 画头
        pet.style.visibility = peekSide ? 'hidden' : '';
        if (peekSide) spawnBubble('探头～');
      } catch (err) {}
    }, 160);
  }
}

document.addEventListener('touchstart', onDown, { passive: true });
document.addEventListener('touchmove', onMove, { passive: true });
document.addEventListener('touchend', onUp, { passive: true });
document.addEventListener('touchcancel', onUp, { passive: true });

window.addEventListener('resize', () => {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  resizeFx();
});

// ---------- 双子出场组合动画 ----------
// 拼接近似版：用 char_a（黑发单人）/ char_b（粉毛单人）/ duo（合体）三张素材，
// 在画布上做「黑发推眼镜 → 粉毛被拉出滑入 → 淡入切到两人同框」。
// 无新增素材，动画在所有角色切换进“双子”时播放一次，播完回到正常 duoFx 小动作。
// 以后有真·逐帧素材时，只需替换各阶段内对应的 drawImage/合成，状态机骨架可复用。
let duoIntro = null;              // {phase, t0, pa, pb, duo}
let duoIntroLoaded = {};          // 按 src 缓存已加载 Image，避免反复建图
let duoPose = null;               // {t0} 双子插腰站姿定格互动（点击触发）

function duoImg(src) {
  if (duoIntroLoaded[src]) return duoIntroLoaded[src];
  const im = new Image();
  im.src = src;
  duoIntroLoaded[src] = im;
  return im;
}

// 启动组合入场动画。仅在切到双子时调用（selectChar / nextChar 里）。
// needImages: 提前预载的图（通常传 CHARS 里 a/b/duo 的 src 数组），
// 若未预载，动画会在图就绪后自动从第 1 帧开始（不卡顿）。
function startDuoIntro() {
  const ch = curChar();
  if (!ch || ch.id !== 'duo') return;
  if (duoIntro) return;                          // 播放中不重入
  duoIntro = {
    phase: 1,
    t0: performance.now(),
    pa: duoImg('char_a.png'),
    pb: duoImg('char_b.png'),
    duo: duoImg('duo.png'),
  };
  duoFx = null;                                  // 入场期间暂停随机小动作
  // 入场期间藏起 `#pet`：画布独占画面，避免合体图在单人阶段背后透出
  pet.style.visibility = 'hidden';
  playSound('body');
}

function drawDuoIntro(now) {
  if (!duoIntro) return;
  // 中途切走了（用户又打开面板选了别的角色）→ 立即回收动画状态
  if (!curChar() || curChar().id !== 'duo') {
    duoIntro = null;
    pet.style.visibility = '';
    return;
  }
  const intro = duoIntro;
  const t = (now - intro.t0) / 1000;      // 秒
  const w = fx.clientWidth || window.innerWidth;
  const h = fx.clientHeight || window.innerHeight;

  const drawA = intro.pa.complete && intro.pa.naturalWidth;
  const drawB = intro.pb.complete && intro.pb.naturalWidth;
  const drawDuo = intro.duo.complete && intro.duo.naturalWidth;

  // 全部素材没就绪就空转（不画，也不推进相位）
  if (!drawA && !drawB && !drawDuo) return;

  // 各素材按自身宽高等比缩放到画布，站立居中
  function place(img, scale) {
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    return { dw, dh, cx: w / 2, by: h };   // by: 底部对齐
  }

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  if (intro.phase === 1) {
    // ---- Phase 1：黑发单人推眼镜（站在偏左，等粉毛进来） ----
    const dur = 1.0;
    const p = Math.min(1, t / dur);
    if (drawA) {
      const overH = 0.62;                   // 黑发人单独占画面，底部对齐
      const scale = overH / intro.pa.naturalHeight;
      const pl = place(intro.pa, scale);
      // 黑发站在合成图里自己的位置（偏左），第二个人进来刚好补位
      const paLeft = pl.cx - pl.dw / 2 - pl.dw * 0.30;
      ctx.drawImage(intro.pa, paLeft, pl.by - pl.dh, pl.dw, pl.dh);
      // 轻推眼镜：镜片反光+头顶小亮点（复用 glasses 同款参数）
      const gx = paLeft + pl.dw * 0.52;      // 眼镜在脸上的位置约 52% 宽
      const gy = pl.by - pl.dh * 0.62;
      const k = Math.min(1, Math.max(0, (p - 0.15) / 0.45));
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2.4, pl.dw * 0.011);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const ox = gx + (i - 0.5) * pl.dw * 0.18;
        ctx.beginPath();
        ctx.moveTo(ox - pl.dw * 0.028, gy + pl.dh * 0.028 - k * pl.dh * 0.02);
        ctx.lineTo(ox + pl.dw * 0.028, gy - pl.dh * 0.028 - k * pl.dh * 0.02);
        ctx.stroke();
      }
      ctx.globalAlpha = Math.sin(Math.min(1, k) * Math.PI) * 0.85;
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(gx + pl.dw * 0.09, gy - pl.dh * 0.13, Math.max(2.6, pl.dw * 0.013), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.font = '600 13px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#23272d';
      ctx.textAlign = 'center';
      ctx.fillText('…', w / 2, h / 2);
    }
    if (p >= 1) { intro.phase = 2; intro.t0 = now; }
  } else if (intro.phase === 2) {
    // ---- Phase 2: 粉毛从右滑入（丝线拖拽感），黑发轻轻后仰 ----
    const dur = 1.05;
    const p = Math.min(1, t / dur);
    // 黑发固定站左
    if (drawA) {
      const overH = 0.62;
      const scale = overH / intro.pa.naturalHeight;
      const pl = place(intro.pa, scale);
      const lean = Math.sin(Math.min(1, p) * Math.PI) * 3 * Math.PI / 180;   // 后仰 3°
      ctx.save();
      ctx.translate(pl.cx - pl.dw * 0.10, pl.by - pl.dh);
      ctx.rotate(-lean);                     // 左倾
      ctx.drawImage(intro.pa, 0, 0, pl.dw, pl.dh);
      ctx.restore();
    }
    // 粉毛从右侧滑入
    if (drawB) {
      const overH = 0.62;
      const scale = overH / intro.pb.naturalHeight;
      const pl = place(intro.pb, scale);
      // 滑到黑发右侧并排（对齐 duo 合成图的构图）
      const from = w + pl.dw * 0.4;
      const to = pl.cx + pl.dw * 0.30 - pl.dw / 2;   // 左边缘；中心正好在黑发中心右侧
      const ease = easeOutBack(p);
      const x = from + (to - from) * ease;
      const sway = Math.sin(p * Math.PI * 3.2) * (1 - p) * 6;   // 拖拽摆动
      ctx.save();
      ctx.translate(x + sway, pl.by - pl.dh);
      ctx.drawImage(intro.pb, 0, 0, pl.dw, pl.dh);
      ctx.restore();
      // 末端小珠（丝线感）
      if (x < w) {
        ctx.fillStyle = 'rgba(255,246,216,0.95)';
        ctx.beginPath();
        ctx.arc(x - pl.dw * 0.02, pl.by - pl.dh + pl.dh * 0.9, Math.max(2.2, pl.dw * 0.011), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.font = '600 13px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#23272d';
      ctx.textAlign = 'center';
      ctx.fillText('…', w / 2, h / 2);
    }
    if (p >= 1) { intro.phase = 3; intro.t0 = now; }
  } else if (intro.phase === 3) {
    // ---- Phase 3：淡入切到 duo 合体 ----
    const dur = 0.75;
    const p = Math.min(1, t / dur);
    if (drawDuo) {
      const overH = 0.72;                    // 双人立绘更宽，按高度对齐到 72%
      const scale = overH / intro.duo.naturalHeight;
      const pl = place(intro.duo, scale);
      const alpha = easeInOut(p);
      ctx.globalAlpha = alpha;
      ctx.drawImage(intro.duo, pl.cx - pl.dw / 2, pl.by - pl.dh, pl.dw, pl.dh);
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = 0.85;
      const overH = 0.72;
      const scale = overH / intro.pb.naturalHeight;
      const pl = place(intro.pb, scale);
      ctx.drawImage(intro.pb, pl.cx - pl.dw / 2, pl.by - pl.dh, pl.dw, pl.dh);
      ctx.globalAlpha = 1;
    }
    if (p >= 1) {
      // 结束：彻底交还给正常 duo 显示 + 随机小动作
      duoIntro = null;
      refreshDuoDisplay();
      setTimeout(() => startDuoFx('thread'), 320);
    }
  }
  ctx.restore();
}

function easeOutBack(x) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

// 入场结束后把 #pet 恢复成「双子合体」的正常显示（和 selectChar 里的 loadFrames 一致）
function refreshDuoDisplay() {
  const ch = curChar();
  if (!ch || ch.id !== 'duo') return;
  if (frames[0] && frames[0].src) pet.src = frames[0].src;
  else if (ch.src) pet.src = ch.src;
  pet.classList.add('duo');
  pet.style.visibility = '';
  startAnim();       // 单张立绘 → breathe 呼吸
}

// ---------- 双子插腰站姿定格互动（点击触发） ----------
// 参考「动态照片」参考图：黑发×粉毛两人并排、双手叉腰站定的姿势。
// 用 char_a / char_b 双人素材在画布上摆出并排站姿，叠加两条叉腰手臂线条 + 呼吸浮动，
// 约 1.7s 后淡出切回 duo 合体。无新素材，只复用画布与缓存。

function startDuoPose() {
  const ch = curChar();
  if (!ch || ch.id !== 'duo') return;
  if (duoIntro) return;                          // 入场动画播放中不叠加
  if (duoPose) return;                           // 播放中不重入
  duoPose = { t0: performance.now() };
  duoFx = null;                                  // 定格期间暂停随机小动作
  pet.style.visibility = 'hidden';               // 画布独占画面
  playSound('body');
}

function drawDuoPose(now) {
  if (!duoPose) return;
  // 中途切走了 → 立即回收
  if (!curChar() || curChar().id !== 'duo') {
    duoPose = null;
    pet.style.visibility = '';
    return;
  }
  const pose = duoPose;
  const t = (now - pose.t0) / 1000;
  const dur = 1.7;                                // 定格时长
  const w = fx.clientWidth || window.innerWidth;
  const h = fx.clientHeight || window.innerHeight;

  const pa = duoImg('char_a.png');
  const pb = duoImg('char_b.png');
  const okA = pa.complete && pa.naturalWidth;
  const okB = pb.complete && pb.naturalWidth;
  if (!okA && !okB) return;                       // 素材未就绪先空转

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  // 两人并排：高度对齐到画布 62%，黑发在左、粉毛在右（同 duo 合成图构图）
  const overH = 0.62;
  const scaleA = okA ? overH / pa.naturalHeight : 0;
  const scaleB = okB ? overH / pb.naturalHeight : 0;
  const dwA = pa.naturalWidth * scaleA;
  const dhA = pa.naturalHeight * scaleA;
  const dwB = pb.naturalWidth * scaleB;
  const dhB = pb.naturalHeight * scaleB;
  const gap = Math.min(dwA, dwB) * 0.02;          // 两人间留 2% 空隙
  const totalW = dwA + gap + dwB;
  const leftA = w / 2 - totalW / 2;
  const leftB = leftA + dwA + gap;
  const baseY = h;                                 // 底部对齐

  // 呼吸浮动：整组轻微上下起伏
  const floatY = Math.sin(now / 420) * Math.max(2, h * 0.006);
  ctx.translate(0, floatY);

  // --- 黑发（左，戴眼镜） ---
  if (okA) {
    ctx.drawImage(pa, leftA, baseY - dhA, dwA, dhA);
    // 叉腰左臂（从肩部到腰部的弯折线段）
    ctx.strokeStyle = 'rgba(46,42,48,0.85)';
    ctx.lineWidth = Math.max(2.2, dwA * 0.012);
    ctx.lineCap = 'round';
    ctx.beginPath();
    const shA = baseY - dhA * 0.26;              // 肩部 y
    const waA = baseY - dhA * 0.44;              // 腰部 y
    const ax = leftA + dwA * 0.10;               // 肩部 x（靠外侧）
    ctx.moveTo(ax, shA);
    ctx.quadraticCurveTo(leftA - dwA * 0.06, (shA + waA) / 2, leftA - dwA * 0.02, waA);
    ctx.stroke();
    // 叉腰右臂（向内弯，勾到腰侧）
    ctx.beginPath();
    const ax2 = leftA + dwA * 0.88;
    ctx.moveTo(ax2, shA);
    ctx.quadraticCurveTo(leftA + dwA * 1.06, (shA + waA) / 2, leftA + dwA * 0.98, waA);
    ctx.stroke();
    // 镜片反光小亮点（同 glasses 参数）
    const gxA = leftA + dwA * 0.52;
    const gyA = baseY - dhA * 0.62;
    ctx.fillStyle = 'rgba(255,246,216,0.9)';
    ctx.beginPath();
    ctx.arc(gxA + dwA * 0.09, gyA - dhA * 0.13, Math.max(2.2, dwA * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }

  // --- 粉毛（右，兔耳） ---
  if (okB) {
    ctx.drawImage(pb, leftB, baseY - dhB, dwB, dhB);
    ctx.strokeStyle = 'rgba(46,42,48,0.85)';
    ctx.lineWidth = Math.max(2.2, dwB * 0.012);
    ctx.lineCap = 'round';
    // 叉腰左臂（向内弯）
    const shB = baseY - dhB * 0.26;
    const waB = baseY - dhB * 0.44;
    const bx = leftB + dwB * 0.12;
    ctx.beginPath();
    ctx.moveTo(bx, shB);
    ctx.quadraticCurveTo(leftB - dwB * 0.06, (shB + waB) / 2, leftB - dwB * 0.02, waB);
    ctx.stroke();
    // 叉腰右臂（外弯） + 头顶小亮点
    ctx.beginPath();
    const bx2 = leftB + dwB * 0.90;
    ctx.moveTo(bx2, shB);
    ctx.quadraticCurveTo(leftB + dwB * 1.06, (shB + waB) / 2, leftB + dwB * 1.02, waB);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,216,0.9)';
    ctx.beginPath();
    ctx.arc(leftB + dwB * 0.82, baseY - dhB * 0.96, Math.max(2.2, dwB * 0.012), 0, Math.PI * 2);
    ctx.fill();
  }

  // 结尾淡出
  const fadeStart = dur - 0.28;
  if (t > fadeStart) {
    ctx.globalAlpha = Math.max(0, 1 - (t - fadeStart) / (dur - fadeStart));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  if (t >= dur) {
    // 定格结束：交还给 duo 正常显示 + 恢复随机小动作
    duoPose = null;
    refreshDuoDisplay();
    setTimeout(() => startDuoFx('thread'), 320);
  }
}

// ---------- 启动 ----------
// Java 侧版本更新回调：检查出新版本 / 下载中 / 需要授权 / 失败时冒一条气泡
// text 是 Java 拼好的完整文案，ev 是事件名（updateFound/updateDownloading/needInstallPerm/updateFailed）
window.__onUpdate = function (text, ev) {
  try { spawnBubble(String(text)); } catch (e) {}
};

(async function boot() {
  if (bridge && bridge.hello) bridge.hello(window.innerWidth, window.innerHeight);
  resizeFx();
  requestAnimationFrame(drawBubbles);
  await loadFrames();
  pet.src = frames[0].src;
  startAnim();
  await initSound();
  startIdleWatch();
  noteTouch();
  spawnBubble('来啦');
  try { if (!localStorage.getItem('pet.charTip')) { localStorage.setItem('pet.charTip','1'); setTimeout(function(){ spawnBubble('长按腿或三指点一下可换角色'); }, 2600); } } catch (e) {}
  dailyGreeting();
  refreshWeather();
  setInterval(refreshWeather, 30 * 60 * 1000);
  // 版本更新检查：有新版自动下载安装（URL 未配置时 Java 侧自动跳过）
  try { if (bridge && bridge.checkUpdate) bridge.checkUpdate(); } catch (e) {}
})();