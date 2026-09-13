'use client';
import {useEffect,useRef, type RefObject} from 'react';

export default function ReactiveSpectrum({analyser,audio,mode,color,background=false,gain=1,particleCount=100,seed=1}:{analyser:RefObject<AnalyserNode|null>;audio:RefObject<HTMLAudioElement|null>;mode:string;color:string;background?:boolean;gain?:number;particleCount?:number;seed?:number}){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!;const ctx=canvas.getContext('2d')!;
  let frame=0,last=0,travel=0;const history:number[][]=[];
  let frequency=new Uint8Array(0),wave=new Uint8Array(0);
  const smooth=new Float32Array(96);
  const particles=Array.from({length:Math.max(10,particleCount)},(_,i)=>{const n=Math.sin(i*91.17+seed*17.3)*43758.5453;const r=n-Math.floor(n);const n2=Math.sin(i*37.71+seed*41.9)*43758.5453;const r2=n2-Math.floor(n2);return{x:((i*0.61803398875+seed*.137)%1),y:((i*0.41421356237+seed*.271)%1),vx:(r-.5)*.08,vy:(r2-.5)*.08,z:.25+(i%7)/9,phase:r*Math.PI*2}});
  const draw=(now:number)=>{
   const dt=Math.min(.05,(now-last)/1000||0);last=now;
   const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2);
   if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   const a=analyser.current,active=!!a&&!!audio.current&&!audio.current.paused&&!audio.current.ended;
   if(a&&frequency.length!==a.frequencyBinCount){frequency=new Uint8Array(a.frequencyBinCount);wave=new Uint8Array(a.fftSize)}
   if(active&&a){a.getByteFrequencyData(frequency);a.getByteTimeDomainData(wave)}else{frequency.fill(0);wave.fill(128)}
   const band=(lo:number,hi:number)=>{if(!a)return 0;const bin=a.context.sampleRate/a.fftSize;let sum=0,n=0;for(let i=Math.max(1,Math.ceil(lo/bin));i<Math.min(frequency.length,Math.ceil(hi/bin));i++){sum+=frequency[i]/255;n++}return n?sum/n:0};
   const bass=band(30,250)*gain,mid=band(250,2500)*gain,high=band(2500,14000)*gain,energy=Math.min(1,(bass+mid+high)/3),reactive=Math.min(1,energy*3.8);
   // Logarithmic frequency buckets; no synthetic oscillator or idle animation.
   for(let i=0;i<96;i++){let v=0;if(a){const bin=a.context.sampleRate/a.fftSize;const lo=Math.max(1,Math.floor(35*Math.pow(16000/35,i/96)/bin)),hi=Math.min(frequency.length,Math.max(lo+1,Math.ceil(35*Math.pow(16000/35,(i+1)/96)/bin)));for(let j=lo;j<hi;j++)v=Math.max(v,frequency[j]/255)}smooth[i]=active?smooth[i]+(v-smooth[i])*(v>smooth[i]?.7:.22):0}
   travel+=dt*energy;
   const css=getComputedStyle(canvas.parentElement!);const particleColor=css.getPropertyValue('--particle-color').trim()||color;const spectrumColor=css.getPropertyValue('--spectrum-color').trim()||color;const baseSize=Math.max(.035,Number(css.getPropertyValue('--particle-base-size'))||.45);const particleReaction=Math.max(0,Number(css.getPropertyValue('--particle-reaction'))||1);const glow=Number(css.getPropertyValue('--particle-glow'))!==0;const wind=css.getPropertyValue('--particle-wind').trim();const windStrength=Number(css.getPropertyValue('--particle-wind-strength'))||1;const wx=(wind==='left'?-1:wind==='right'?1:0)*windStrength,wy=(wind==='up'?-1:wind==='down'?1:0)*windStrength;const renderColor=background?particleColor:spectrumColor;ctx.strokeStyle=renderColor;ctx.fillStyle=renderColor;ctx.lineWidth=1.4;ctx.shadowColor=renderColor;ctx.shadowBlur=glow?3+high*18:0;
   const line=(points:number[][])=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke()};
   const dot=(x:number,y:number,r:number)=>{ctx.beginPath();ctx.arc(x,y,Math.max(.4,r),0,Math.PI*2);ctx.fill()};
   if(background||['universe','star-field','particles','dot-field'].includes(mode)){
    const points=particles.map((p,i)=>{if(active){const local=smooth[i%96]||energy;p.x=(p.x+(p.vx*dt*(.35+reactive*particleReaction*4)+wx*dt*(.08+reactive*particleReaction*.35))+Math.sin(travel*2+p.phase)*dt*reactive*particleReaction*.09+1)%1;p.y=(p.y+(p.vy*dt*(.35+reactive*particleReaction*4)+wy*dt*(.08+reactive*particleReaction*.35))+Math.cos(travel*1.7+p.phase)*dt*reactive*particleReaction*.09+1)%1}const pulse=1+smooth[i%96]*1.6+reactive*particleReaction*.7;const x=p.x*w,y=p.y*h;return [x+(x-w/2)*bass*.16,y+(y-h/2)*bass*.16,p.z*pulse*baseSize]});
    if(mode==='universe'){ctx.shadowBlur=0;for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){const distance=Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1]);if(distance<Math.min(w,h)*.22){ctx.globalAlpha=(1-distance/(Math.min(w,h)*.22))*(.12+mid*.65);line([points[i],points[j]])}}}
    // MusicVid-style layered particles: tiny flecks, reactive core particles, and soft bokeh.
    points.forEach(([x,y,z],i)=>{const v=smooth[i%96]||0;ctx.globalAlpha=.2+reactive*.55+v*.45;dot(x,y,(background?.45:1)*z+high*.9*z)});
    points.forEach(([x,y,z],i)=>{const v=smooth[(i*7)%96]||0;ctx.globalAlpha=.12+reactive*.42+v*.55;dot(x,y,(background?1.1:1.8)*z+reactive*1.25*z)});
    points.filter((_,i)=>i%4===0).forEach(([x,y,z],i)=>{const v=smooth[(i*11)%96]||0;ctx.globalAlpha=.04+reactive*.2+v*.25;ctx.shadowBlur=5+reactive*16;dot(x,y,1.15*z+reactive*.9*z)});ctx.shadowBlur=3+high*18;ctx.globalAlpha=1;
   }else if(mode==='linebed'){
    if(active){history.unshift(Array.from(smooth));if(history.length>44)history.pop()}else history.length=0;
    ctx.shadowBlur=0;for(let row=43;row>=0;row--){const depth=1-row/55,values=history[row]||smooth;ctx.globalAlpha=.12+depth*.75;line(Array.from({length:96},(_,i)=>[w/2+(i/95-.5)*w*depth,h*(.95-row*.017)-values[i]*h*.32*depth]))}ctx.globalAlpha=1;
   }else if(['circular','neon-ring','hexagone','tunnel','orbital','arc-bars'].includes(mode)){
    const radius=Math.min(w,h)*(.24+bass*.055),rings=mode==='tunnel'||mode==='hexagone'?3:1;
    for(let ring=0;ring<rings;ring++){const r=radius*(1+ring*.35);ctx.globalAlpha=1-ring*.22;for(let i=0;i<96;i++){const angle=i/96*Math.PI*(mode==='arc-bars'?1:2)-Math.PI/2;const length=smooth[i]*Math.min(w,h)*.18;const x=w/2+Math.cos(angle)*r,y=h/2+Math.sin(angle)*r;if(mode==='orbital')dot(x,y,1+length*.1);else line([[x,y],[w/2+Math.cos(angle)*(r+length),h/2+Math.sin(angle)*(r+length)]])}}ctx.globalAlpha=1;
   }else if(['waveform','oscillo','aurora','liquid'].includes(mode)){
    for(let layer=0;layer<(mode==='aurora'?4:1);layer++){ctx.globalAlpha=1-layer*.2;line(Array.from({length:256},(_,i)=>[i/255*w,h/2+(wave.length?(wave[Math.floor(i/256*wave.length)]-128)/128:0)*h*(.4-layer*.06)+layer*5]))}ctx.globalAlpha=1;
   }else{
    const mirrored=mode==='mirrored'||mode==='dual-bulb';for(let i=0;i<96;i++){const height=smooth[i]*h*.85;ctx.fillRect(i*w/96,mirrored?h/2-height/2:h-height,w/96*.68,Math.max(1,height))}
   }
   canvas.dataset.energy=energy.toFixed(4);canvas.dataset.playing=String(active);frame=requestAnimationFrame(draw);
  };frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[analyser,audio,mode,color,background,gain,particleCount,seed]);
 return <canvas ref={ref} aria-label={background?'ذرات واکنش‌گرا به صدا':`طیف صوتی ${mode}`} style={{width:'100%',height:'100%',display:'block',pointerEvents:'none'}}/>;
}
