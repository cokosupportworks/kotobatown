import {HIRAGANA,isHiragana} from './handwriting.js';
import {normalize} from './core.js';
import {extractInk,extractHandwritingInk,cleanedCanvas} from './recognition.js';
let scriptPromise=null,workerPromise=null;
async function getWorker(onProgress){
 if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('文字認識をダウンロードできませんでした。'));document.head.append(s);}).catch(e=>{scriptPromise=null;throw e;});
 await scriptPromise;
 if(!workerPromise)workerPromise=Tesseract.createWorker('jpn',1,{logger:m=>onProgress?.(m.status)}).then(async w=>{await w.setParameters({tessedit_char_whitelist:HIRAGANA,preserve_interword_spaces:'0'});return w;}).catch(e=>{workerPromise=null;throw e;});
 return workerPromise;
}
// hiragana-ocr.js の recognizeHiragana 関数を以下に置き換え

async function recognizeHiragana(crop, { handwriting = true, onProgress } = {}) {
  const worker = await getWorker(onProgress);
  const ctx = crop.getContext('2d');
  const pixels = ctx.getImageData(0, 0, crop.width, crop.height);
  const ink = handwriting ? extractHandwritingInk(pixels) : extractInk(pixels);
  const clean = cleanedCanvas(ink);
  const readings = [];

  // PSM 7(単一行: 字間が広い手書きに強い), PSM 8(単一単語), PSM 6(ブロック) の順で試す
  for (const [image, psm] of [[clean, '7'], [clean, '8'], [crop, '6']]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(image);
    const text = normalize(data.text || '');
    if (isHiragana(text)) {
      readings.push({ text, confidence: data.confidence || 0 });
    }
    if (readings.some(r => r.confidence >= 75)) break;
  }
  return readings;
}



let serial=Promise.resolve();
export function readHiragana(crop,options={}){const task=serial.then(()=>recognizeHiragana(crop,options));serial=task.catch(()=>{});return task;}
