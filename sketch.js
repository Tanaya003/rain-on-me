const API_KEY = "4cccb6b5aa354fb192d175801263005";

const CITIES = [
  ["Mumbai","Maharashtra"],["Delhi","Delhi"],["Bengaluru","Karnataka"],
  ["Chennai","Tamil Nadu"],["Hyderabad","Telangana"],["Kolkata","West Bengal"],
  ["Pune","Maharashtra"],["Ahmedabad","Gujarat"],["Jaipur","Rajasthan"],
  ["Surat","Gujarat"],["Lucknow","Uttar Pradesh"],["Kanpur","Uttar Pradesh"],
  ["Nagpur","Maharashtra"],["Indore","Madhya Pradesh"],["Thane","Maharashtra"],
  ["Bhopal","Madhya Pradesh"],["Visakhapatnam","Andhra Pradesh"],["Patna","Bihar"],
  ["Vadodara","Gujarat"],["Ghaziabad","Uttar Pradesh"],["Ludhiana","Punjab"],
  ["Agra","Uttar Pradesh"],["Nashik","Maharashtra"],["Faridabad","Haryana"],
  ["Meerut","Uttar Pradesh"],["Rajkot","Gujarat"],["Varanasi","Uttar Pradesh"],
  ["Srinagar","Jammu & Kashmir"],["Amritsar","Punjab"],["Allahabad","Uttar Pradesh"],
  ["Ranchi","Jharkhand"],["Coimbatore","Tamil Nadu"],["Jabalpur","Madhya Pradesh"],
  ["Gwalior","Madhya Pradesh"],["Vijayawada","Andhra Pradesh"],["Jodhpur","Rajasthan"],
  ["Madurai","Tamil Nadu"],["Raipur","Chhattisgarh"],["Kota","Rajasthan"],
  ["Guwahati","Assam"],["Chandigarh","Chandigarh"],["Solapur","Maharashtra"],
  ["Hubli","Karnataka"],["Tiruchirappalli","Tamil Nadu"],["Bareilly","Uttar Pradesh"],
  ["Mysuru","Karnataka"],["Aligarh","Uttar Pradesh"],["Shimla","Himachal Pradesh"],
  ["Mangalore","Karnataka"],["Kochi","Kerala"],["Thiruvananthapuram","Kerala"]
];

let drops = [], splashes = [], maskData = null;
let rainParams = { count: 0, speed: 0, size: 2, label: "Clear" };
let skyTint = [0, 0, 0, 0];
let running = false;
let capture, segCanvas, segCtx, selfieSegmentation;
let CW, CH;

function isMobile() { return windowWidth < 768; }

function getCanvasDims() {
  const pad = 32;
  if (isMobile()) {
    const w = min(windowWidth - pad, 420);
    const h = w * (4 / 3);
    return { w: floor(w), h: floor(h) };
  } else {
    const w = min(windowWidth - pad, 940);
    const h = floor(w * (660 / 940));
    return { w: floor(w), h: floor(h) };
  }
}

function getRainParams(t) {
  if (t < 15)  return { count: 0,   speed: 0,  size: 2,   label: "Clear" };
  if (t <= 20) return { count: 50,  speed: 5,  size: 1.8, label: "Low" };
  if (t <= 26) return { count: 130, speed: 10, size: 2.1, label: "Medium" };
  if (t <= 35) return { count: 230, speed: 16, size: 2.4, label: "High" };
               return { count: 380, speed: 26, size: 2.8, label: "Very high" };
}

function getSkyTint(t) {
  if (t < 15)  return [200, 210, 220,   0];
  if (t <= 20) return [140, 160, 190,  40];
  if (t <= 26) return [100, 120, 160,  70];
  if (t <= 35) return [65,  80,  125, 100];
               return [25,  35,   70, 140];
}

function setup() {
  const { w, h } = getCanvasDims();
  CW = w; CH = h;

  const cnv = createCanvas(CW, CH);
  cnv.parent("canvas-wrap");
  styleCanvas();

  capture = createCapture({ video: { facingMode: "user" }, audio: false });
  capture.size(CW, CH);
  capture.hide();

  segCanvas = document.createElement("canvas");
  segCanvas.width  = CW;
  segCanvas.height = CH;
  segCtx = segCanvas.getContext("2d");

  initSegmentation();
  initUI();
}

function styleCanvas() {
  const c = document.querySelector("canvas");
  if (!c) return;
  c.style.width        = CW + "px";
  c.style.height       = CH + "px";
  c.style.display      = "block";
  c.style.borderRadius = "14px";
  c.style.maxWidth     = "100%";
}

function windowResized() {
  const { w, h } = getCanvasDims();
  CW = w; CH = h;
  resizeCanvas(CW, CH);
  capture.size(CW, CH);
  segCanvas.width  = CW;
  segCanvas.height = CH;
  maskData = null;
  styleCanvas();
  if (running) resetDrops();
}

function initUI() {
  const input = document.getElementById("city-input");
  const btn   = document.getElementById("fetch-btn");
  const sugg  = document.getElementById("suggestions");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { sugg.style.display = "none"; return; }
    const matches = CITIES.filter(([c]) => c.toLowerCase().startsWith(q)).slice(0, 6);
    if (!matches.length) { sugg.style.display = "none"; return; }
    sugg.innerHTML = matches.map(([c, s]) =>
      `<div class="suggestion-item" onclick="pickCity('${c}')">
        <span>${c}</span><span class="suggestion-state">${s}</span>
      </div>`
    ).join("");
    sugg.style.display = "block";
  });

  btn.addEventListener("click", () => {
    sugg.style.display = "none";
    const v = input.value.trim();
    if (v) loadCity(v);
  });

  input.addEventListener("keydown", e => {
    if (e.key === "Enter")  { sugg.style.display = "none"; loadCity(input.value.trim()); }
    if (e.key === "Escape") sugg.style.display = "none";
  });

  document.addEventListener("click", e => {
    if (!e.target.closest("#top-bar")) sugg.style.display = "none";
  });
}

