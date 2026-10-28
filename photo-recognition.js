import {boardBlankResult} from './board-ink.js';
import {homography} from './core.js';
import {extractInk,extractHandwritingInk,matchWord} from './recognition.js?v=12';
// Sample each cell directly from the original photo; no large intermediate board.
export function cardDimensions(points){const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),ratio=Math.max(.4,Math.min(4,(distance(points[0],points[1])+distance(points[3],points[2]))/(distance(points[0],points[3])+distance(points[1],points[2]))));return ratio>=1?{width:640,height:Math.round(640/ratio)}:{width:Math.round(480*ratio),height:480};}
export function sampleCell(image,h,index,size=320,grid=4,targetHeight=size){
 const {data:src,width:w,height:imageHeight}=image,data=new Uint8ClampedArray(size*targetHeight*4),column=index%grid,row=(index/grid)|0;
 const du=.94/(size*grid),dv=.94/(targetHeight*grid),u0=(column+.03+.47/size)/grid,v0=(row+.03+.47/targetHeight)/grid;
 const ax=h[0]*du,ay=h[3]*du,ad=h[6]*du;
 for(let y=0;y<targetHeight;y++){
  const v=v0+y*dv;let nx=h[0]*u0+h[1]*v+h[2],ny=h[3]*u0+h[4]*v+h[5],den=h[6]*u0+h[7]*v+1;
  for(let x=0;x<size;x++,nx+=ax,ny+=ay,den+=ad){
   const px=nx/den,py=ny/den,sx=Math.floor(px),sy=Math.floor(py),fx=px-sx,fy=py-sy,i=(y*size+x)*4;
   if(sx>=0&&sy>=0&&sx<w-1&&sy<imageHeight-1){const j=(sy*w+sx)*4;for(let c=0;c<3;c++)data[i+c]=(src[j+c]*(1-fx)+src[j+4+c]*fx)*(1-fy)+(src[j+w*4+c]*(1-fx)+src[j+w*4+4+c]*fx)*fy;}else data[i]=data[i+1]=data[i+2]=255;data[i+3]=255;
  }
 }
 return {data,width:size,height:targetHeight};
}
let worker=null,ready=null;
export function warmShapeEngine(references){
 if(ready)return ready;
 if(typeof Worker==='undefined')return Promise.resolve(null);
 ready=new Promise(resolve=>{
  try{
   worker=new Worker(new URL('./recognition-worker.js?v=12',import.meta.url),{type:'module'});
   const timeout=setTimeout(()=>{worker?.terminate();worker=null;ready=null;resolve(null);},4000);
   worker.onmessage=e=>{if(e.data.type==='ready'){clearTimeout(timeout);resolve(worker);}};
   worker.onerror=()=>{clearTimeout(timeout);worker?.terminate();worker=null;ready=null;resolve(null);};
   worker.postMessage({type:'init',references});
  }catch{worker=null;ready=null;resolve(null);}
 });return ready;
}
export async function recognizePhoto(image,points,references,onCell,options={}){
 const active=await warmShapeEngine(references);
 if(active){
  try{return await new Promise((resolve,reject)=>{
   active.onmessage=e=>{const m=e.data;if(m.type==='cell')onCell(m.index,m.image,m.result);else if(m.type==='done')resolve();else if(m.type==='error')reject(Error(m.message));};
   active.onerror=()=>reject(Error('worker failed'));active.postMessage({type:'recognize',image,points,references,options});
  });}catch{active.terminate();worker=null;ready=null;}
 }
 // Older browsers keep the same recognition, with short yields for the UI.
 const h=homography(points);
 const grid=options.single?1:4,dimensions=options.single?cardDimensions(points):{width:320,height:320};for(let i=0;i<grid*grid;i++){const crop=sampleCell(image,h,i,dimensions.width,grid,dimensions.height);onCell(i,crop,(!options.single&&boardBlankResult(crop))||matchWord(options.handwriting?extractHandwritingInk(crop):extractInk(crop),references));if(i%4===3)await new Promise(r=>setTimeout(r,0));}
}
