import {homography} from './core.js';
import {extractInk,extractHandwritingInk,matchWord} from './recognition.js';
import {sampleCell,cardDimensions} from './photo-recognition.js';
let references=[];
self.onmessage=e=>{
 const m=e.data;
 if(m.type==='init'){references=m.references;self.postMessage({type:'ready'});return;}
 if(m.type!=='recognize')return;
 try{
  references=m.references||references;const h=homography(m.points),grid=m.options?.single?1:4,dimensions=m.options?.single?cardDimensions(m.points):{width:320,height:320};
  for(let i=0;i<grid*grid;i++){const image=sampleCell(m.image,h,i,dimensions.width,grid,dimensions.height),result=matchWord(m.options?.handwriting?extractHandwritingInk(image):extractInk(image),references);self.postMessage({type:'cell',index:i,image,result},[image.data.buffer]);}
  self.postMessage({type:'done'});
 }catch(e){self.postMessage({type:'error',message:e.message});}
};
