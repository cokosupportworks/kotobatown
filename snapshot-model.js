// Describe the visible town, never the next turn's pending cards. No mutations.
export function townCardsForSnapshot(mode,state,customWords=new Set()){
 if(mode==='free')return (state.scene||[]).map(o=>({word:o.word,x:o.x,y:o.y}));
 return (state.world||[]).map(c=>{
  const words=[];
  if(c.terrain==='road'||c.terrain==='field')words.push(c.terrainWord||(c.terrain==='road'?'みち':'はたけ'));
  const seed=c.seed?(c.growth===3?'やさい':c.seedWord||'たね'):'';
  const item=c.item?(c.itemWord||c.item):'';
  const foreground=item||seed||words[0]||'';
  if(customWords.has(foreground)){if(foreground)words.push(foreground);}
  else {if(seed)words.push(seed);if(item)words.push(item);}
  return [...new Set(words)];
 });
}
export function japanSnapshotFilename(date=new Date()){
 const values=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
 return `ことばタウン-${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}-${values.second}-JST.png`;
}
