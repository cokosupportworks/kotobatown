export const WORDS=['き','はな','みち','くるま','いぬ','とり','いえ','はたけ','たね','みず'];
let aliases=Object.create(null);
export function setAliases(values={}){aliases=Object.create(null);for(const [word,meaning]of Object.entries(values))if(/^[ぁ-ゖー]{1,12}$/.test(word)&&(WORDS.includes(meaning)||meaning==='text')&&!WORDS.includes(word))aliases[word]=meaning;}
export const meaningOf=word=>aliases[word]||word;
export const allWords=()=>[...WORDS,...Object.keys(aliases)];
export const fresh=()=>Array.from({length:16},()=>({terrain:'grass',seed:false,growth:0,item:null}));
export function act(cell,word){
 const c={...cell},label=word;word=meaningOf(word);
 if(word==='はたけ'){c.terrain='field';c.terrainWord=label;if(c.seed)c.growth=Math.max(1,c.growth);}
 else if(word==='みち'){c.terrain='road';c.terrainWord=label;c.seed=false;c.growth=0;}
 else if(word==='たね'){c.seed=true;c.seedWord=label;c.growth=c.terrain==='field'?Math.max(1,c.growth):0;}
 else if(word==='みず'){if(c.terrain==='field'&&c.seed)c.growth=Math.min(3,c.growth+1);}
 else if(WORDS.includes(word)||word==='text'){c.item=word;c.itemWord=label;}
 return c;
}
export function turn(world,cards){return world.map((c,i)=>cards[i]?act(c,cards[i]):{...c});}
export function normalize(s){return s.normalize('NFKC').replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[^ぁ-ゖー]/g,'');}
export function homography(points){
 const dst=[[0,0],[1,0],[1,1],[0,1]],a=[];
 for(let i=0;i<4;i++){const [u,v]=dst[i],{x,y}=points[i];a.push([u,v,1,0,0,0,-x*u,-x*v,x]);a.push([0,0,0,u,v,1,-y*u,-y*v,y]);}
 for(let j=0;j<8;j++){let p=j;for(let k=j+1;k<8;k++)if(Math.abs(a[k][j])>Math.abs(a[p][j]))p=k;[a[j],a[p]]=[a[p],a[j]];const d=a[j][j];if(Math.abs(d)<1e-9)throw Error('四隅が重なっています。指定し直してください。');for(let k=j;k<9;k++)a[j][k]/=d;for(let r=0;r<8;r++)if(r!==j){const f=a[r][j];for(let k=j;k<9;k++)a[r][k]-=f*a[j][k];}}
 return a.map(r=>r[8]);
}
export function project(h,u,v){const d=h[6]*u+h[7]*v+1;return {x:(h[0]*u+h[1]*v+h[2])/d,y:(h[3]*u+h[4]*v+h[5])/d};}
export function validQuad(p){if(p.length!==4)return false;const cross=p.map((a,i)=>{const b=p[(i+1)%4],c=p[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);});return cross.every(x=>x>20);}
// Suggest dark square registration marks; all suggestions remain visible and editable.
export function detectCorners({data,width:w,height:h}){
 const seen=new Uint8Array(w*h),stack=new Int32Array(w*h),candidates=[];
 const dark=i=>data[i*4]+data[i*4+1]+data[i*4+2]<270;
 for(let start=0;start<w*h;start++){
  if(seen[start]||!dark(start))continue;let n=0,area=0,minX=w,minY=h,maxX=0,maxY=0;stack[n++]=start;seen[start]=1;
  while(n){const i=stack[--n],x=i%w,y=Math.floor(i/w);area++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!seen[j]&&dark(j)){seen[j]=1;stack[n++]=j;}
  }
  const bw=maxX-minX+1,bh=maxY-minY+1,fill=area/(bw*bh),ratio=bw/bh;
  if(area>=20&&area<w*h*.015&&bw>=4&&bh>=4&&ratio>.55&&ratio<1.8&&fill>.72)candidates.push({x:(minX+maxX)/2,y:(minY+maxY)/2,fill,ratio});
 }
 const corners=[[0,0],[1,0],[1,1],[0,1]],points=[];
 for(const [u,v]of corners){const group=candidates.filter(p=>(p.x>w/2)===!!u&&(p.y>h/2)===!!v);group.sort((a,b)=>{const score=p=>Math.hypot(p.x/w-u,p.y/h-v)+(1-p.fill)*.4+Math.abs(Math.log(p.ratio))*.05;return score(a)-score(b);});if(!group.length)return null;points.push({x:group[0].x,y:group[0].y});}
 if(!validQuad(points))return null;
 const area=Math.abs(points.reduce((s,p,i)=>s+p.x*points[(i+1)%4].y-p.y*points[(i+1)%4].x,0))/2;
 return area>w*h*.15?points:null;
}

export function routeToEnd(start,adjacent){
 const queue=[start],previous=new Map([[start,null]]),distance=new Map([[start,0]]);
 for(let q=0;q<queue.length;q++)for(const next of adjacent(queue[q]))if(!previous.has(next)){previous.set(next,queue[q]);distance.set(next,distance.get(queue[q])+1);queue.push(next);}
 const ends=queue.filter(i=>i!==start&&adjacent(i).length===1),candidates=ends.length?ends:queue;
 let end=start;for(const i of candidates)if(distance.get(i)>distance.get(end))end=i;
 const path=[];for(let i=end;i!==null;i=previous.get(i))path.push(i);return path.reverse();
}
export function gridRoadRoute(world,start){
 if(world[start]?.terrain!=='road')return [];
 return routeToEnd(start,i=>[i+1,i+4,i-1,i-4].filter(j=>j>=0&&j<16&&(Math.abs(j-i)!==1||Math.floor(j/4)===Math.floor(i/4))&&world[j].terrain==='road'));
}
export function freeRoadRoute(scene,car){
 const roads=scene.filter(o=>meaningOf(o.word)==='みち');let start=-1,best=.21;
 for(let i=0;i<roads.length;i++){const d=Math.hypot(car.x-roads[i].x,car.y-roads[i].y);if(d<best){best=d;start=i;}}
 if(start<0)return [];
 return routeToEnd(start,i=>roads.flatMap((p,j)=>j!==i&&Math.hypot(p.x-roads[i].x,p.y-roads[i].y)<.30?[j]:[])).map(i=>({x:roads[i].x,y:roads[i].y}));
}
export function birdFlight(start,bounds,random=Math.random){
 const {minX,maxX,minY,maxY}=bounds,span=Math.min(maxX-minX,maxY-minY),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));let end=start;
 for(let i=0;i<8;i++){end={x:minX+random()*(maxX-minX),y:minY+random()*(maxY-minY)};if(Math.hypot(end.x-start.x,end.y-start.y)>span*.3)break;}
 const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy)||1,middle={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
 const control=sign=>({x:clamp(middle.x-dy/length*span*.25*sign,minX,maxX),y:clamp(middle.y+dx/length*span*.25*sign,minY,maxY)});
 const curve=(a,c,b,t)=>({x:(1-t)**2*a.x+2*(1-t)*t*c.x+t*t*b.x,y:(1-t)**2*a.y+2*(1-t)*t*c.y+t*t*b.y});
 const out=control(1),back=control(-1),points=[];
 for(let i=0;i<=30;i++)points.push(curve(start,out,end,i/30));for(let i=1;i<=30;i++)points.push(curve(end,back,start,i/30));
 return {points,end};
}
