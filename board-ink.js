// A board-only presence gate. Smooth illumination, guide lines and isolated dust
// must not be expanded into a word by the nearest-reference matcher.
export function boardInkEvidence({data,width:w,height:h}) {
 const gray=new Uint8Array(w*h),sum=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){const i=y*w+x,p=i*4;gray[i]=Math.round(data[p]*.299+data[p+1]*.587+data[p+2]*.114);row+=gray[i];sum[(y+1)*(w+1)+x+1]=sum[y*(w+1)+x+1]+row;}}
 const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),stack=new Int32Array(w*h),r=Math.max(3,Math.round(Math.min(w,h)*.022));
 const xlo=Math.ceil(w*.12),xhi=Math.floor(w*.88),ylo=Math.ceil(h*.16),yhi=Math.floor(h*.88);
 for(let y=ylo;y<yhi;y++)for(let x=xlo;x<xhi;x++){
  const x0=Math.max(0,x-r),x1=Math.min(w,x+r+1),y0=Math.max(0,y-r),y1=Math.min(h,y+r+1),mean=(sum[y1*(w+1)+x1]-sum[y0*(w+1)+x1]-sum[y1*(w+1)+x0]+sum[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
  // Absolute and relative local contrast; a broad soft shadow has neither.
  if(mean-gray[y*w+x]>=Math.max(9,mean*.045))mask[y*w+x]=1;
 }
 let count=0,largest=0,spanX0=w,spanY0=h,spanX1=0,spanY1=0;
 for(let y=ylo;y<yhi;y++)for(let x=xlo;x<xhi;x++){
  const start=y*w+x;if(!mask[start]||seen[start])continue;let n=1,area=0,minX=w,maxX=0,minY=h,maxY=0;stack[0]=start;seen[start]=1;
  while(n){const p=stack[--n],xx=p%w,yy=(p/w)|0;area++;minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=xx+dx,ny=yy+dy,j=ny*w+nx;if(nx>=xlo&&nx<xhi&&ny>=ylo&&ny<yhi&&mask[j]&&!seen[j]){seen[j]=1;stack[n++]=j;}}
  }
  const bw=maxX-minX+1,bh=maxY-minY+1;
  if(area<Math.max(8,w*h*.00015))continue;
  // Dashes, ruler-like edges and tiny specks are not positive writing evidence.
  if(bw<w*.014||bh<h*.025||bh<h*.04&&bw>w*.18||bw<w*.035&&bh>h*.55)continue;
  if(bw<w*.05&&bh<h*.08)continue;
  if(bw>w*.65||bh>h*.68)continue;
  count+=area;largest=Math.max(largest,area);spanX0=Math.min(spanX0,minX);spanX1=Math.max(spanX1,maxX);spanY0=Math.min(spanY0,minY);spanY1=Math.max(spanY1,maxY);
 }
 const hasWriting=count>=Math.max(40,w*h*.00065)&&largest>=Math.max(16,w*h*.00025)&&spanX1-spanX0>=w*.075&&spanY1-spanY0>=h*.09;
 return {hasWriting,count,largest};
}
export function boardBlankResult(image){return boardInkEvidence(image).hasWriting?null:{word:null,blank:true,candidates:[],blankReason:'no-writing-strokes'};}
