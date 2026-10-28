// recognition.js の全文（そのまま置き換え可能です）
import { WORDS, allWords } from './core.js';
const NW = 96, NH = 48;

function quantile(hist, total, q) {
  let n = 0;
  for (let i = 0; i < 256; i++) { n += hist[i]; if (n >= total * q) return i; }
  return 255;
}

function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let weight = 0, partial = 0, best = -1, cut = 0;
  for (let i = 0; i < 255; i++) {
    weight += hist[i]; if (!weight) continue;
    const other = total - weight; if (!other) break;
    partial += i * hist[i];
    const delta = partial / weight - (sum - partial) / other, variance = weight * other * delta * delta;
    if (variance > best) { best = variance; cut = i; }
  }
  return cut;
}

export function extractInk({ data, width: w, height: h }, handwriting = false) {
  const gray = new Uint8Array(w * h), hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    const p = i * 4;
    gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
    hist[gray[i]]++;
  }
  const median = quantile(hist, w * h, 0.5), dark = quantile(hist, w * h, handwriting ? 0.005 : 0.02);
  if (median - dark < (handwriting ? 14 : 35)) {
    return { blank: true, width: w, height: h, mask: new Uint8Array(w * h), contrast: median - dark };
  }

  const cut = Math.min(otsu(hist, w * h), median - (handwriting ? 14 : 32));
  const binary = new Uint8Array(w * h), seen = new Uint8Array(w * h), rawMask = new Uint8Array(w * h), stack = new Int32Array(w * h);
  
  // ★修正1: マージンを狭くし（2%）、端の近くに書いた「ぬ」や「い」が切れないようにする
  const left = Math.floor(w * 0.02), right = Math.ceil(w * 0.98);
  const top = Math.floor(h * 0.04), bottom = Math.ceil(h * 0.96);

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      binary[y * w + x] = gray[y * w + x] <= cut ? 1 : 0;
    }
  }

  const comps = [];
  let maxCompArea = 0;

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const start = y * w + x;
      if (!binary[start] || seen[start]) continue;
      let n = 0, minX = w, minY = h, maxX = 0, maxY = 0, borderTouches = 0;
      const pixels = [];
      stack[n++] = start; seen[start] = 1;
      while (n) {
        const p = stack[--n], xx = p % w, yy = (p / w) | 0;
        pixels.push(p);
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
        if (xx <= left + 1 || xx >= right - 2 || yy <= top + 1 || yy >= bottom - 2) borderTouches++;
        for (const j of [xx > 0 ? p - 1 : -1, xx < w - 1 ? p + 1 : -1, yy > 0 ? p - w : -1, yy < h - 1 ? p + w : -1]) {
          if (j >= 0 && binary[j] && !seen[j]) { seen[j] = 1; stack[n++] = j; }
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1, area = pixels.length;
      
      // 極小のノイズを除外
      if (area < Math.max(8, w * h * (handwriting ? 0.00012 : 0.0003))) continue;
      // 細長い枠線・罫線ノイズを除外
      if (bw > w * 0.75 && bh < h * 0.05) continue;
      if (bh > h * 0.75 && bw < w * 0.05) continue;
      
      // ★修正2: 端に触れていても、「文字の一部（面積が大きく、端への張り付きが少ないもの）」は絶対に消さない！
      // 端にベッタリ張り付いている影や枠線だけ除外する
      const touchesEdge = (minX <= left + 1 || maxX >= right - 2 || minY <= top + 1 || maxY >= bottom - 2);
      if (touchesEdge) {
        const isEdgeShadow = (borderTouches > area * 0.18) || (area < w * h * 0.0025) || (minX <= left + 1 && maxX >= right - 2) || (minY <= top + 1 && maxY >= bottom - 2);
        if (isEdgeShadow) continue;
      }

      if (area > maxCompArea) maxCompArea = area;
      comps.push({ pixels, minX, maxX, minY, maxY, bw, bh, area, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 });
    }
  }

  // ★修正3: 「やさい」の右上の「・・」のような、メインの文字群から離れた小さなゴミ（外れ値）を除外する
  let mainMinX = w, mainMaxX = 0, mainMinY = h, mainMaxY = 0;
  for (const c of comps) {
    // 最大成分の8%以上の面積があるものを「確実な文字本体」として中心領域を算出
    if (c.area >= maxCompArea * 0.08) {
      if (c.minX < mainMinX) mainMinX = c.minX;
      if (c.maxX > mainMaxX) mainMaxX = c.maxX;
      if (c.minY < mainMinY) mainMinY = c.minY;
      if (c.maxY > mainMaxY) mainMaxY = c.maxY;
    }
  }

  let count = 0;
  for (const c of comps) {
    if (c.area < maxCompArea * 0.08 && mainMinX <= mainMaxX) {
      // 小さな点（「い」の2画目や「や」の点など）は、文字本体の近くにある場合のみ残し、遠くの紙ゴミは捨てる
      const marginX = w * 0.12, marginY = h * 0.08;
      const nearMain = (c.cx >= mainMinX - marginX && c.cx <= mainMaxX + marginX &&
                        c.cy >= mainMinY - marginY && c.cy <= mainMaxY + marginY);
      if (!nearMain) continue;
    }
    for (const p of c.pixels) rawMask[p] = 1;
    count += c.area;
  }

  // 手書きのカスレを埋める膨張処理
  const mask = new Uint8Array(w * h);
  const kept = [];
  if (handwriting && count > 0) {
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const i = y * w + x;
        let hit = rawMask[i];
        if (!hit) {
          for (let dy = -1; dy <= 1 && !hit; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (rawMask[i + dy * w + dx]) { hit = 1; break; }
            }
          }
        }
        if (hit) { mask[i] = 1; kept.push(i); }
      }
    }
  } else {
    for (let i = 0; i < rawMask.length; i++) {
      if (rawMask[i]) { mask[i] = 1; kept.push(i); }
    }
  }

  return {
    blank: kept.length < Math.max(20, w * h * (handwriting ? 0.0006 : 0.0015)),
    width: w, height: h, mask, points: Uint32Array.from(kept), contrast: median - dark
  };
}

