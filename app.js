import {WORDS,setAliases,meaningOf,allWords,fresh,turn,normalize,homography,project,validQuad,detectCorners,gridRoadRoute,freeRoadRoute,birdFlight} from './core.js';
import {icon,ground} from './art.js';
import {extractInk,extractHandwritingInk,browserReferences,cleanedCanvas} from './recognition.js';
import {recognizePhoto,warmShapeEngine} from './photo-recognition.js';
import {cleanProfile,isHiragana,manualReading,makeSample,sampleReference,addSample,proposeReading,unpackMask} from './handwriting.js';
import {readHiragana} from './hiragana-ocr.js';
const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
let profile=cleanProfile(null);try{profile=cleanProfile(JSON.parse(localStorage.getItem('kotoba-handwriting-v1')));}catch{}setAliases(profile.aliases);
function saveProfile(){try{localStorage.setItem('kotoba-handwriting-v1',JSON.stringify(profile));return true;}catch{return false;}}
const empty=()=>({world:fresh(),cards:Array(16).fill(null),objects:[],scene:[],turn:0,history:[],dirty:false});
let mode='grow',selected='き',erasing=false,sound=true,labels=true,reduced=false;
let focusView=null,nativeView=false,returnScroll=0,returnButton=null;
let states={grow:empty(),free:empty()};
try{const saved=JSON.parse(localStorage.getItem('kotoba-garden-v1'));if(saved?.states?.grow?.world?.length===16&&saved?.states?.free){states=saved.states;mode=saved.mode==='free'?'free':'grow';sound=saved.sound??true;labels=saved.labels??true;reduced=!!saved.reduced;}}catch{}
const state=()=>states[mode];
function save(){try{localStorage.setItem('kotoba-garden-v1',JSON.stringify({states,mode,sound,labels,reduced}));$('saveStatus').textContent='この端末に自動保存';}catch{$('saveStatus').textContent='このブラウザでは保存できません';}}
function speak(word){if(!sound||!('speechSynthesis'in window))return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(word);u.lang='ja-JP';u.rate=.85;speechSynthesis.speak(u);}catch{}}
function message(s,sub){$('status').textContent=s;if(sub!==undefined)$('substatus').textContent=sub;}
function pending(){return mode==='grow'?state().cards.filter(Boolean).length:state().objects.length;}
function render(){
 const s=state();document.body.classList.toggle('reduced',reduced);
 $('growMode').classList.toggle('active',mode==='grow');$('freeMode').classList.toggle('active',mode==='free');$('growMode').setAttribute('aria-pressed',mode==='grow');$('freeMode').setAttribute('aria-pressed',mode==='free');
 $('sound').textContent=sound?'音声 オン':'音声 オフ';$('sound').setAttribute('aria-pressed',sound);$('labels').textContent=labels?'もじを みせる ✓':'もじを みせる';$('labels').setAttribute('aria-pressed',labels);$('reduced').checked=reduced;
 $('focusWords').innerHTML=allWords().map(w=>`<button class="full-word ${selected===w&&!erasing?'selected':''}" data-full-word="${w}" aria-pressed="${selected===w&&!erasing}">${w}</button>`).join('')+`<button class="full-word full-eraser ${erasing?'selected':''}" data-full-word="__erase" aria-pressed="${erasing}">とる</button>`;
 $('words').innerHTML=allWords().map(w=>`<button class="word ${selected===w&&!erasing?'selected':''}" data-word="${w}" aria-pressed="${selected===w&&!erasing}">${w}</button>`).join('');
 $('eraser').classList.toggle('selected',erasing);$('eraser').setAttribute('aria-pressed',erasing);
 const table=$('table');table.className=`board tabletop ${mode==='free'?'free-table':''}`;table.setAttribute('aria-label',mode==='grow'?'カードを置く台紙、４行４列':'自由にカードを置く台');
 table.innerHTML=mode==='grow'?s.cards.map((w,i)=>`<button class="slot ${w?'':'empty'}" data-slot="${i}" aria-label="${Math.floor(i/4)+1}行${i%4+1}列 ${w||'カードなし'}">${w?`<span class="paper-card">${w}</span>`:''}</button>`).join(''):s.objects.map((o,i)=>`<button class="free-card" data-object="${i}" style="left:${o.x*100}%;top:${o.y*100}%" aria-label="${o.word}のカード"><span class="paper-card">${o.word}</span></button>`).join('');
 if(mode==='free')table.tabIndex=0;else table.removeAttribute('tabindex');
 $('count').textContent=`${pending()} まい`;$('turn').textContent=`ターン ${s.turn}`;$('undo').disabled=!s.history.length;$('commit').disabled=!s.dirty||(mode==='grow'&&!pending());$('clear').disabled=!pending();$('photo').disabled=mode==='free';$('photo').title=mode==='free'?'写真は「つづけて そだてる」で使えます':'';
 $('focusCommit').disabled=$('commit').disabled;$('focusUndo').disabled=$('undo').disabled;
 renderWorld();
}
function wordFor(c){if(c.item)return c.itemWord||c.item;if(c.seed)return c.growth===3?'やさい':(c.seedWord||'たね');return c.terrain==='field'?(c.terrainWord||'はたけ'):c.terrain==='road'?(c.terrainWord||'みち'):'';}
function content(c){let a='';if(c.seed)a+=`<span class="picture seed">${icon(c.growth===0?'seed':c.growth===1?'sprout':c.growth===2?'leaf':'vegetable')}</span>`;if(c.item)a+=c.item==='text'?`<span class="word-object">${c.itemWord}</span>`:`<span class="picture">${icon(c.item)}</span>`;const w=wordFor(c);if(w&&c.item!=='text')a+=`<span class="world-label">${w}</span>`;return a;}
function renderWorld(changed=[]){
 cancelWorldMotions();
 const s=state(),el=$('world');el.className=`board world ${mode==='free'?'free-world':''} ${labels?'':'labels-off'}`;
 if(mode==='grow'){el.innerHTML=s.world.map((c,i)=>`<button class="world-cell" data-world="${i}" aria-label="${Math.floor(i/4)+1}行${i%4+1}列 ${wordFor(c)||'くさはら'}"><span class="terrain">${ground(c,i,s.world)}</span>${content(c)}</button>`).join('');for(const i of changed){el.children[i]?.querySelector('.picture')?.classList.add('pop');}}
 else{el.innerHTML=s.scene.map((o,i)=>{const meaning=meaningOf(o.word);let c={terrain:'grass',seed:false,growth:0,item:null};if(meaning==='みち')c.terrain='road';else if(meaning==='はたけ')c.terrain='field';else if(meaning==='たね')c.seed=true;else if(meaning!=='みず')c.item=meaning;c.itemWord=c.terrainWord=c.seedWord=o.word;return `<button class="free-object" data-world="${i}" style="left:${o.x*100}%;top:${o.y*100}%" aria-label="${o.word}"><span class="terrain">${ground(c,0,fresh())}</span>${meaning==='みず'?`<span class="picture">${icon('water')}</span><span class="world-label">${o.word}</span>`:content(c)}</button>`;}).join('');}
 if(mode==='free'){const roads=s.scene.filter(o=>meaningOf(o.word)==='みち');let lines='';for(let a=0;a<roads.length;a++)for(let b=a+1;b<roads.length;b++){const p=roads[a],q=roads[b];if(Math.hypot(p.x-q.x,p.y-q.y)<.30)lines+=`<line x1="${p.x*100}" y1="${p.y*100}" x2="${q.x*100}" y2="${q.y*100}" stroke="#e5cfab" stroke-width="10" stroke-linecap="round"/>`;}if(lines)el.insertAdjacentHTML('afterbegin',`<svg class="road-connections" viewBox="0 0 100 100" aria-hidden="true">${lines}</svg>`);}
 if(!(mode==='grow'?s.world.some(c=>wordFor(c)):s.scene.length))el.insertAdjacentHTML('beforeend',`<div class="empty-world">${icon('sprout')}<span>ここに、せかいが ひろがるよ。</span></div>`);
}
$('words').addEventListener('click',e=>{const w=e.target.closest('[data-word]');if(!w)return;selected=w.dataset.word;erasing=false;speak(selected);render();message(`「${selected}」を どこに おこう？`);});
$('eraser').onclick=()=>{erasing=!erasing;render();message(erasing?'とりたい カードを さわってね。':`「${selected}」を どこに おこう？`);};
$('table').addEventListener('click',e=>{
 const s=state();if(mode==='grow'){const target=e.target.closest('[data-slot]');if(!target)return;s.cards[+target.dataset.slot]=erasing?null:selected;}
 else{const o=e.target.closest('[data-object]');if(o){if(erasing)s.objects.splice(+o.dataset.object,1);else{s.objects[+o.dataset.object].word=selected;}}else if(!erasing){const r=$('table').getBoundingClientRect();s.objects.push({word:selected,x:Math.min(.88,Math.max(.12,(e.clientX-r.left)/r.width)),y:Math.min(.86,Math.max(.14,(e.clientY-r.top)/r.height))});}}
 s.dirty=true;render();save();message(pending()?'ならべたら「せかいを かえる」を おそう。':'すきな ことばを えらんで、カードを おこう。');
});
$('table').addEventListener('keydown',e=>{if(mode==='free'&&e.target===$('table')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(!erasing){state().objects.push({word:selected,x:.5,y:.5});state().dirty=true;render();save();}}});
$('clear').onclick=()=>{const s=state();s.cards=Array(16).fill(null);s.objects=[];s.dirty=true;render();save();message(mode==='grow'?'カードを かたづけたよ。せかいは のこっているよ。':'カードを かたづけたよ。せかいを かえると、えも なくなるよ。');};
$('commit').onclick=()=>{
 const s=state();if(!s.dirty||(mode==='grow'&&!pending()))return;
 const {history,...snapshot}=s;s.history.push(clone(snapshot));if(s.history.length>30)s.history.shift();
 const changed=s.cards.flatMap((w,i)=>w?[i]:[]),words=mode==='grow'?s.cards.filter(Boolean):s.objects.map(o=>o.word);
 if(mode==='grow'){s.world=turn(s.world,s.cards);s.cards=Array(16).fill(null);}else{s.scene=clone(s.objects);}s.turn++;s.dirty=false;
 render();renderWorld(changed);if(focusView==='table')setFocusView('world');save();speak(words[0]||'');message('せかいが かわったよ。さわってみよう。',mode==='grow'?'つぎの カードを おこう。まえの せかいは のこるよ。':'ならべなおすと、また ちがう せかいに なるよ。');
};
$('undo').onclick=()=>{const s=state();if(!s.history.length)return;const snapshot=s.history.pop(),history=s.history;states[mode]={...snapshot,history};render();save();message('ひとつ まえに もどったよ。');};
function switchMode(m){mode=m;erasing=false;render();save();message(m==='grow'?'まえの せかいに、つぎの ことばを おこう。':'すきな ばしょに、カードを おこう。',m==='grow'?'はたけ → たね → みず で、やさいが そだつよ。':'いま ならべた カードが、えに かわるよ。');}
function setFocusView(view){
 cancelWorldMotions();
 if(view&&!focusView){returnScroll=window.scrollY;returnButton=document.activeElement;}
 focusView=view;document.body.dataset.view=view||'';$('focusBar').hidden=!view;
 $('focusTable').setAttribute('aria-pressed',view==='table');$('focusWorld').setAttribute('aria-pressed',view==='world');
 $('focusCommit').hidden=view==='world';$('focusUndo').hidden=view==='world';
 if(!view){requestAnimationFrame(()=>{window.scrollTo(0,returnScroll);returnButton?.focus({preventScroll:true});});}
}
function enterFocus(view){
 setFocusView(view);
 if(!document.fullscreenElement&&document.documentElement.requestFullscreen){nativeView=true;try{const result=document.documentElement.requestFullscreen({navigationUI:'hide'});result?.catch(()=>{nativeView=false;});}catch{nativeView=false;}}
}
function exitFocus(){setFocusView(null);if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});nativeView=false;}
$('expandTable').onclick=()=>enterFocus('table');$('expandWorld').onclick=()=>enterFocus('world');
$('exitFocus').onclick=exitFocus;$('focusTable').onclick=()=>setFocusView('table');$('focusWorld').onclick=()=>setFocusView('world');
$('focusCommit').onclick=()=>$('commit').click();$('focusUndo').onclick=()=>$('undo').click();
$('focusWords').onclick=e=>{const button=e.target.closest('[data-full-word]');if(!button)return;erasing=button.dataset.fullWord==='__erase';if(!erasing){selected=button.dataset.fullWord;speak(selected);}render();};
 document.addEventListener('fullscreenchange',()=>{if(nativeView&&!document.fullscreenElement){nativeView=false;setFocusView(null);}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusView&&!document.querySelector('dialog[open]'))exitFocus();});
