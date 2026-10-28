import {japanSnapshotFilename} from './snapshot-model.js';
let libraryPromise;
function renderer(){if(window.html2canvas)return Promise.resolve(window.html2canvas);return libraryPromise??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('./html2canvas.min.js',import.meta.url).href;s.onload=()=>resolve(window.html2canvas);s.onerror=()=>{libraryPromise=null;reject(Error('画像保存の準備ができませんでした。'));};document.head.append(s);});}
// html2canvas clips transformed inline labels in WebKit. Capture the artwork
// without its text, then draw every complete fitted line using Canvas text.
function textRuns(board){
 const origin=board.getBoundingClientRect();
 return [...board.querySelectorAll('.fitted-text')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>{
  const p=el.parentElement,r=el.getBoundingClientRect(),cs=getComputedStyle(el),ps=getComputedStyle(p),m=new DOMMatrix(ps.transform==='none'?undefined:ps.transform);
  return {lines:el.textContent.split('\n'),x:r.left+r.width/2-origin.left,y:r.top+r.height/2-origin.top,font:cs.font,fontSize:parseFloat(cs.fontSize),weight:cs.fontWeight,family:cs.fontFamily,color:cs.color,angle:Math.atan2(m.b,m.a),width:Math.max(1,p.clientWidth-parseFloat(ps.paddingLeft)-parseFloat(ps.paddingRight)-2)};
 });
}
export function paintSnapshotText(canvas,runs,width,height){const ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(canvas.width/width,0,0,canvas.height/height,0,0);ctx.textAlign='center';ctx.textBaseline='middle';for(const r of runs){ctx.save();ctx.translate(r.x,r.y);ctx.rotate(r.angle);ctx.font=`${r.weight} ${r.fontSize}px ${r.family}`;ctx.fillStyle=r.color;const step=r.fontSize*1.18;for(let i=0;i<r.lines.length;i++)ctx.fillText(r.lines[i],0,(i-(r.lines.length-1)/2)*step,r.width);ctx.restore();}ctx.restore();}
export function composeSnapshots(canvases,side=1600){const out=document.createElement('canvas'),gap=canvases.length>1?24:0;out.width=side*canvases.length+gap*(canvases.length-1);out.height=side;const ctx=out.getContext('2d');ctx.fillStyle='#f7f5ec';ctx.fillRect(0,0,out.width,out.height);canvases.forEach((c,i)=>ctx.drawImage(c,0,0,c.width,c.height,i*(side+gap),0,side,side));return out;}
export function setupSnapshot({view,beforeCapture,prepareCards}){
 const dialog=document.getElementById('snapshotDialog'),preview=document.getElementById('snapshotPreview'),save=document.getElementById('snapshotSave'),share=document.getElementById('snapshotShare'),status=document.getElementById('snapshotStatus');let url=null,file=null,busy=false;
 dialog.addEventListener('close',()=>{preview.removeAttribute('src');if(url)URL.revokeObjectURL(url);url=null;file=null;});
 async function capture(){if(busy)return;busy=true;let restoreCards=()=>{};const buttons=[...document.querySelectorAll('[data-snapshot]')];buttons.forEach(b=>b.disabled=true);preview.hidden=true;save.hidden=true;share.hidden=true;status.textContent='スクリーンショットを作成しています…';dialog.showModal();
  try{beforeCapture();const render=await renderer();await document.fonts?.ready;const ids=view()==='table'?['table']:view()==='world'?['world']:['table','world'];const canvases=[];if(ids.includes('table'))restoreCards=prepareCards?.()||(()=>{});
   for(const id of ids){const element=document.getElementById(id);await Promise.all([...element.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));const rect=element.getBoundingClientRect(),runs=textRuns(element);
    const canvas=await render(element,{backgroundColor:null,width:rect.width,height:rect.height,scale:1600/rect.width,logging:false,useCORS:true,ignoreElements:el=>el.classList.contains('empty-world'),scrollX:window.scrollX,scrollY:window.scrollY,onclone:doc=>{const style=doc.createElement('style');style.textContent='*{animation:none!important;transition:none!important}.board .fitted-text{visibility:hidden!important}';doc.head.append(style);}});
    paintSnapshotText(canvas,runs,rect.width,rect.height);canvases.push(canvas);
   }
   const out=composeSnapshots(canvases);
   const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw Error('画像を作れませんでした。');if(!dialog.open)return;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(blob);file=new File([blob],japanSnapshotFilename(),{type:'image/png'});preview.src=url;preview.hidden=false;save.hidden=false;save.href=url;save.download=file.name;share.hidden=!navigator.canShare?.({files:[file]});status.textContent='画像を確認し、保存してください。iPadでは共有から「画像を保存」も使えます。';
  }catch(e){status.textContent=e.message||'画像を保存できませんでした。';}finally{restoreCards();busy=false;buttons.forEach(b=>b.disabled=false);}
 }
 share.onclick=async()=>{try{await navigator.share({files:[file]});}catch(e){if(e.name!=='AbortError')status.textContent='共有できませんでした。「画像をダウンロード」か、画像の長押しで保存してください。';}};
 document.querySelectorAll('[data-snapshot]').forEach(b=>b.onclick=capture);
}
