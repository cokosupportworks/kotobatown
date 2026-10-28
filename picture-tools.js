// Connected color removal leaves disconnected foreground regions intact.
export function removeColor(data,width,height,seeds,tolerance){
 const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=0;
 const colors=seeds.map(i=>[data[i*4],data[i*4+1],data[i*4+2]]),limit=tolerance*tolerance*3;
 const add=i=>{if(i<0||i>=seen.length||seen[i])return;seen[i]=1;const p=i*4;if(data[p+3]===0)return;const ok=colors.some(c=>(data[p]-c[0])**2+(data[p+1]-c[1])**2+(data[p+2]-c[2])**2<=limit);if(ok)queue[tail++]=i;};
 for(const i of seeds)add(i);
 while(head<tail){const i=queue[head++],x=i%width,y=(i/width)|0;data[i*4+3]=0;if(x)add(i-1);if(x<width-1)add(i+1);if(y)add(i-width);if(y<height-1)add(i+width);}
 return tail;
}
export function opaqueBounds(data,width,height){let x0=width,y0=height,x1=-1,y1=-1;for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return x1<0?null:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};}
