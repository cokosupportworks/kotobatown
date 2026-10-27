import {normalize,WORDS} from './core.js';
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
export function cleanProfile(value){
 const p={samples:[],aliases:{},readingMode:value?.readingMode==='print'?'print':'handwriting',layout:value?.layout==='single'?'single':'board'};
 for(const [word,meaning]of Object.entries(value?.aliases||{}))if(isHiragana(word)&&(WORDS.includes(meaning)||meaning==='text')&&!WORDS.includes(word))p.aliases[word]=meaning;
 if(Array.isArray(value?.samples))p.samples=value.samples.filter(s=>s&&typeof s.id==='string'&&sampleReference(s)).slice(0,200);
 return p;
}
export function proposeReading(readings,shape){
 if(shape?.referenceKind==='handwriting'&&shape.word&&shape.word!=='?')return {word:shape.word,source:'手本の形から',alternatives:shape.candidates.map(c=>c.word).slice(0,3)};
 const texts=readings.map(r=>({...r,text:normalize(r.text||'')})).filter(r=>isHiragana(r.text)).sort((a,b)=>(b.confidence||0)-(a.confidence||0));
 if(texts.length)return {word:texts[0].text,source:'文字認識から',alternatives:[...new Set([...texts.map(t=>t.text),...(shape?.candidates||[]).map(c=>c.word)])].slice(0,3)};
 if(shape?.blank)return {word:null,source:'カードなし',alternatives:[]};
 const words=(shape?.candidates||[]).map(c=>c.word).filter(isHiragana);
 return {word:words[0]||'?',source:words.length?(shape?.referenceKind==='handwriting'?'手本に近い形から（仮）':'形の近さから（文字認識では読めず）'):'読みを入力してください',alternatives:words.slice(0,3)};
}
