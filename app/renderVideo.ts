import {FFmpeg} from '@ffmpeg/ffmpeg';
import type {ExportPreset} from './ExportSettings';

export async function renderVideo(p: ExportPreset, report: (value:number, message:string)=>void, signal:AbortSignal) {
  const source=document.querySelector<HTMLElement>('.canvas');
  if(!source) throw new Error('Preview is not available');
  if(!Number.isFinite(p.duration)||p.duration<=0||p.duration>600) throw new Error('Duration must be between 1 and 600 seconds');
  const ffmpeg=new FFmpeg();
  let recorder:MediaRecorder|undefined, stream:MediaStream|undefined, timer:number|undefined;
  let audioContext:AudioContext|undefined;
  const previewAudio=document.querySelector('audio');
  const previousTime=previewAudio?.currentTime||0;
  const wasPaused=previewAudio?.paused??true;
  let stage='Preparing encoder';
  const logs:string[]=[];
  const abort=()=>{if(recorder?.state==='recording')recorder.stop();ffmpeg.terminate()};
  signal.addEventListener('abort',abort);
  async function bounded<T>(task:Promise<T>,ms:number):Promise<T>{
    let timeout:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([task,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error(`${stage} timed out`)),ms)})])}finally{clearTimeout(timeout)}
  }
  try {
    report(0,stage);
    ffmpeg.on('log',({message})=>{logs.push(message);if(logs.length>8)logs.shift()});
    await bounded(ffmpeg.load({coreURL:'/ffmpeg/ffmpeg-core.js',wasmURL:'/ffmpeg/ffmpeg-core.wasm'}),30000);
    signal.throwIfAborted();
    stage='Preparing audio';report(0,stage);
    const audio=document.querySelector('audio');
    let buffer:AudioBuffer|undefined;
    if(audio?.currentSrc){audioContext=new AudioContext();await audioContext.resume();buffer=await audioContext.decodeAudioData(await (await fetch(audio.currentSrc)).arrayBuffer())}
    const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas rendering unavailable');
    const draw=()=>{
      ctx.globalAlpha=1;ctx.fillStyle='#10140e';ctx.fillRect(0,0,p.width,p.height);
      const base=source.getBoundingClientRect();
      const elements=[...source.querySelectorAll<HTMLElement>('img,video,canvas,.canvas-title,.canvas-artist,.canvas-text')];
      elements.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
      for(const el of elements){
        const css=getComputedStyle(el),r=el.getBoundingClientRect();if(css.display==='none'||!r.width||!r.height)continue;
        ctx.save();ctx.scale(p.width/base.width,p.height/base.height);ctx.globalAlpha=Number(css.opacity);ctx.filter=css.filter;
        const x=r.left-base.left,y=r.top-base.top;
        if(el instanceof HTMLCanvasElement||el instanceof HTMLImageElement||el instanceof HTMLVideoElement){
          if(el instanceof HTMLImageElement&&!el.naturalWidth){ctx.restore();continue}
          if(el instanceof HTMLVideoElement&&el.readyState<2){ctx.restore();continue}
          ctx.drawImage(el,x,y,r.width,r.height);
        }else{const text=el.querySelector('strong')||el;const t=getComputedStyle(text);ctx.fillStyle=t.color;ctx.font=`${t.fontStyle} ${t.fontWeight} ${t.fontSize} ${t.fontFamily}`;ctx.textBaseline='top';ctx.direction=t.direction as CanvasDirection;ctx.textAlign=t.direction==='rtl'?'right':'left';ctx.fillText(el.textContent||'',t.direction==='rtl'?x+r.width:x,y)}
        ctx.restore();
      }
    };
    draw();stream=canvas.captureStream(p.fps);
    let audioSource:AudioBufferSourceNode|undefined;
    if(audioContext&&buffer){const dest=audioContext.createMediaStreamDestination();audioSource=audioContext.createBufferSource();audioSource.buffer=buffer;audioSource.connect(dest);dest.stream.getAudioTracks().forEach(track=>stream!.addTrack(track))}
    const mime=['video/webm;codecs=vp8,opus','video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
    if(!mime)throw new Error('This browser cannot record WebM video');
    recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:{standard:4000000,high:8000000,master:12000000}[p.quality]});
    const chunks:Blob[]=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    stage='Recording';report(0,stage);
    if(previewAudio){previewAudio.currentTime=0;if(previewAudio.paused)document.querySelector<HTMLButtonElement>('.top-preview')?.click()}
    await bounded(new Promise<void>((resolve,reject)=>{
      recorder!.onerror=()=>reject(new Error('Browser video recorder failed'));
      recorder!.onstop=()=>signal.aborted?reject(new Error('Cancelled')):resolve();
      const start=performance.now();recorder!.start(1000);audioSource?.start();
      timer=window.setInterval(()=>{try{draw();const elapsed=(performance.now()-start)/1000;report(Math.min(79,elapsed/p.duration*80),`Recording · ${Math.floor(elapsed)} / ${p.duration}s · about ${Math.max(0,Math.ceil(p.duration-elapsed))}s recording remaining`);if(elapsed>=p.duration){clearInterval(timer);recorder!.stop()}}catch(e){reject(e)}},1000/p.fps);
    }),p.duration*1000+15000);
    clearInterval(timer);stream.getTracks().forEach(t=>t.stop());
    if(!chunks.length)throw new Error('Recorder returned an empty video');
    stage='Converting to MP4';report(80,stage);
    ffmpeg.on('progress',({progress})=>report(80+Math.min(.99,Math.max(0,progress))*19,'Converting to MP4 · remaining time depends on your device'));
    await ffmpeg.writeFile('input.webm',new Uint8Array(await new Blob(chunks).arrayBuffer()));
    const code=await bounded(ffmpeg.exec(['-i','input.webm','-c:v','libx264','-preset','ultrafast','-crf',String({standard:26,high:21,master:18}[p.quality]),'-c:a','aac','-pix_fmt','yuv420p','-movflags','+faststart','output.mp4']),Math.max(120000,p.duration*6000));
    if(code!==0)throw new Error(`Encoder exited (${code}): ${logs.slice(-3).join(' ')}`);
    const bytes=await ffmpeg.readFile('output.mp4');
    if(typeof bytes==='string'||!bytes.length)throw new Error('Encoder returned no MP4');
    report(100,'MP4 ready');return new Blob([new Uint8Array(bytes)],{type:'video/mp4'});
  }catch(e){throw new Error(`${stage}: ${e instanceof Error?e.message:typeof e==='string'?e:JSON.stringify(e) || String(e)}`)}
  finally{clearInterval(timer);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());if(previewAudio){if(wasPaused&&!previewAudio.paused)document.querySelector<HTMLButtonElement>('.top-preview')?.click();previewAudio.currentTime=previousTime}await audioContext?.close();ffmpeg.terminate();signal.removeEventListener('abort',abort)}
}