export function normalizeInk(ink, degrees = 0) {
  const { width: w, height: h, mask } = ink, rad = degrees * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad), cx = w / 2, cy = h / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let points = ink.points;
  if (!points) {
    const list = [];
    for (let p = 0; p < mask.length; p++) if (mask[p]) list.push(p);
    points = Uint32Array.from(list);
  }
  for (let j = 0; j < points.length; j++) {
    const p = points[j], x = p % w, y = (p / w) | 0;
    const xx = (x - cx) * c - (y - cy) * s, yy = (x - cx) * s + (y - cy) * c;
    if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
    if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
  }
  if (!Number.isFinite(minX)) return null;

  const bw = Math.max(1, maxX - minX + 1), bh = Math.max(1, maxY - minY + 1);
  const out = new Uint8Array(NW * NH), indices = [];
  let count = 0;
  const stepX = bw / (NW - 8), stepY = bh / (NH - 8);
  const rX = Math.max(0.5, stepX * 0.4), rY = Math.max(0.5, stepY * 0.4);

  for (let y = 4; y < NH - 4; y++) {
    for (let x = 4; x < NW - 4; x++) {
      const xx = minX + (x - 4 + 0.5) * stepX, yy = minY + (y - 4 + 0.5) * stepY;
      let hit = 0;
      for (const [dx, dy] of [[0, 0], [-rX, 0], [rX, 0], [0, -rY], [0, rY]]) {
        const sx = Math.round((xx + dx) * c + (yy + dy) * s + cx);
        const sy = Math.round(-(xx + dx) * s + (yy + dy) * c + cy);
        if (sx >= 0 && sy >= 0 && sx < w && sy < h && mask[sy * w + sx]) { hit = 1; break; }
      }
      if (hit) { out[y * NW + x] = 1; indices.push(y * NW + x); count++; }
    }
  }
  return { mask: out, aspect: bw / bh, count, indices: Uint16Array.from(indices) };
}

function distances(mask) {
  const d = new Float32Array(NW * NH);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 8;
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
    const i = y * NW + x;
    if (x) d[i] = Math.min(d[i], d[i - 1] + 1);
    if (y) d[i] = Math.min(d[i], d[i - NW] + 1);
    if (x && y) d[i] = Math.min(d[i], d[i - NW - 1] + 1.4);
  }
  for (let y = NH - 1; y >= 0; y--) for (let x = NW - 1; x >= 0; x--) {
    const i = y * NW + x;
    if (x < NW - 1) d[i] = Math.min(d[i], d[i + 1] + 1);
    if (y < NH - 1) d[i] = Math.min(d[i], d[i + NW] + 1);
    if (x < NW - 1 && y < NH - 1) d[i] = Math.min(d[i], d[i + NW + 1] + 1.4);
  }
  return d;
}

