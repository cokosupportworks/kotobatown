// Plan wrapping using actual glyph widths. A one-character last line uses one smaller line.
export function planCardText(text,width,height,maxSize,measure){
 const chars=Array.from(text),lineHeight=1.18;
 const wrap=size=>{const lines=[''];for(const c of chars){const last=lines.length-1;if(lines[last]&&measure(lines[last]+c,size)>width)lines.push(c);else lines[last]+=c;}return lines;};
 for(let size=maxSize;size>=1;size-=.5){
  const lines=wrap(size);
  if(lines.length>1&&Array.from(lines.at(-1)).length===1){
   const fontSize=Math.max(.5,Math.min(maxSize,width/(measure(text,1)||1),height/lineHeight));
   return {lines:[text],fontSize:Math.floor(fontSize*10)/10};
  }
  if(lines.length*size*lineHeight<=height&&lines.every(l=>measure(l,size)<=width))return {lines,fontSize:size};
 }
 return {lines:[text],fontSize:Math.max(.1,Math.min(width/(measure(text,1)||1),height/lineHeight))};
}
let context;
export function fitCardTexts(root=document){
 context??=document.createElement('canvas').getContext('2d');
 for(const el of root.querySelectorAll('.paper-card,.word,.full-word:not(.full-eraser),.word-object,.world-label')){
  if(!el.getClientRects().length)continue;
  const text=el.dataset.cardText||el.textContent.trim();if(!text)continue;el.dataset.cardText=text;
  el.style.fontSize='';const cs=getComputedStyle(el),n=v=>parseFloat(v)||0;
  const width=el.clientWidth-n(cs.paddingLeft)-n(cs.paddingRight)-2,height=el.clientHeight-n(cs.paddingTop)-n(cs.paddingBottom)-2;if(width<=0||height<=0)continue;
  const measure=(s,size)=>{context.font=`${cs.fontWeight} ${size}px ${cs.fontFamily}`;return context.measureText(s).width;};
  const plan=planCardText(text,width,height,n(cs.fontSize),measure);
  let label=el.querySelector('.fitted-text');if(!label){label=document.createElement('span');label.className='fitted-text';el.replaceChildren(label);}label.textContent=plan.lines.join('\n');el.style.fontSize=plan.fontSize+'px';
 }
}
