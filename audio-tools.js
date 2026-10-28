export function editPCM(channels,sampleRate,{start=0,end=channels[0].length/sampleRate,normalize=false,fadeIn=0,fadeOut=0}={}){
 const max=channels[0].length,from=Math.max(0,Math.min(max-1,Math.floor(start*sampleRate))),to=Math.min(max,Math.max(from+1,Math.floor(end*sampleRate))),out=new Float32Array(to-from);
 for(let i=0;i<out.length;i++){let s=0;for(const ch of channels)s+=ch[from+i]||0;out[i]=s/channels.length;}
 let peak=0;for(const v of out)peak=Math.max(peak,Math.abs(v));const gain=normalize&&peak>0?.9/peak:1;
 const fi=Math.max(0,fadeIn*sampleRate),fo=Math.max(0,fadeOut*sampleRate);
 for(let i=0;i<out.length;i++){const fade=Math.min(1,fi?i/fi:1,fo?(out.length-1-i)/fo:1);out[i]=Math.max(-1,Math.min(1,out[i]*gain*fade));}
 return out;
}
export function wavBlob(samples,sampleRate){const bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes),str=(offset,s)=>{for(let i=0;i<s.length;i++)v.setUint8(offset+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return new Blob([bytes],{type:'audio/wav'});}
// Locally synthesized, ready-to-use sound effects (not field recordings).
export function presetPCM(kind,sampleRate=22050){
 const duration={engine:1.4,leaves:1.2,water:1.3,wind:1.4,bark:.8,chirp:.8,steps:.8,soil:.7,bell:1.1,sparkle:1.1,seed:.7,pop:.2,boing:.6,chime:1.2}[kind]||.6,out=new Float32Array(Math.ceil(duration*sampleRate));let seed=12345,phase=0,filtered=0;
 for(let i=0;i<out.length;i++){const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;filtered=.94*filtered+.06*noise;let s=0;
 if(kind==='bark'){const p=t%.38,env=Math.exp(-p*17)*Math.min(1,p*120);s=env*(Math.sin(2*Math.PI*(170*t+3*Math.sin(2*Math.PI*50*t)))+.25*noise);}
 else if(kind==='chirp'){const p=t%.24,f=1800+900*Math.sin(Math.min(1,p/.14)*Math.PI);phase+=2*Math.PI*f/sampleRate;s=Math.sin(phase)*Math.exp(-p*18)*Math.min(1,p*160);}
 else if(kind==='engine'){phase+=2*Math.PI*(75+8*Math.sin(t*7))/sampleRate;s=.5*Math.sin(phase)+.25*Math.sin(phase*2)+.14*noise;}
 else if(kind==='water'){s=filtered*2+Math.sin(2*Math.PI*(600*t+10*Math.sin(t*17)))*Math.exp(-(t%.22)*22)*.3;}
 else if(kind==='leaves'||kind==='wind'){s=filtered*(kind==='wind'?2.3:1.5)*(1+.4*Math.sin(t*9));}
 else if(kind==='soil'||kind==='steps'){const p=t%(kind==='soil'?.25:.3);s=noise*Math.exp(-p*35)*.65+Math.sin(2*Math.PI*95*t)*Math.exp(-p*40)*.3;}
 else if(kind==='bell'||kind==='chime'||kind==='sparkle'){const pitches=kind==='bell'?[660,520]:kind==='chime'?[523.25,659.25,783.99]:[1046,1318,1568,2093];for(let j=0;j<pitches.length;j++){const p=t-j*.13;if(p>=0)s+=Math.sin(2*Math.PI*pitches[j]*p)*Math.exp(-p*5)*.32;}}
 else if(kind==='seed'){phase+=2*Math.PI*(300+1500*t)/sampleRate;s=Math.sin(phase)*Math.sin(Math.PI*t/duration)*.6;}
 else if(kind==='boing'){phase+=2*Math.PI*(90+450*Math.exp(-t*12))/sampleRate;s=Math.sin(phase)*Math.exp(-t*5)*.75;}
 else{phase+=2*Math.PI*(200+800*Math.exp(-t*60))/sampleRate;s=Math.sin(phase)*Math.exp(-t*24)*.8;}
 const edge=Math.min(1,t/.012,(duration-t)/.035);out[i]=Math.max(-.95,Math.min(.95,s*.65*edge));}
 return {samples:out,sampleRate};
}
