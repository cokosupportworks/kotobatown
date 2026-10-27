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
async function recognizeHiragana(crop,{handwriting=true,onProgress}={}){
 const worker=await getWorker(onProgress),ctx=crop.getContext('2d'),pixels=ctx.getImageData(0,0,crop.width,crop.height),ink=handwriting?extractHandwritingInk(pixels):extractInk(pixels),clean=cleanedCanvas(ink),readings=[];
 for(const [image,psm]of [[clean,'8'],[crop,'13']]){
  await worker.setParameters({tessedit_pageseg_mode:psm});const {data}=await worker.recognize(image);const text=normalize(data.text||'');if(isHiragana(text))readings.push({text,confidence:data.confidence||0});
  if(readings.some(r=>r.confidence>=80))break;
 }
 return readings;
}

let serial=Promise.resolve();
export function readHiragana(crop,options={}){const task=serial.then(()=>recognizeHiragana(crop,options));serial=task.catch(()=>{});return task;}
