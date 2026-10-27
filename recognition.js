// Whole-word shape matching. No individual kana are identified or reassembled.
import { WORDS,allWords } from './core.js';
const NW=96,NH=48;
function quantile(hist,total,q){let n=0;for(let i=0;i<256;i++){n+=hist[i];if(n>=total*q)return i;}return 255;}
function otsu(hist,total){let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let weight=0,partial=0,best=-1,cut=0;for(let i=0;i<255;i++){weight+=hist[i];if(!weight)continue;const other=total-weight;if(!other)break;partial+=i*hist[i];const delta=partial/weight-(sum-partial)/other,variance=weight*other*delta*delta;if(variance>best){best=variance;cut=i;}}return cut;}
export function extractInk({data,width:w,height:h},handwriting=false){
 const gray=new Uint8Array(w*h),hist=new Uint32Array(256);for(let i=0;i<gray.length;i++){const p=i*4;gray[i]=Math.round(.299*data[p]+.587*data[p+1]+.114*data[p+2]);hist[gray[i]]++;}
 const median=quantile(hist,w*h,.5),dark=quantile(hist,w*h,handwriting?.005:.02);
 if(median-dark<(handwriting?18:35))return {blank:true,width:w,height:h,mask:new Uint8Array(w*h),contrast:median-dark};
 const cut=Math.min(otsu(hist,w*h),median-(handwriting?15:32)),binary=new Uint8Array(w*h),seen=new Uint8Array(w*h),mask=new Uint8Array(w*h),stack=new Int32Array(w*h);
 const left=Math.floor(w*.04),right=Math.ceil(w*.96),top=Math.floor(h*.10),bottom=Math.ceil(h*.90);
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)binary[y*w+x]=gray[y*w+x]<=cut?1:0;
 let count=0;const kept=[];
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
  const start=y*w+x;if(!binary[start]||seen[start])continue;let n=0,minX=w,minY=h,maxX=0,maxY=0;const pixels=[];stack[n++]=start;seen[start]=1;
  while(n){const p=stack[--n],xx=p%w,yy=Math.floor(p/w);pixels.push(p);minX=Math.min(minX,xx);minY=Math.min(minY,yy);maxX=Math.max(maxX,xx);maxY=Math.max(maxY,yy);
   for(const j of [xx>0?p-1:-1,xx<w-1?p+1:-1,yy>0?p-w:-1,yy<h-1?p+w:-1])if(j>=0&&binary[j]&&!seen[j]){seen[j]=1;stack[n++]=j;}
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,area=pixels.length,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  // Discard clipped lines, dotted frames, long edges, and isolated speckles.
  if(minX<=left||maxX>=right-1||minY<=top||maxY>=bottom-1)continue;
  if(area<Math.max(9,w*h*(handwriting?.00012:.00035))||bh<h*.025||bw<w*(handwriting?.004:.012)||bw/bh>9||bw/bh<(handwriting?.025:.11))continue;
  if(cx<w*.12||cx>w*.88||cy<h*.18||cy>h*.82)continue;
  if(bw>w*.65&&bh<h*.10||bh>h*.55&&bw<w*.10)continue;
  if(area/(bw*bh)<.08&&(bw>w*.5||bh>h*.5))continue;
  for(const p of pixels){mask[p]=1;kept.push(p);}count+=area;
 }
 return {blank:count<Math.max(20,w*h*(handwriting?.0007:.0015)),width:w,height:h,mask,points:Uint32Array.from(kept),contrast:median-dark};
}
export function normalizeInk(ink,degrees=0){
 const {width:w,height:h,mask}=ink,rad=degrees*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),cx=w/2,cy=h/2;
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 let points=ink.points;if(!points){const list=[];for(let p=0;p<mask.length;p++)if(mask[p])list.push(p);points=Uint32Array.from(list);}
 for(let j=0;j<points.length;j++){const p=points[j],x=p%w,y=(p/w)|0;const xx=(x-cx)*c-(y-cy)*s,yy=(x-cx)*s+(y-cy)*c;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);}
 if(!Number.isFinite(minX))return null;
 const bw=maxX-minX+1,bh=maxY-minY+1,out=new Uint8Array(NW*NH),indices=[];let count=0;
 for(let y=4;y<NH-4;y++)for(let x=4;x<NW-4;x++){
  const xx=minX+(x-4+.5)*bw/(NW-8),yy=minY+(y-4+.5)*bh/(NH-8),sx=Math.round(xx*c+yy*s+cx),sy=Math.round(-xx*s+yy*c+cy);
  if(sx>=0&&sy>=0&&sx<w&&sy<h&&mask[sy*w+sx]){out[y*NW+x]=1;indices.push(y*NW+x);count++;}
 }
 return {mask:out,aspect:bw/bh,count,indices:Uint16Array.from(indices)};
}
function distances(mask){const d=new Float32Array(NW*NH);for(let i=0;i<d.length;i++)d[i]=mask[i]?0:8;
 for(let y=0;y<NH;y++)for(let x=0;x<NW;x++){const i=y*NW+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y)d[i]=Math.min(d[i],d[i-NW]+1);if(x&&y)d[i]=Math.min(d[i],d[i-NW-1]+1.4);}
 for(let y=NH-1;y>=0;y--)for(let x=NW-1;x>=0;x--){const i=y*NW+x;if(x<NW-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<NH-1)d[i]=Math.min(d[i],d[i+NW]+1);if(x<NW-1&&y<NH-1)d[i]=Math.min(d[i],d[i+NW+1]+1.4);}
 return d;
}
export function prepareReference(word,image){const ink=extractInk(image),shape=normalizeInk(ink);return shape?{word,...shape,dist:distances(shape.mask)}:null;}
export function matchWord(ink,references){
 if(ink.blank)return {word:null,blank:true,candidates:[]};
 const scores=new Map(),sources=new Map();
 for(const angle of [-12,-9,-6,-3,0,3,6,9,12]){
  const a=normalizeInk(ink,angle);if(!a||!a.count)continue;const ad=distances(a.mask);
  for(const b of references){let ab=0,ba=0;for(let j=0;j<a.indices.length;j++)ab+=b.dist[a.indices[j]];for(let j=0;j<b.indices.length;j++)ba+=ad[b.indices[j]];
   const shape=(ab/a.count+ba/b.count)/2,aspect=Math.abs(Math.log(a.aspect/b.aspect));const score=shape+aspect*1.5;
   if(score<(scores.get(b.word)??Infinity)){scores.set(b.word,score);sources.set(b.word,b.kind||'printed');}
  }
 }
 const candidates=[...scores].map(([word,score])=>({word,score})).sort((a,b)=>a.score-b.score),best=candidates[0],margin=(candidates[1]?.score??99)-(best?.score??99);
 const confident=!!best&&best.score<.75&&margin>.40;
 return {word:confident?best.word:'?',blank:false,score:best?.score??99,margin,candidates,referenceKind:best?sources.get(best.word):null};
}
export function cleanedCanvas(ink){const out=document.createElement('canvas'),shape=normalizeInk(ink);out.width=640;out.height=280;const ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,640,280);if(!shape)return out;
 // Keep the original word's aspect ratio for OCR, with a clean white margin.
 const scale=Math.min(560/(shape.aspect*180),1),dw=shape.aspect*180*scale,dh=180*scale;
 const small=document.createElement('canvas');small.width=NW;small.height=NH;const sx=small.getContext('2d'),data=sx.createImageData(NW,NH);for(let i=0;i<shape.mask.length;i++){const v=shape.mask[i]?0:255;data.data[i*4]=data.data[i*4+1]=data.data[i*4+2]=v;data.data[i*4+3]=255;}sx.putImageData(data,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(small,4,4,NW-8,NH-8,(640-dw)/2,(280-dh)/2,dw,dh);return out;}