// ★新機能：手書き画像をN文字（2文字・3文字など）の領域に水平分割して、1文字ずつ形状比較する
function splitIntoCharInks(ink, nChars) {
  const { width: w, height: h, mask, points } = ink;
  if (!points || points.length < 20) return null;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const totalW = maxX - minX + 1;
  if (totalW < nChars * 12) return null;

  if (nChars === 1) return [ink];

  // X軸方向のインク密度（射影ヒストグラム）を計算
  const colCounts = new Int32Array(totalW);
  for (let i = 0; i < points.length; i++) {
    colCounts[(points[i] % w) - minX]++;
  }
  // 少し平滑化して文字間の「谷（空白）」を見つけやすくする
  const smooth = new Float32Array(totalW);
  const win = Math.max(2, Math.round(totalW * 0.03));
  for (let x = 0; x < totalW; x++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, x - win); k <= Math.min(totalW - 1, x + win); k++) { s += colCounts[k]; c++; }
    smooth[x] = s / c;
  }

  // 均等分割位置の周辺（±18%）で最もインクが少ない谷間を分割線にする
  const cuts = [minX];
  for (let c = 1; c < nChars; c++) {
    const expected = Math.round((totalW * c) / nChars);
    const searchRadius = Math.round(totalW / (nChars * 2.6));
    let bestX = expected, bestVal = Infinity;
    for (let x = Math.max(4, expected - searchRadius); x <= Math.min(totalW - 5, expected + searchRadius); x++) {
      // 理想位置から離れすぎると少しペナルティを与える
      const penalty = Math.abs(x - expected) * 0.08;
      if (smooth[x] + penalty < bestVal) {
        bestVal = smooth[x] + penalty;
        bestX = x;
      }
    }
    cuts.push(minX + bestX);
  }
  cuts.push(maxX + 1);

  // 分割された各文字のサブインクを生成
  const charInks = [];
  for (let c = 0; c < nChars; c++) {
    const x0 = cuts[c], x1 = cuts[c + 1];
    const subPoints = [];
    const subMask = new Uint8Array(w * h);
    for (let i = 0; i < points.length; i++) {
      const p = points[i], x = p % w;
      if (x >= x0 && x < x1) {
        subMask[p] = 1;
        subPoints.push(p);
      }
    }
    if (subPoints.length < 8) return null; // 空の分割ができたら不採用
    charInks.push({ blank: false, width: w, height: h, mask: subMask, points: Uint32Array.from(subPoints) });
  }
  return charInks;
}

export function prepareReference(word, image, extra = {}) {
  const ink = extractInk(image), shape = normalizeInk(ink);
  return shape ? { word, ...shape, dist: distances(shape.mask), ...extra } : null;
}

