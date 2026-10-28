import {normalize,WORDS,allWords} from './core.js';
import {normalizeInk,referenceFromShape} from './recognition.js';
export const HIRAGANA=Array.from({length:0x3096-0x3041+1},(_,i)=>String.fromCharCode(0x3041+i)).join('')+'ー';
export const isHiragana=word=>typeof word==='string'&&/^[ぁ-ゖー]{1,12}$/.test(word);
export function manualReading(text){return text.normalize('NFKC').trim().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));}
export function packMask(mask){const bytes=new Uint8Array(Math.ceil(mask.length/8));for(let i=0;i<mask.length;i++)if(mask[i])bytes[i>>3]|=1<<(i%8);return btoa(String.fromCharCode(...bytes));}
export function unpackMask(encoded){const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));if(bytes.length!==576)throw Error('手本の形式が違います');return Uint8Array.from({length:4608},(_,i)=>(bytes[i>>3]>>(i%8))&1);}
export function makeSample(word,ink){
 word=manualReading(word);if(!isHiragana(word)||ink.blank)return null;const shape=normalizeInk(ink);if(!shape||shape.count<10)return null;
 return {id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),word,aspect:shape.aspect,mask:packMask(shape.mask)};
}
export function sampleReference(sample){try{if(!isHiragana(sample.word))return null;return referenceFromShape(sample.word,{aspect:sample.aspect,mask:unpackMask(sample.mask)});}catch{return null;}}
export function addSample(samples,sample){
 if(!sample||!sampleReference(sample))throw Error('文字の形を手本にできませんでした。');
 if(samples.some(s=>s.word===sample.word&&s.mask===sample.mask&&Math.abs(s.aspect-sample.aspect)<.001))return samples;
 if(samples.filter(s=>s.word===sample.word).length>=20)throw Error('このことばの手本は20枚です。おとなのメニューで整理してください。');
 if(samples.length>=200)throw Error('手本は合計200枚です。おとなのメニューで整理してください。');
 return [...samples,sample];
}
export function cleanProfile(value) {
  const p = {
    samples: [],
    aliases: {},
    readingMode: value?.readingMode === 'print' ? 'print' : 'handwriting',
    layout: value?.layout === 'single' ? 'single' : 'board'
  };
  for (const [word, meaning] of Object.entries(value?.aliases || {})) {
    if (isHiragana(word) && (WORDS.includes(meaning) || meaning === 'text') && !WORDS.includes(word)) {
      p.aliases[word] = meaning;
    }
  }
  if (Array.isArray(value?.samples)) {
    p.samples = value.samples.filter(s => s && typeof s.id === 'string' && sampleReference(s)).slice(0, 200);
    // ★追加：手本に登録されている言葉（例：「やさい」）が aliases に漏れていたら自動で登録する
    for (const s of p.samples) {
      if (!WORDS.includes(s.word) && !p.aliases[s.word]) {
        p.aliases[s.word] = 'text';
      }
    }
  }
  return p;
}

function closestKnownWord(text, shapeCandidates = []) {
  const known = [...new Set([...allWords(), ...shapeCandidates.map(c => c.word)])];
  if (known.includes(text)) return text;

  // 編集距離（レーベンシュタイン距離）を計算
  function editDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  let best = null, bestDist = Infinity;
  for (const w of known) {
    const d = editDistance(text, w);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  // 1文字違い（例：「やきい」と「やさい」）、または形の候補上位と共通文字がある場合は既知語に補正
  if (best && bestDist === 1 && text.length >= 2) return best;
  
  // 「しいい」のように同じ文字が連続するOCR特有の誤読で、「い」が含まれている場合、形の第1候補に「い」があればそちらを優先
  const topShape = shapeCandidates[0]?.word;
  if (topShape && bestDist <= 2 && [...text].some(ch => topShape.includes(ch))) {
    return topShape;
  }
  return text;
}

export function proposeReading(readings, shape) {
  const shapeWords = (shape?.candidates || []).map(c => c.word).filter(isHiragana);

  // 1. 形の照合で確定している場合（手本または高信頼度のフォント一致）
  if (shape?.word && shape.word !== '?') {
    return {
      word: shape.word,
      source: shape.referenceKind === 'handwriting' ? '手本の形から' : '形の照合から',
      alternatives: shapeWords.slice(0, 3)
    };
  }
  if (shape?.blank) return { word: null, source: 'カードなし', alternatives: [] };

  // 2. 手本にそこそこ近い形がある場合（スコア1.85未満）は、OCRの誤読より手本を最優先する
  const bestCandidate = shape?.candidates?.[0];
  if (shape?.referenceKind === 'handwriting' && bestCandidate && bestCandidate.score < 1.85) {
    return {
      word: bestCandidate.word,
      source: '手本に近い形から',
      alternatives: shapeWords.slice(0, 3)
    };
  }

  // 3. OCR結果の評価（手本候補や既知語を使って「やきい」→「やさい」に自動補正）
  const texts = readings
    .map(r => ({ ...r, text: closestKnownWord(normalize(r.text || ''), shape?.candidates || []) }))
    .filter(r => isHiragana(r.text) && (r.confidence || 0) >= 45)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  if (texts.length) {
    const ocrWord = texts[0].text;
    // もしOCR結果が未知の言葉（例：「しいい」）で、かつ形の照合の第1候補が既知の言葉（スコア1.7未満）なら、形の照合を優先する
    const known = allWords();
    if (!known.includes(ocrWord) && bestCandidate && bestCandidate.score < 1.7) {
      return {
        word: bestCandidate.word,
        source: shape?.referenceKind === 'handwriting' ? '手本に近い形から' : '形の近さから',
        alternatives: [...new Set([ocrWord, ...shapeWords])].slice(0, 3)
      };
    }
    return {
      word: ocrWord,
      source: '文字認識から',
      alternatives: [...new Set([...texts.map(t => t.text), ...shapeWords])].slice(0, 3)
    };
  }

  // 4. OCRで読めなかった場合は、形の照合の第1候補を出す
  return {
    word: shapeWords[0] || '?',
    source: shapeWords.length ? (shape?.referenceKind === 'handwriting' ? '手本に近い形から（仮）' : '形の近さから（仮）') : '読みを入力してください',
    alternatives: shapeWords.slice(0, 3)
  };
}