let cachedReferences=null,cachedKey=null;
export function browserReferences(){
 const words=allWords(),key=words.join('|');if(cachedReferences&&cachedKey===key)return cachedReferences;cachedKey=key;const refs=[];
 const families=['"Hiragino Kaku Gothic ProN", sans-serif','"Hiragino Sans", sans-serif','sans-serif'];
 for(const family of families)for(const weight of [400,600,800])for(const word of words){
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=170;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,400,170);ctx.fillStyle='black';ctx.font=`${weight} ${Math.min(82,300/word.length)}px ${family}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(word,200,85);const ref=prepareReference(word,ctx.getImageData(0,0,400,170));if(ref)refs.push(ref);
 }
 const unique=new Map();for(const ref of refs){const key=ref.word+ref.aspect.toFixed(3)+ref.mask.join('');if(!unique.has(key))unique.set(key,ref);}cachedReferences=[...unique.values()];return cachedReferences;
}

// Local background normalization makes pencil strokes less sensitive to broad shadows.
export function extractHandwritingInk(image){
 const {width:w,height:h,data}=image,gray=new Uint8Array(w*h),integral=new Float64Array((w+1)*(h+1)),pixels=new Uint8ClampedArray(data.length),radius=Math.max(12,Math.round(Math.min(w,h)*.12));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x,p=i*4;gray[i]=Math.round(.299*data[p]+.587*data[p+1]+.114*data[p+2]);row+=gray[i];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+row;}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius+1),mean=(integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0])/((x1-x0)*(y1-y0)),i=y*w+x,p=i*4,v=Math.max(0,Math.min(255,gray[i]-mean+230));pixels[p]=pixels[p+1]=pixels[p+2]=v;pixels[p+3]=255;}
 return extractInk({width:w,height:h,data:pixels},true);
}
export function referenceFromShape(word,shape){
 const mask=Uint8Array.from(shape.mask),indices=[];for(let i=0;i<mask.length;i++)if(mask[i])indices.push(i);if(mask.length!==NW*NH||indices.length<10||!Number.isFinite(shape.aspect)||shape.aspect<=0)return null;
 return{word,mask,aspect:shape.aspect,count:indices.length,indices:Uint16Array.from(indices),dist:distances(mask),kind:'handwriting'};
}