export function matchWord(ink, references) {
  if (ink.blank) return { word: null, blank: true, candidates: [] };
  const scores = new Map(), sources = new Map();

  const wordRefs = references.filter(r => !r.isChar);
  const charRefs = [...references.filter(r => r.isChar)];

  // ★登録された手本（handwriting）を1文字ずつに分割し、文字単位の手本としても使えるようにする
  for (const r of wordRefs) {
    if (r.kind === 'handwriting' && r.word.length > 1 && r.word.length <= 5) {
      const subInks = splitIntoCharInks({ width: NW, height: NH, mask: r.mask, points: r.indices }, r.word.length);
      if (subInks) {
        for (let i = 0; i < r.word.length; i++) {
          const norm = normalizeInk(subInks[i], 0);
          if (norm && norm.count >= 8) {
            charRefs.push({ word: r.word[i], char: r.word[i], isChar: true, kind: 'handwriting', ...norm, dist: distances(norm.mask) });
          }
        }
      }
    }
  }

  // 1. 単語全体での形状比較
  for (const angle of [-9, -6, -3, 0, 3, 6, 9]) {
    const a = normalizeInk(ink, angle);
    if (!a || !a.count) continue;
    const ad = distances(a.mask);
    for (const b of wordRefs) {
      let ab = 0, ba = 0;
      for (let j = 0; j < a.indices.length; j++) ab += b.dist[a.indices[j]];
      for (let j = 0; j < b.indices.length; j++) ba += ad[b.indices[j]];
      const shape = (ab / a.count + ba / b.count) / 2;
      const aspect = Math.abs(Math.log(a.aspect / b.aspect));
      // 登録された手本には強力な優先ボーナス（0.78倍）を与える
      const bonus = b.kind === 'handwriting' ? 0.78 : 1.0;
      const score = (shape + aspect * 0.65) * bonus;
      if (score < (scores.get(b.word) ?? Infinity)) {
        scores.set(b.word, score);
        sources.set(b.word, b.kind || 'printed');
      }
    }
  }

  // 2. 1文字ずつ分割しての形状比較
  if (charRefs.length > 0) {
    const charRefMap = new Map();
    for (const r of charRefs) {
      if (!charRefMap.has(r.char)) charRefMap.set(r.char, []);
      charRefMap.get(r.char).push(r);
    }

    const splitCache = new Map();
    const targetWords = [...new Set(wordRefs.map(r => r.word))];

    for (const word of targetWords) {
      const len = word.length;
      if (len < 1 || len > 5) continue;
      if (!splitCache.has(len)) {
        const parts = splitIntoCharInks(ink, len);
        splitCache.set(len, parts ? parts.map(p => {
          const norm = normalizeInk(p, 0);
          return norm && norm.count ? { ...norm, dist: distances(norm.mask) } : null;
        }) : null);
      }
      const normParts = splitCache.get(len);
      if (!normParts || normParts.some(p => !p)) continue;

      let totalCharScore = 0, usedHandwriting = false, valid = true;
      for (let c = 0; c < len; c++) {
        const ch = word[c], cRefs = charRefMap.get(ch);
        if (!cRefs || !cRefs.length) { valid = false; break; }
        const a = normParts[c], ad = a.dist;
        let bestChar = Infinity, bestIsHand = false;
        for (const b of cRefs) {
          let ab = 0, ba = 0;
          for (let j = 0; j < a.indices.length; j++) ab += b.dist[a.indices[j]];
          for (let j = 0; j < b.indices.length; j++) ba += ad[b.indices[j]];
          const shape = (ab / a.count + ba / b.count) / 2;
          const aspect = Math.abs(Math.log(a.aspect / b.aspect));
          const bonus = b.kind === 'handwriting' ? 0.82 : 1.0;
          const s = (shape + aspect * 0.45) * bonus;
          if (s < bestChar) { bestChar = s; bestIsHand = (b.kind === 'handwriting'); }
        }
        totalCharScore += bestChar;
        if (bestIsHand) usedHandwriting = true;
      }

      if (valid) {
        const avgScore = totalCharScore / len;
        if (avgScore < (scores.get(word) ?? Infinity)) {
          scores.set(word, avgScore);
          sources.set(word, usedHandwriting ? 'handwriting' : (sources.get(word) || 'printed'));
        }
      }
    }
  }

  const candidates = [...scores].map(([word, score]) => ({ word, score })).sort((a, b) => a.score - b.score);
  const best = candidates[0], margin = (candidates[1]?.score ?? 99) - (best?.score ?? 99);
  const bestKind = best ? sources.get(best.word) : null;

  const confident = !!best && (
    (bestKind === 'handwriting' && best.score < 1.55 && margin > 0.05) ||
    (best.score < 1.15 && margin > 0.12)
  );
  return {
    word: confident ? best.word : '?',
    blank: false,
    score: best?.score ?? 99,
    margin,
    candidates,
    referenceKind: bestKind
  };
}

