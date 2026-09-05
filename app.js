const $ = (id) => document.getElementById(id);
const state = { mode: 'gui', dataUrl: null, baseData: null, history: [], historyIndex: -1, images: [], selectedFileName: 'image.png', manualCode: false };

const defaults = {
  alpha: 1, beta: 0, gamma: 1, blend: 0.5, blur: 'none', kernel: 3, sigmaX: 0, sigmaY: 0,
  bd: 7, sc: 75, ss: 75, morph: 'none', morphK: 3, iter: 1, thresholdMode: 'none',
  th: 127, maxv: 255, block: 11, cval: 2, edge: 'none', c1: 80, c2: 160, sobelK: 3,
  ht: 50, hmin: 50, hgap: 10, rmin: 0, rmax: 0, noise: 0, dh: 0, dhc: 0,
  hueMin: 0, hueMax: 179, satMin: 0, satMax: 255, valMin: 0, valMax: 255,
  angle: 0, scale: 1, tx: 0, ty: 0, sf: 1.1, mn: 5, conf: 50, nms: 45
};

const names = {
  alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', blend: 'Blend', blur: 'Blur', kernel: 'Kernel',
  sigmaX: 'Sigma X', sigmaY: 'Sigma Y', bd: 'Bilateral d', sc: 'Sigma Color', ss: 'Sigma Space',
  morph: 'Morphology', morphK: 'Morph kernel', iter: 'Iterations', thresholdMode: 'Threshold',
  th: 'Threshold', maxv: 'Max value', block: 'Block size', cval: 'C', edge: 'Edge',
  c1: 'Canny 1', c2: 'Canny 2', sobelK: 'Sobel', ht: 'Hough threshold', hmin: 'Min line length',
  hgap: 'Max line gap', rmin: 'Min radius', rmax: 'Max radius', noise: 'Noise', dh: 'Denoise h',
  dhc: 'hColor', hueMin: 'Hue min', hueMax: 'Hue max', satMin: 'Sat min', satMax: 'Sat max',
  valMin: 'Value min', valMax: 'Value max', angle: 'Rotation', scale: 'Scale', tx: 'Translate X', ty: 'Translate Y'
};

function params() {
  const p = {};
  Object.keys(defaults).forEach((k) => {
    const e = $(k);
    p[k] = e ? (e.type === 'range' ? Number(e.value) : e.value) : defaults[k];
  });
  return p;
}

function applyValuesToControls(values) {
  Object.entries(values).forEach(([key, value]) => {
    const el = $(key);
    if (!el) return;
    el.value = value;
  });
  updateOutputs();
  buildPipe();
}