window.pickCity = function(city) {
  document.getElementById("city-input").value = city;
  document.getElementById("suggestions").style.display = "none";
  loadCity(city);
};

function initSegmentation() {
  selfieSegmentation = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
  });
  selfieSegmentation.setOptions({ modelSelection: 1, selfieMode: true });
  selfieSegmentation.onResults(results => {
    segCtx.clearRect(0, 0, CW, CH);
    segCtx.drawImage(results.segmentationMask, 0, 0, CW, CH);
    maskData = segCtx.getImageData(0, 0, CW, CH).data;
  });
}

async function runSegLoop() {
  if (!running) return;
  if (capture.elt.readyState === 4) await selfieSegmentation.send({ image: capture.elt });
  requestAnimationFrame(runSegLoop);
}

function isPersonAt(x, y) {
  if (!maskData) return false;
  const ix = floor(x), iy = floor(y);
  if (ix < 0 || iy < 0 || ix >= CW || iy >= CH) return false;
  return maskData[(iy * CW + ix) * 4] > 128;
}

function getSurfaceNormal(x, y) {
  const r = 4;
  let gx = 0, gy = 0;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) {
      const p = isPersonAt(x + dx, y + dy) ? 1 : 0;
      gx += p * dx; gy += p * dy;
    }
  const len = sqrt(gx * gx + gy * gy);
  if (len < 0.01) return null;
  return { nx: gx / len, ny: gy / len };
}

function makeDrop() {
  return {
    x: random(CW), y: random(-CH, 0),
    vy: rainParams.speed * random(0.8, 1.3),
    opacity: random(0.6, 0.95),
    r: rainParams.size * random(0.8, 1.2),
    sliding: false, slideVx: 0, slideVy: 0, slideTTL: 0
  };
}

function resetDrops() {
  drops = Array.from({ length: rainParams.count }, () => {
    const d = makeDrop(); d.y = random(0, CH); return d;
  });
}

function spawnSplash(x, y) {
  for (let i = 0; i < 5 + floor(random(4)); i++) {
    const angle = random(TWO_PI), speed = random(1, 2.8);
    splashes.push({ x, y, vx: cos(angle)*speed, vy: sin(angle)*speed - 2, life: 1, r: random(1, 2.5) });
  }
}

function draw() {
  push(); translate(CW, 0); scale(-1, 1); image(capture, 0, 0, CW, CH); pop();

  noStroke();
  fill(skyTint[0], skyTint[1], skyTint[2], skyTint[3]);
  rect(0, 0, CW, CH);

  if (rainParams.count === 0) return;

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.sliding) {
      d.x += d.slideVx; d.y += d.slideVy; d.slideTTL--;
      if (d.slideTTL <= 0 || d.y > CH || d.x < 0 || d.x > CW) { drops[i] = makeDrop(); continue; }
      fill(255, 255, 255, d.opacity * 180); circle(d.x, d.y, d.r * 1.4);
      continue;
    }
    let hit = false;
    const steps = ceil(d.vy);
    for (let s = 1; s <= steps; s++) {
      const ty = d.y + d.vy * s / steps;
      if (isPersonAt(d.x, ty)) {
        const n = getSurfaceNormal(d.x, ty);
        if (!n || abs(n.ny) > 0.5) { spawnSplash(d.x, ty); drops[i] = makeDrop(); }
        else { d.sliding = true; d.y = ty; d.slideVx = (n.nx > 0 ? 1 : -1) * 1.8; d.slideVy = 2.5; d.slideTTL = floor(random(20, 45)); }
        hit = true; break;
      }
    }
    if (!hit) {
      d.y += d.vy;
      if (d.y > CH) { drops[i] = makeDrop(); continue; }
      fill(255, 255, 255, d.opacity * 255); circle(d.x, d.y, d.r * 2);
    }
  }

  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.x += s.vx; s.y += s.vy; s.vy += 0.2; s.life -= 0.08;
    if (s.life <= 0) { splashes.splice(i, 1); continue; }
    fill(255, 255, 255, s.life * 200); circle(s.x, s.y, s.r * s.life * 2);
  }
}

async function loadCity(cityName) {
  if (!cityName) return;
  document.getElementById("status").textContent = "Fetching weather…";
  try {
    const res = await fetch(
      `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${encodeURIComponent(cityName)},India&aqi=no`
    );
    if (!res.ok) throw new Error();
    const data = await res.json();
    const temp = Math.round(data.current.temp_c);
    rainParams = getRainParams(temp);
    skyTint    = getSkyTint(temp);

    document.getElementById("s-city").textContent      = data.location.name;
    document.getElementById("s-temp").textContent      = temp + "°C";
    document.getElementById("s-intensity").textContent = rainParams.label;
    document.getElementById("stats").style.display     = "flex";
    document.getElementById("status").textContent      = "";

    if (!running) { running = true; runSegLoop(); }
    resetDrops();
  } catch {
    document.getElementById("status").textContent = "City not found. Try another.";
  }
}