export function cleanedCanvas(ink) {
  const out = document.createElement('canvas');
  out.width = 640; out.height = 280;
  const ctx = out.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 640, 280);
  if (ink.blank || !ink.points?.length) return out;

  const { width: w, height: h, mask, points } = ink;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], x = p % w, y = (p / w) | 0;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const bw = Math.max(1, maxX - minX + 1), bh = Math.max(1, maxY - minY + 1);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = bw; srcCanvas.height = bh;
  const sctx = srcCanvas.getContext('2d'), imgData = sctx.createImageData(bw, bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const v = mask[(minY + y) * w + (minX + x)] ? 0 : 255;
      const idx = (y * bw + x) * 4;
      imgData.data[idx] = imgData.data[idx + 1] = imgData.data[idx + 2] = v;
      imgData.data[idx + 3] = 255;
    }
  }
  sctx.putImageData(imgData, 0, 0);

  const scale = Math.min(500 / bw, 170 / bh);
  const dw = bw * scale, dh = bh * scale;
  // Tesseractがクレヨンのかすれに惑わされないよう、わずかにブラーをかけてエッジを滑らかにする
  ctx.filter = 'blur(0.8px)';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(srcCanvas, (640 - dw) / 2, (280 - dh) / 2, dw, dh);
  ctx.filter = 'none';
  return out;
}

let cachedReferences = null, cachedKey = null;
export function browserReferences() {
  const words = allWords(), key = words.join('|');
  if (cachedReferences && cachedKey === key) return cachedReferences;
  cachedKey = key;
  const refs = [];
  const families = [
    '"Hiragino Maru Gothic ProN", "Rounded Mplus 1c", sans-serif',
    '"YuKyokasho", "UD Digi Kyokasho N-R", "Klee", serif',
    '"Hiragino Kaku Gothic ProN", "Hiragino Sans", sans-serif'
  ];

  // 1. 単語全体のリファレンス（標準字間 ＆ 手書き風の広い字間）
  for (const family of families) {
    for (const weight of [400, 700]) {
      for (const word of words) {
        // 字間なし、半角スペース空き、全角スペース空きの3パターンを生成
        const variants = word.length > 1 ? [word, word.split('').join(' '), word.split('').join(' ')] : [word];
        for (const text of variants) {
          const canvas = document.createElement('canvas');
          canvas.width = 440; canvas.height = 170;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 440, 170);
          ctx.fillStyle = 'black';
          ctx.font = `${weight} ${Math.min(82, 320 / text.length)}px ${family}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(text, 220, 85);
          const ref = prepareReference(word, ctx.getImageData(0, 0, 440, 170));
          if (ref) refs.push(ref);
        }
      }
    }
  }

  // 2. 1文字単位のリファレンス（文字分割マッチング用）
  const uniqueChars = [...new Set(words.join('').split(''))];
  for (const family of families) {
    for (const weight of [400, 700]) {
      for (const ch of uniqueChars) {
        const canvas = document.createElement('canvas');
        canvas.width = 180; canvas.height = 180;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 180, 180);
        ctx.fillStyle = 'black';
        ctx.font = `${weight} 96px ${family}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ch, 90, 90);
        const ref = prepareReference(ch, ctx.getImageData(0, 0, 180, 180), { isChar: true, char: ch });
        if (ref) refs.push(ref);
      }
    }
  }

  const unique = new Map();
  for (const ref of refs) {
    const k = (ref.isChar ? 'C:' : 'W:') + ref.word + ref.aspect.toFixed(2) + ref.mask.join('');
    if (!unique.has(k)) unique.set(k, ref);
  }
  cachedReferences = [...unique.values()];
  return cachedReferences;
}

export function extractHandwritingInk(image) {
  const { width: w, height: h, data } = image, gray = new Uint8Array(w * h), integral = new Float64Array((w + 1) * (h + 1)), pixels = new Uint8ClampedArray(data.length), radius = Math.max(12, Math.round(Math.min(w, h) * 0.12));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x, p = i * 4;
      gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
      row += gray[i];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1), y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
      const mean = (integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const i = y * w + x, p = i * 4, v = Math.max(0, Math.min(255, gray[i] - mean + 230));
      pixels[p] = pixels[p + 1] = pixels[p + 2] = v; pixels[p + 3] = 255;
    }
  }
  return extractInk({ width: w, height: h, data: pixels }, true);
}

export function referenceFromShape(word, shape) {
  const mask = Uint8Array.from(shape.mask), indices = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) indices.push(i);
  if (mask.length !== NW * NH || indices.length < 10 || !Number.isFinite(shape.aspect) || shape.aspect <= 0) return null;
  return { word, mask, aspect: shape.aspect, count: indices.length, indices: Uint16Array.from(indices), dist: distances(mask), kind: 'handwriting' };
}

