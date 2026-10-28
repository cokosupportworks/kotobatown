export const MOTIONS=[['auto','ことばに合わせる','鳥は飛び、車はつながった道を往復します'],['none','動かない','音だけ鳴らすこともできます'],['bounce','ぽんぽん跳ねる','その場で弾むように跳ねます'],['jump','大きくジャンプ','高く跳んで着地します'],['wiggle','左右にゆらゆら','左右に首をかしげます'],['sway','風にゆれる','ゆっくり左右にゆれます'],['spin','くるっと回る','その場で一回転します'],['pulse','ふくらんで戻る','大きくなって元に戻ります'],['shake','ぶるぶる震える','細かく震えます'],['flip','くるりと裏返る','左右にくるりと回ります'],['walk','歩いて往復','横へ歩いて戻ります'],['orbit','円を描く','小さな円を描いて戻ります'],['float','ふわふわ浮く','浮き上がってゆっくり戻ります'],['fly','画面を飛んで戻る','ランダムな場所へ弧を描いて往復します'],['road','道の端まで往復','つながった道の端へ行って戻ります']];
export const BUILTIN_SOUNDS=[['leaves','き：葉のざわめき'],['sparkle','はな：きらきら'],['steps','みち：とことこ足音'],['engine','くるま：エンジン'],['bark','いぬ：ワンワン'],['chirp','とり：ピヨピヨ'],['bell','いえ：呼び鈴'],['soil','はたけ：土を掘る音'],['seed','たね：芽が出る音'],['water','みず：水の音'],['pop','ぽんっ'],['boing','びよーん'],['chime','やさしいチャイム'],['wind','風の音']];
const wordSounds={'き':'leaves','はな':'sparkle','みち':'steps','くるま':'engine','いぬ':'bark','とり':'chirp','いえ':'bell','はたけ':'soil','たね':'seed','みず':'water'};
const clamp=(v,a,b,f)=>Number.isFinite(Number(v))?Math.max(a,Math.min(b,Number(v))):f;
export function cleanEffect(value={},meaning=''){
 value=value&&typeof value==='object'?value:{};
 return {motion:MOTIONS.some(m=>m[0]===value.motion)?value.motion:'auto',duration:clamp(value.duration,.5,10,3),amplitude:clamp(value.amplitude,.25,1.5,1),cycles:Math.round(clamp(value.cycles,1,5,1)),sound:typeof value.sound==='string'&&/^(none|builtin:[a-z]+|audio:[a-z0-9-]+)$/.test(value.sound)?value.sound:(wordSounds[meaning]?'builtin:'+wordSounds[meaning]:'none'),playMode:value.playMode==='loop'?'loop':'once',volume:clamp(value.volume,0,1,.45)};
}
export function resolvedMotion(config,meaning){if(config.motion!=='auto')return config.motion;return meaning==='とり'?'fly':meaning==='くるま'?'road':meaning==='き'?'sway':meaning==='はな'||meaning==='たね'||meaning==='みず'?'pulse':meaning==='はたけ'||meaning==='みち'?'none':'wiggle';}
export function motionFrames(kind,width,height,amplitude=1,cycles=1){
 const frames=[];for(let i=0;i<=48*cycles;i++){const t=i/(48*cycles),phase=t*cycles*2*Math.PI,s=Math.sin(phase),u=Math.sin(Math.PI*((t*cycles)%1));let x=0,y=0,r=0,sx=1,sy=1;
 switch(kind){case'bounce':y=-Math.abs(s)*height*.22*amplitude;break;case'jump':y=-u*height*.65*amplitude;break;case'wiggle':r=s*14*amplitude;break;case'sway':r=s*8*amplitude;x=s*width*.04*amplitude;break;case'spin':r=t*cycles*360;break;case'pulse':sx=sy=1+Math.sin(t*cycles*Math.PI)*.2*amplitude;break;case'shake':x=Math.sin(phase*8)*width*.04*amplitude;break;case'flip':sx=Math.cos(phase);break;case'walk':x=Math.sin(Math.PI*t)*width*.6*amplitude;y=-Math.abs(Math.sin(phase*4))*height*.04;break;case'orbit':x=Math.sin(phase)*width*.25*amplitude;y=(Math.cos(phase)-1)*height*.18*amplitude;break;case'float':y=-Math.sin(Math.PI*t)*height*.3*amplitude;x=s*width*.08;break;}
 if(i===0||i===48*cycles){x=y=0;sx=sy=1;if(kind!=='spin')r=0;}
 frames.push({transform:`translate(${x}px,${y}px) rotate(${r}deg) scale(${sx},${sy})`});}
 return frames;
}