function parseCodeToControls(codeText) {
  const values = {};
  const convertMatch = codeText.match(/convertScaleAbs\(img,\s*alpha=([0-9.]+),\s*beta=([0-9.-]+)/i);
  if (convertMatch) {
    values.alpha = Number(convertMatch[1]);
    values.beta = Number(convertMatch[2]);
  }

  const gammaMatch = codeText.match(/inv=1\/([0-9.]+)/i);
  if (gammaMatch) values.gamma = Number(gammaMatch[1]);

  if (/GaussianBlur\(/i.test(codeText)) {
    values.blur = 'gaussian';
    const kernelMatch = codeText.match(/GaussianBlur\(img,\s*\((\d+),\s*\d+\)/i);
    if (kernelMatch) values.kernel = Number(kernelMatch[1]);
    const sigmaXMatch = codeText.match(/GaussianBlur\(img,\s*\([^\)]*\),\s*([0-9.]+),\s*([0-9.]+)/i);
    if (sigmaXMatch) {
      values.sigmaX = Number(sigmaXMatch[1]);
      values.sigmaY = Number(sigmaXMatch[2]);
    }
  } else if (/medianBlur\(/i.test(codeText)) {
    values.blur = 'median';
    const kernelMatch = codeText.match(/medianBlur\(img,\s*(\d+)/i);
    if (kernelMatch) values.kernel = Number(kernelMatch[1]);
  } else if (/bilateralFilter\(/i.test(codeText)) {
    values.blur = 'bilateral';
    const bdMatch = codeText.match(/bilateralFilter\(img,\s*(\d+)/i);
    if (bdMatch) values.bd = Number(bdMatch[1]);
    const scMatch = codeText.match(/bilateralFilter\(img,\s*\d+,\s*([0-9.]+),\s*([0-9.]+)/i);
    if (scMatch) {
      values.sc = Number(scMatch[1]);
      values.ss = Number(scMatch[2]);
    }
  }

  const morphMatch = codeText.match(/morphologyEx\(img,\s*cv2\.MORPH_([A-Z_]+),\s*ker,\s*iterations=(\d+)/i);
  if (morphMatch) {
    values.morph = morphMatch[1].toLowerCase();
    values.iter = Number(morphMatch[2]);
  }

  const thresholdMatch = codeText.match(/threshold\(gray,\s*(\d+),\s*(\d+),\s*cv2\.THRESH_BINARY\)/i);
  if (thresholdMatch) {
    values.thresholdMode = 'binary';
    values.th = Number(thresholdMatch[1]);
    values.maxv = Number(thresholdMatch[2]);
  }

  const houghMatch = codeText.match(/HoughLinesP\(e,\s*1,\s*np\.pi\s*\/\s*180,\s*(\d+)/i);
  if (houghMatch) {
    values.edge = 'hough';
    values.ht = Number(houghMatch[1]);
  }

  const cannyMatch = codeText.match(/Canny\(gray,\s*(\d+),\s*(\d+)\)/i);
  if (cannyMatch && !houghMatch) {
    values.edge = 'canny';
    values.c1 = Number(cannyMatch[1]);
    values.c2 = Number(cannyMatch[2]);
  }

  return values;
}

function resetControls() {
  Object.keys(defaults).forEach((k) => {
    const el = $(k);
    if (el) el.value = defaults[k];
  });
  $('codeEditor').value = codeFromParams();
  lines();
  updateOutputs();
  buildPipe();
}

function codeFromParams() {
  const p = params();
  return `import cv2
import numpy as np

# OpenCV Studio generated pipeline
img = img.copy()
img = cv2.convertScaleAbs(img, alpha=${p.alpha}, beta=${p.beta})
${p.gamma !== 1 ? `inv=1/${p.gamma}
table=np.array([((i/255.0)**inv)*255 for i in range(256)]).astype('uint8')
img=cv2.LUT(img,table)` : ''}
${p.blur === 'gaussian' ? `img=cv2.GaussianBlur(img, (${p.kernel}, ${p.kernel}), ${p.sigmaX}, ${p.sigmaY})` : p.blur === 'median' ? `img=cv2.medianBlur(img, ${p.kernel})` : p.blur === 'bilateral' ? `img=cv2.bilateralFilter(img, ${p.bd}, ${p.sc}, ${p.ss})` : ''}
${p.morph !== 'none' ? `ker=cv2.getStructuringElement(cv2.MORPH_RECT, (${p.morphK},${p.morphK}))
img=cv2.morphologyEx(img, cv2.MORPH_${p.morph.toUpperCase()}, ker, iterations=${p.iter})` : ''}
${p.thresholdMode === 'binary' ? `gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
gray=cv2.threshold(gray,${p.th},${p.maxv},cv2.THRESH_BINARY)[1]
img=cv2.cvtColor(gray,cv2.COLOR_GRAY2BGR)` : p.thresholdMode === 'otsu' ? `gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
gray=cv2.threshold(gray,0,${p.maxv},cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1]
img=cv2.cvtColor(gray,cv2.COLOR_GRAY2BGR)` : p.thresholdMode === 'adaptive' ? `gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
gray=cv2.adaptiveThreshold(gray,${p.maxv},cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY,${p.block},${p.cval})
img=cv2.cvtColor(gray,cv2.COLOR_GRAY2BGR)` : ''}
${p.edge === 'canny' ? `gray=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
img=cv2.cvtColor(cv2.Canny(gray,${p.c1},${p.c2}),cv2.COLOR_GRAY2BGR)` : ''}
${p.noise > 0 ? `img=np.clip(img.astype(np.float32)+np.random.normal(0,${p.noise},img.shape),0,255).astype(np.uint8)` : ''}
${p.dh > 0 ? `img=cv2.fastNlMeansDenoisingColored(img,None,${p.dh},${p.dhc},7,21)` : ''}
${p.scale !== 1 ? `img=cv2.resize(img,None,fx=${p.scale},fy=${p.scale},interpolation=cv2.INTER_CUBIC)` : ''}
${(p.angle || p.tx || p.ty) ? `h,w=img.shape[:2]
M=cv2.getRotationMatrix2D((w/2,h/2),${p.angle},1.0)
M[0,2]+=${p.tx}; M[1,2]+=${p.ty}
img=cv2.warpAffine(img,M,(w,h),borderMode=cv2.BORDER_CONSTANT,borderValue=(20,20,20))` : ''}
# result = img
result = img`;
}

function setSelectedFileName(name) {
  const cleanName = (name && name.trim()) ? name : 'image.png';
  state.selectedFileName = cleanName;
  const fileTab = document.querySelector('.filetab.active');
  if (fileTab) fileTab.textContent = `● ${cleanName}`;
  const path = $('.path');
  if (path) path.textContent = '— ' + cleanName;
}

function updateOutputs() {
  document.querySelectorAll('output').forEach((o) => {
    const e = o.previousElementSibling || o;
    if (!e.id) return;
    let v = e.value;
    if (['alpha', 'gamma', 'blend', 'sf'].includes(e.id)) v = Number(v).toFixed(2);
    if (e.id === 'scale') v = Number(v).toFixed(1) + '×';
    if (e.id === 'angle') v += '°';
    if (['conf', 'nms'].includes(e.id)) v += '%';
    o.textContent = v;
  });
}

function pushHistory(dataUrl) {
  if (!dataUrl) return;
  if (state.history[state.historyIndex] === dataUrl) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(dataUrl);
  state.historyIndex = state.history.length - 1;
  if (state.history.length > 30) {
    state.history = state.history.slice(-30);
    state.historyIndex = state.history.length - 1;
  }
}

function undoHistory() {
  if (state.historyIndex <= 0) return;
  state.historyIndex -= 1;
  const prev = state.history[state.historyIndex];
  if (!prev) return;
  state.dataUrl = prev;
  state.baseData = prev;
  draw(prev);
  if (window.editorLoad) window.editorLoad(prev);
  if (window.editorProcess) render();
}

function redoHistory() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  const next = state.history[state.historyIndex];
  if (!next) return;
  state.dataUrl = next;
  state.baseData = next;
  draw(next);
  if (window.editorLoad) window.editorLoad(next);
  if (window.editorProcess) render();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function mergeTwoImagesDataUrls(aUrl, bUrl, weight = 0.5) {
  const imgA = await loadImageFromDataUrl(aUrl);
  const imgB = await loadImageFromDataUrl(bUrl);
  const w = Math.max(imgA.width, imgB.width);
  const h = Math.max(imgA.height, imgB.height);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(w, h);
  const data = out.data;

  const imgAData = getImageDataFromImage(imgA, w, h);
  const imgBData = getImageDataFromImage(imgB, w, h);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      const a = imgAData[idx];
      const b = imgBData[idx];
      const aa = imgAData[idx + 1];
      const bb = imgBData[idx + 1];
      const ab = imgAData[idx + 2];
      const bb2 = imgBData[idx + 2];
      const alpha = Number(weight || 0.5);
      data[idx] = Math.min(255, Math.round(a * (1 - alpha) + b * alpha));
      data[idx + 1] = Math.min(255, Math.round(aa * (1 - alpha) + bb * alpha));
      data[idx + 2] = Math.min(255, Math.round(ab * (1 - alpha) + bb2 * alpha));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas.toDataURL('image/png');
}

function getImageDataFromImage(img, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function draw(src) {
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    const c = $('canvas');
    const maxW = c.parentElement.clientWidth * 0.94;
    const maxH = c.parentElement.clientHeight * 0.94;
    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    c.width = img.width;
    c.height = img.height;
    c.style.width = (img.width * s) + 'px';
    c.style.height = (img.height * s) + 'px';
    c.getContext('2d').drawImage(img, 0, 0);
  };
  img.src = src;
}

function buildPipe() {
  const p = params();
  const keys = Object.keys(p).filter((k) => p[k] !== defaults[k] && !['sf', 'mn', 'conf', 'nms'].includes(k));
  $('pipeList').innerHTML = keys.length
    ? keys.map((k) => `<div class="pipe-item"><b>${names[k] || k}</b><span>${p[k]}</span></div>`).join('')
    : '<span class="empty">No operations yet</span>';
}

function lines() {
  const n = $('codeEditor').value.split('\n').length;
  $('lineNumbers').textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n');
}

function setMode(m) {
  state.mode = m;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.mode === m));
  $('guiView').classList.toggle('hidden', m !== 'gui');
  $('codeView').classList.toggle('hidden', m !== 'code');
  $('helpView').classList.toggle('hidden', m !== 'help');
}

async function render() {
  if (!state.dataUrl || !window.editorProcess) return;
  updateOutputs();
  const out = await window.editorProcess(JSON.stringify(params()));
  if (!out) return;
  state.baseData = out;
  state.dataUrl = out;
  pushHistory(out);
  draw(out);
  buildPipe();
  if (!state.manualCode) {
    $('codeEditor').value = codeFromParams();
    lines();
  }
}

async function loadImages(files) {
  const dataUrls = await Promise.all(Array.from(files).map(readFileAsDataUrl));
  state.images = dataUrls;
  const first = dataUrls[0];
  const fileName = files[0]?.name || state.selectedFileName;
  state.dataUrl = first;
  state.baseData = first;
  setSelectedFileName(fileName);
  draw(first);
  pushHistory(first);
  if (window.editorLoad) await window.editorLoad(first);
  if (window.editorProcess) await render();
}

async function sumCurrentImages() {
  if (!state.images || state.images.length < 2) {
    alert('Selecione pelo menos duas imagens para somar.');
    return;
  }

  const weight = Number($('blend').value || 0.5);

  try {
    let out = null;
    if (window.editorSum) {
      out = await window.editorSum(state.images[0], state.images[1], weight);
    } else {
      out = await mergeTwoImagesDataUrls(state.images[0], state.images[1], weight);
    }

    if (out) {
      state.dataUrl = out;
      state.baseData = out;
      draw(out);
      pushHistory(out);
      if (window.editorLoad) await window.editorLoad(out);
    }
  } catch (error) {
    alert(error.message || 'Não foi possível somar as imagens.');
  }
}

document.querySelectorAll('.accordion').forEach((b) => {
  b.onclick = () => {
    b.classList.toggle('open');
    const panel = b.nextElementSibling;
    panel.classList.toggle('hidden');
    b.querySelector('b').textContent = panel.classList.contains('hidden') ? '›' : '⌄';
  };
});

document.querySelectorAll('.tab').forEach((b) => b.onclick = () => setMode(b.dataset.mode));
document.querySelectorAll('input[type=range], select').forEach((e) => e.addEventListener('input', () => {
  state.manualCode = false;
  $('codeEditor').value = codeFromParams();
  lines();
  render();
}));

$('openImageBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = async (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  await loadImages(files);
};

$('sumBtn').onclick = sumCurrentImages;
$('canvas').ondragover = (e) => {
  e.preventDefault();
  $('canvas').parentElement.classList.add('drop-active');
};
$('canvas').ondragleave = () => $('canvas').parentElement.classList.remove('drop-active');
$('canvas').ondrop = (e) => {
  e.preventDefault();
  $('canvas').parentElement.classList.remove('drop-active');
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  const dt = new DataTransfer();
  dt.items.add(f);
  $('fileInput').files = dt.files;
  $('fileInput').dispatchEvent(new Event('change'));
};

$('runBtn').onclick = async () => {
  if (!window.editorExecute) return;
  try {
    const text = $('codeEditor').value;
    const parsed = parseCodeToControls(text);
    if (Object.keys(parsed).length) {
      applyValuesToControls(parsed);
      state.manualCode = false;
    }
    const out = await window.editorExecute(text, state.dataUrl);
    state.baseData = out;
    state.dataUrl = out;
    pushHistory(out);
    draw(out);
  } catch (error) {
    alert(error);
  }
};

$('codeEditor').addEventListener('input', () => {
  state.manualCode = true;
  lines();
});
$('clearPipe').onclick = () => {
  resetControls();
  render();
};
$('resetBtn').onclick = () => location.reload();
$('newBtn').onclick = () => {
  state.dataUrl = null;
  state.baseData = null;
  state.images = [];
  state.history = [];
  state.historyIndex = -1;
  state.manualCode = false;
  setSelectedFileName('image.png');
  resetControls();
  $('canvas').width = 1;
  $('canvas').height = 1;
  $('status').textContent = '● Ready';
};
$('copyBtn').onclick = () => navigator.clipboard.writeText($('codeEditor').value);
$('saveBtn').onclick = () => {
  if (!state.baseData) return;
  const a = document.createElement('a');
  a.href = state.baseData;
  a.download = 'opencv-edited.png';
  a.click();
};
$('downloadBtn').onclick = () => $('saveBtn').click();
$('themeBtn').onclick = () => document.body.classList.toggle('light');
$('infoBtn').onclick = () => setMode('help');
$('undoBtn').onclick = undoHistory;
$('redoBtn').onclick = redoHistory;

window.setStatus = (msg) => {
  if ($('status')) $('status').textContent = '● ' + msg;
};

window.addEventListener('opencv-ready', () => {
  $('cvVer').textContent = window.editorVersion || 'ready';
  $('codeEditor').value = codeFromParams();
  lines();
  updateOutputs();
});

setTimeout(() => window.dispatchEvent(new Event('opencv-ready')), 1500);
