import {presetPCM,wavBlob} from './audio-tools.js';
let context;
export function audioContext(){const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)throw Error('このブラウザでは音の編集を利用できません。');return context??=new C();}
export async function unlockAudio(){const c=audioContext();if(c.state==='suspended')await c.resume();return c;}
const dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('kotoba-audio-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('sounds',{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});dbPromise.catch(()=>{});
async function request(mode,action){const db=await dbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction('sounds',mode),r=action(tx.objectStore('sounds'));let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('保存できませんでした'));});}
export function createAudioEngine({onError=()=>{}}={}){
 const library=new Map(),cache=new Map(),active=new Map();let enabled=true;
 const ready=request('readonly',s=>s.getAll()).then(rows=>{for(const row of rows)if(row.blob instanceof Blob)library.set(row.id,row);}).catch(()=>onError('効果音の保存領域を開けませんでした。'));
 async function getBuffer(id){if(cache.has(id))return cache.get(id);const c=audioContext();let b;if(id.startsWith('builtin:')){const p=presetPCM(id.slice(8));b=c.createBuffer(1,p.samples.length,p.sampleRate);b.copyToChannel(p.samples,0);}else{await ready;const row=library.get(id.slice(6));if(!row)throw Error('保存した効果音が見つかりません。');b=await c.decodeAudioData(await row.blob.arrayBuffer());}if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(id,b);return b;}
 function play(key,id,{loop=false,volume=.45}={}){active.get(key)?.stop();let source,gain,stopped=false;const handle={stop(){stopped=true;try{source?.stop();}catch{}source?.disconnect();gain?.disconnect();if(active.get(key)===handle)active.delete(key);},motionEnd(){if(loop)handle.stop();}};if(!enabled||id==='none')return handle;active.set(key,handle);
 (async()=>{try{const c=await unlockAudio(),buffer=await getBuffer(id);if(stopped||!enabled)return;source=c.createBufferSource();gain=c.createGain();source.buffer=buffer;source.loop=loop;gain.gain.value=Math.max(0,Math.min(1,volume));source.connect(gain).connect(c.destination);source.onended=()=>{source.disconnect();gain.disconnect();if(active.get(key)===handle)active.delete(key);};source.start();}catch(e){handle.stop();onError(e.message||'音を再生できませんでした。');}})();return handle;}
 const stopAll=()=>{for(const h of [...active.values()])h.stop();};
 async function add(name,blob){const id=crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),row={id,name:String(name).slice(0,60)||'効果音',blob};await request('readwrite',s=>s.put(row));library.set(id,row);return 'audio:'+id;}
 return {library,ready,getBuffer,play,add,stopAll,setEnabled(v){enabled=!!v;if(!enabled)stopAll();},async addPCM(name,samples,sr){return add(name,wavBlob(samples,sr));}};
}