$('growMode').onclick=()=>switchMode('grow');$('freeMode').onclick=()=>switchMode('free');
$('sound').onclick=()=>{sound=!sound;if(!sound&&window.speechSynthesis)speechSynthesis.cancel();render();save();};$('labels').onclick=()=>{labels=!labels;render();save();};$('reduced').onchange=e=>{reduced=e.target.checked;document.body.classList.toggle('reduced',reduced);save();};
let timers=new WeakMap();
const activeMotions=new Map();
function cancelWorldMotions(){for(const stop of [...activeMotions.values()])stop();}
function movingPicture(target,picture,positions,duration,kind){
 activeMotions.get(target)?.();
 const world=$('world'),wr=world.getBoundingClientRect(),pr=picture.getBoundingClientRect(),offsetX=wr.left+world.clientLeft,offsetY=wr.top+world.clientTop;
 const center={x:pr.left+pr.width/2-offsetX,y:pr.top+pr.height/2-offsetY},sprite=document.createElement('span');sprite.className='motion-sprite '+kind;sprite.innerHTML=picture.innerHTML;
 Object.assign(sprite.style,{left:(center.x-pr.width/2)+'px',top:(center.y-pr.height/2)+'px',width:pr.width+'px',height:pr.height+'px'});sprite.setAttribute('aria-hidden','true');world.append(sprite);picture.style.visibility='hidden';
 let lastFacing=1;const frames=positions.map((p,i)=>{const next=positions[Math.min(i+1,positions.length-1)],dx=next.x-p.x,dy=next.y-p.y;if(Math.abs(dx)>.5)lastFacing=dx<0?-1:1;const tilt=kind==='bird'&&i>0&&i<positions.length-1?Math.max(-22,Math.min(22,Math.atan2(dy,Math.abs(dx)||1)*180/Math.PI)):0;return {transform:`translate(${p.x-center.x}px,${p.y-center.y}px) scaleX(${lastFacing}) rotate(${tilt}deg)`};});
 const animation=sprite.animate(frames,{duration,easing:'linear',fill:'none'});let stopped=false;
 const stop=()=>{if(stopped)return;stopped=true;animation.onfinish=null;animation.oncancel=null;animation.cancel();sprite.remove();picture.style.visibility='';target.classList.remove('speaking');activeMotions.delete(target);};
 activeMotions.set(target,stop);animation.onfinish=stop;animation.oncancel=stop;
}
function worldPosition(target,picture){const r=$('world').getBoundingClientRect(),p=picture.getBoundingClientRect();return{x:p.left+p.width/2-r.left-$('world').clientLeft,y:p.top+p.height/2-r.top-$('world').clientTop};}
$('world').addEventListener('click',e=>{
 const target=e.target.closest('[data-world]');if(!target)return;const i=+target.dataset.world,c=mode==='grow'?state().world[i]:null,label=c?wordFor(c):state().scene[i]?.word;if(!label)return;const w=meaningOf(label);speak(label);
 activeMotions.get(target)?.();const picture=target.querySelector('.picture:not(.seed)')||target.querySelector('.picture');target.classList.add('speaking');clearTimeout(timers.get(target));
 if(!picture){timers.set(target,setTimeout(()=>target.classList.remove('speaking'),1300));return;}picture.classList.remove('wiggle','fly','drive','pop');void picture.offsetWidth;
 const gentle=reduced||matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!gentle&&w==='とり'){
  const start=worldPosition(target,picture),world=$('world'),pr=picture.getBoundingClientRect(),bounds={minX:pr.width*.65+5,maxX:world.clientWidth-pr.width*.65-5,minY:pr.height*.65+5,maxY:world.clientHeight-pr.height*.65-5};
  const flight=birdFlight(start,bounds);movingPicture(target,picture,flight.points,3000,'bird');return;
 }
 if(!gentle&&w==='くるま'){
  const world=$('world'),start=worldPosition(target,picture);let path=[];
  if(mode==='grow'){
   const ids=gridRoadRoute(state().world,i),width=world.clientWidth/4,height=world.clientHeight/4;
   path=ids.map(j=>({x:start.x+((j%4)-(i%4))*width,y:start.y+(Math.floor(j/4)-Math.floor(i/4))*height}));
  }else{const points=freeRoadRoute(state().scene,state().scene[i]);path=[start,...points.map(p=>({x:p.x*world.clientWidth,y:p.y*world.clientHeight}))];}
  path=path.filter((p,j)=>j===0||Math.hypot(p.x-path[j-1].x,p.y-path[j-1].y)>.5);
  if(path.length>1){const round=[...path,...path.slice(0,-1).reverse()],frames=[];let total=0;
   // Uniform speed along every segment, including corners and the return trip.
   for(let j=1;j<round.length;j++){const a=round[j-1],b=round[j],d=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(d/8));total+=d;for(let n=j===1?0:1;n<=steps;n++)frames.push({x:a.x+(b.x-a.x)*n/steps,y:a.y+(b.y-a.y)*n/steps});}
   movingPicture(target,picture,frames,Math.max(1500,Math.min(18000,total/210*1000)),'car');return;
  }
 }
 if(!gentle)picture.classList.add(w==='くるま'?'drive':'wiggle');
 timers.set(target,setTimeout(()=>{target.classList.remove('speaking');picture.classList.remove('wiggle','drive');},1300));
});
window.addEventListener('resize',cancelWorldMotions);
$('adult').onclick=()=>{renderSamples();$('adultDialog').showModal();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('reset').onclick=()=>{$('resetConfirm').hidden=false;};$('cancelReset').onclick=()=>{$('resetConfirm').hidden=true;};$('doReset').onclick=()=>{states[mode]=empty();$('resetConfirm').hidden=true;$('adultDialog').close();render();save();message('あたらしい せかいを つくろう。');};
// Photos remain in memory only. The four points are the printed grid's corner markers.
let source=null,points=[],crops=[],reviewCards=[],rawReadings=[],shapeResults=[],guesses=[],learnFlags=[],reviewMeanings=[],meaningOverrides={},busy=false,scanId=0;
const cornerNames=['左上','右上','右下','左下'];
const single=()=>$('captureLayout').value==='single';
const handwritten=()=>$('readingMode').value==='handwriting';
$('readingMode').value=profile.readingMode;$('captureLayout').value=profile.layout;
$('photo').onclick=()=>{if(mode==='grow')$('photoDialog').showModal();};
function drawPhoto(){const c=$('photoCanvas'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(source,0,0,c.width,c.height);if(points.length){ctx.strokeStyle='#c96f44';ctx.lineWidth=3;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(points.length===4)ctx.closePath();ctx.stroke();for(let i=0;i<points.length;i++){const p=points[i];ctx.fillStyle='#c96f44';ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='white';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText(i+1,p.x,p.y+4);}}}
function cornerSetup(){
 points=[];crops=[];$('photoDialog').classList.remove('has-review');$('review').hidden=true;$('photoMessage').textContent='';$('recognize').disabled=true;
 $('photoCanvas').setAttribute('aria-label',single()?'カードの四隅を指定する写真':'台紙の四隅を指定する写真');
 $('photoGuide').textContent=single()?'カード１枚を撮影し、紙の四隅を指定してください。台紙やカードへの目印は不要です。':'台紙の上側を写真の上にして、４つの角まで入れて撮影してください。';
 $('photoInstruction').textContent=`${single()?'カード':'台紙'}の左上${single()?'の角':'の目印の中心'}を押してください。`;
 if(!source)return;drawPhoto();
 if(!single()){const c=$('photoCanvas'),suggested=detectCorners(c.getContext('2d').getImageData(0,0,c.width,c.height));if(suggested){points=suggested;drawPhoto();$('recognize').disabled=false;$('photoInstruction').textContent='四隅の候補を確認してください。ずれていれば指定し直せます。';}}
}
$('file').onchange=async e=>{if(busy)return;const f=e.target.files[0];if(!f)return;try{const bitmap=await createImageBitmap(f);source?.close?.();source=bitmap;const c=$('photoCanvas'),scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));c.width=Math.round(bitmap.width*scale);c.height=Math.round(bitmap.height*scale);$('photoArea').hidden=false;cornerSetup();}catch{$('photoMessage').textContent='画像を開けませんでした。JPEGやPNGを選んでください。';}};
$('photoCanvas').onclick=e=>{if(!source||points.length===4||busy)return;const c=$('photoCanvas'),r=c.getBoundingClientRect();points.push({x:(e.clientX-r.left)*c.width/r.width,y:(e.clientY-r.top)*c.height/r.height});drawPhoto();$('review').hidden=true;if(points.length<4)$('photoInstruction').textContent=`${single()?'カードの角':'台紙の目印'}：次は${cornerNames[points.length]}を押してください。`;else{const valid=validQuad(points);$('photoInstruction').textContent=valid?'四隅を指定しました。読み取りを始められます。':'左上→右上→右下→左下の順で指定し直してください。';$('recognize').disabled=!valid;}};
$('cornersReset').onclick=()=>{if(busy)return;points=[];crops=[];$('recognize').disabled=true;$('review').hidden=true;$('photoInstruction').textContent=`${single()?'カードの角':'台紙の目印'}：左上を押してください。`;drawPhoto();};
$('captureLayout').onchange=()=>{profile.layout=$('captureLayout').value;saveProfile();cornerSetup();};
$('readingMode').onchange=()=>{profile.readingMode=$('readingMode').value;saveProfile();$('photoDialog').classList.remove('has-review');$('review').hidden=true;};
function photoInput(){
 const input=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(source.width,source.height));input.width=Math.round(source.width*scale);input.height=Math.round(source.height*scale);
 const ctx=input.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,input.width,input.height);
 return {image:ctx.getImageData(0,0,input.width,input.height),points:points.map(p=>({x:p.x*input.width/$('photoCanvas').width,y:p.y*input.height/$('photoCanvas').height}))};
}
function inkFor(crop,hand=true){const p=crop.getContext('2d').getImageData(0,0,crop.width,crop.height);return hand?extractHandwritingInk(p):extractInk(p);}
function validReview(indices=reviewCards.map((_,i)=>i)){
 return indices.every(i=>reviewCards[i]===null||isHiragana(manualReading(reviewCards[i]||'')));
}
function updateReviewButtons(){
 $('acceptPhoto').disabled=busy||!validReview();$('saveSamples').disabled=busy||!learnFlags.some(Boolean)||!validReview(learnFlags.flatMap((v,i)=>v?[i]:[]));
}
function review(){
 const el=$('reviewGrid');el.innerHTML='';el.classList.toggle('single-review',single());
 $('wordChoices').innerHTML=allWords().map(w=>`<option value="${w}"></option>`).join('');
 for(let i=0;i<crops.length;i++){
  const tile=document.createElement('div');tile.className='review-cell '+(handwritten()&&reviewCards[i]!==null?'provisional':'');
  const caption=document.createElement('small');caption.textContent=single()?'カード１枚':`${Math.floor(i/4)+1}行${i%4+1}列`;tile.append(caption);
  const img=new Image();img.src=crops[i].toDataURL();img.alt=caption.textContent+'の写真';tile.append(img);
  const input=document.createElement('input');input.type='text';input.value=reviewCards[i]&&reviewCards[i]!=='?'?reviewCards[i]:'';input.placeholder=reviewCards[i]===null?'カードなし':'ひらがなを入力';input.maxLength=12;input.setAttribute('list','wordChoices');input.setAttribute('aria-label',caption.textContent+'の読み');input.disabled=busy;input.autocomplete='off';tile.append(input);
  const select=document.createElement('select');select.setAttribute('aria-label',caption.textContent+'のことばを選ぶ');select.disabled=busy;select.innerHTML='<option value="">ことばを選ぶ</option>'+allWords().map(w=>`<option value="${w}">${w}</option>`).join('');tile.append(select);
  const meaning=document.createElement('select');meaning.setAttribute('aria-label',caption.textContent+'の絵');meaning.innerHTML='<option value="text">絵なし（文字だけ）</option>'+WORDS.map(w=>`<option value="${w}">絵：${w}</option>`).join('');meaning.disabled=busy;tile.append(meaning);
  const learn=document.createElement('label');learn.className='learn-sample';const check=document.createElement('input');check.type='checkbox';check.checked=!!learnFlags[i];check.disabled=busy||reviewCards[i]===null;check.setAttribute('aria-label',caption.textContent+'を手本にする');learn.append(check,document.createTextNode('この形を手本にする'));tile.append(learn);
  const reset=document.createElement('button');reset.type='button';reset.className='no-card';reset.textContent='カードなしにする';reset.disabled=busy;tile.append(reset);
  const detail=document.createElement('small');detail.textContent=rawReadings[i]||'';tile.append(detail);
  const refreshMeaning=()=>{const w=manualReading(input.value);meaning.hidden=!isHiragana(w)||WORDS.includes(w);meaning.value=meaningOverrides[w]??profile.aliases[w]??reviewMeanings[i]??'text';};
  const edited=()=>{const value=manualReading(input.value);reviewCards[i]=value||'?';learnFlags[i]=true;check.checked=true;check.disabled=busy;reviewMeanings[i]=profile.aliases[value]||'text';refreshMeaning();tile.classList.add('corrected');updateReviewButtons();};
  input.oninput=edited;input.onblur=()=>{input.value=manualReading(input.value);input.setAttribute('aria-invalid',input.value&&!isHiragana(input.value)?'true':'false');};
  select.onchange=()=>{if(!select.value)return;input.value=select.value;edited();};
  check.onchange=()=>{learnFlags[i]=check.checked;updateReviewButtons();};
  meaning.onchange=()=>{meaningOverrides[manualReading(input.value)]=meaning.value;reviewMeanings[i]=meaning.value;review();};
  reset.onclick=()=>{reviewCards[i]=null;learnFlags[i]=false;input.value='';input.placeholder='カードなし';check.checked=false;check.disabled=true;meaning.hidden=true;tile.classList.remove('corrected');updateReviewButtons();};
  const alternatives=document.createElement('div');alternatives.className='reading-candidates';for(const word of guesses[i]?.alternatives||[]){if(!isHiragana(word)||word===reviewCards[i])continue;const button=document.createElement('button');button.type='button';button.textContent=word;button.disabled=busy;button.onclick=()=>{input.value=word;edited();};alternatives.append(button);}tile.append(alternatives);
  refreshMeaning();el.append(tile);
 }
 $('photoDialog').classList.add('has-review');$('review').hidden=false;$('singlePlacement').hidden=!single();updateReviewButtons();
 $('ocrRetry').hidden=!crops.length;$('ocrRetry').disabled=busy;$('shapeRetry').disabled=busy;$('showPhotoBounds').disabled=busy;
}
$('showPhotoBounds').onclick=()=>{$('photoDialog').classList.remove('has-review');$('photoArea').scrollIntoView({block:'start'});};
$('shapeRetry').onclick=()=>$('recognize').click();
const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
function photoBusy(value){busy=value;for(const id of ['recognize','cornersReset','file','readingMode','captureLayout'])$(id).disabled=value;$('progress').hidden=!value;if(!value)$('stopOcr').hidden=true;}
function stopScan(){scanId++;photoBusy(false);if(crops.length)review();$('photoMessage').textContent='文字認識を止めました。仮の候補から選ぶか、読みを入力できます。';}
$('stopOcr').onclick=stopScan;$('photoDialog').addEventListener('close',()=>{if(busy)stopScan();});
async function applyOcr(indices,id){
 let failures=0;$('stopOcr').hidden=false;
 for(let n=0;n<indices.length;n++){
  if(id!==scanId)return;
  const i=indices[n];$('photoMessage').textContent=`平仮名として文字認識しています（${n+1}/${indices.length}）。初回は日本語データの準備に時間がかかります。`;
  let readings=[];try{readings=await readHiragana(crops[i],{handwriting:handwritten()});}catch{failures++;}
  if(id!==scanId)return;
  const proposal=proposeReading(readings,shapeResults[i]);guesses[i]=proposal;reviewCards[i]=proposal.word;rawReadings[i]=proposal.word?`仮の読み：${proposal.word==='?'?'未読':proposal.word} ／ ${proposal.source}`:'';
  $('progress').value=n+1;await nextFrame();
 }
 if(failures)$('photoMessage').textContent='文字認識を使えないマスがありました。形からの仮候補を出しています。選択・入力で直せます。';
 else $('photoMessage').textContent='仮の読み取りが終わりました。大人が写真と見比べ、選択・入力で直してから確定してください。';
}
$('recognize').onclick=async()=>{
 if(busy||!validQuad(points))return;$('photoDialog').classList.remove('has-review');const id=++scanId,hand=handwritten();photoBusy(true);$('progress').max=single()?1:16;$('progress').value=0;$('review').hidden=true;reviewCards=[];rawReadings=[];shapeResults=[];guesses=[];learnFlags=[];reviewMeanings=[];meaningOverrides={};crops=[];
 try{
  $('photoMessage').textContent='写真を補正して文字の形を調べています。';await nextFrame();const started=performance.now(),input=photoInput(),refs=hand?[...browserReferences(),...profile.samples.map(sampleReference).filter(Boolean)]:browserReferences();
  await recognizePhoto(input.image,input.points,refs,(i,image,result)=>{
   if(id!==scanId)return;const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);crops[i]=c;shapeResults[i]=result;
   const proposal=hand?proposeReading([],result):{word:result.word,source:'形の照合',alternatives:result.candidates.map(c=>c.word).slice(0,3)};guesses[i]=proposal;reviewCards[i]=proposal.word;learnFlags[i]=false;reviewMeanings[i]='text';rawReadings[i]=result.blank?'':hand?`仮の読み：${proposal.word==='?'?'未読':proposal.word} ／ ${proposal.source}`:`形の照合：${result.word}`;$('progress').value=i+1;
  },{single:single(),handwriting:hand});
  if(id!==scanId)return;
  const indices=hand?shapeResults.flatMap((r,i)=>!r.blank&&!(r.referenceKind==='handwriting'&&r.word&&r.word!=='?')?[i]:[]):[];
  if(indices.length){review();$('progress').max=indices.length;$('progress').value=0;await applyOcr(indices,id);}
  else $('photoMessage').textContent=hand?'手本との照合が終わりました。仮の読みを確認して確定してください。':`照合が終わりました（${((performance.now()-started)/1000).toFixed(1)}秒）。写真と見比べて確認してください。`;
 }catch(e){if(id===scanId)$('photoMessage').textContent='読み取りを完了できませんでした。表示された写真の読みを入力できます。';}
 finally{if(id===scanId){photoBusy(false);if(crops.length)review();}}
};
$('ocrRetry').onclick=async()=>{if(busy)return;const indices=reviewCards.flatMap((v,i)=>v!==null?[i]:[]);if(!indices.length)return;const id=++scanId;photoBusy(true);$('progress').max=indices.length;$('progress').value=0;review();try{await applyOcr(indices,id);}finally{if(id===scanId){photoBusy(false);review();}}};
function commitReview(registerOnly){
 if(busy)return;const indices=registerOnly?learnFlags.flatMap((v,i)=>v?[i]:[]):reviewCards.map((_,i)=>i);if(!indices.length||!validReview(indices))return;
 const previous=clone(profile);let saved=0,skipped=0;
 try{
  for(const i of indices){if(reviewCards[i]===null)continue;const word=manualReading(reviewCards[i]);reviewCards[i]=word;if(!WORDS.includes(word))profile.aliases[word]=meaningOverrides[word]??profile.aliases[word]??reviewMeanings[i]??'text';
   if(learnFlags[i]){const sample=makeSample(word,inkFor(crops[i]));if(sample){const before=profile.samples.length;profile.samples=addSample(profile.samples,sample);if(profile.samples.length>before)saved++;}else skipped++;}
  }
  if(!saveProfile())throw Error('このブラウザでは手本を保存できませんでした。');setAliases(profile.aliases);
 }catch(e){profile=previous;setAliases(profile.aliases);$('photoMessage').textContent=e.message;return;}
 renderSamples();
 if(registerOnly){$('photoMessage').textContent=(saved?`手本を${saved}枚保存しました。`:skipped?'保存できる文字の形がありませんでした。':'同じ形の手本が登録済みです。')+(skipped?`文字の形を取り出せなかった${skipped}枚は保存していません。`:'');learnFlags=learnFlags.map(()=>false);review();render();return;}
 if(mode!=='grow'){$('photoMessage').textContent='台紙のモードに戻ってから取り込んでください。';return;}
 if(single()){state().cards[+$('singleTarget').value]=reviewCards[0]||null;}else state().cards=reviewCards.map(x=>x||null);
 state().dirty=true;$('photoDialog').close();render();save();message(`カードを おいたよ。${saved?'手本も '+saved+'まい おぼえたよ。':''}`,skipped?`${skipped}枚は文字の形を取り出せず、手本に保存していません。`:'せかいを かえてみよう。');
}
$('acceptPhoto').onclick=()=>commitReview(false);$('saveSamples').onclick=()=>commitReview(true);
function renderSamples(){
 const list=$('sampleList');list.innerHTML='';$('sampleCount').textContent=`保存した手本：${profile.samples.length}枚（このブラウザ内）`;
 if(!profile.samples.length){list.textContent='まだ手本はありません。写真の読みを直し「この形を手本にする」を選んで保存してください。';return;}
 for(const sample of profile.samples){const row=document.createElement('div');row.className='saved-sample';const canvas=document.createElement('canvas');canvas.width=96;canvas.height=48;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(96,48),mask=unpackMask(sample.mask);for(let i=0;i<mask.length;i++){const v=mask[i]?0:255;pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=v;pixels.data[i*4+3]=255;}ctx.putImageData(pixels,0,0);const label=document.createElement('span');label.textContent=sample.word;const remove=document.createElement('button');remove.textContent='この手本を削除';remove.className='quiet';remove.onclick=()=>{const old=profile.samples;profile.samples=old.filter(s=>s.id!==sample.id);if(!saveProfile()){profile.samples=old;return;}renderSamples();};row.append(canvas,label,remove);list.append(row);}
}
$('singleTarget').innerHTML=Array.from({length:16},(_,i)=>`<option value="${i}">${Math.floor(i/4)+1}行${i%4+1}列</option>`).join('');
cornerSetup();renderSamples();render();
const warmRecognition=()=>{try{warmShapeEngine(browserReferences());}catch{}};
if('requestIdleCallback'in window)requestIdleCallback(warmRecognition,{timeout:2000});else setTimeout(warmRecognition,900);
