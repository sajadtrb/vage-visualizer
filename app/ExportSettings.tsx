'use client';

import {useEffect,useState} from 'react';

export type ExportPreset={width:number;height:number;fps:24|30|60;quality:'standard'|'high'|'master';duration:number;format:'mp4'};

export default function ExportSettings({onClose,audioDuration=0,onRender}:{onClose:()=>void;audioDuration?:number;onRender?:()=>void}){
 const [preset,setPreset]=useState<ExportPreset>({width:1080,height:1920,fps:30,quality:'high',duration:30,format:'mp4'});
 const [rendering,setRendering]=useState(false);const [detectedDuration,setDetectedDuration]=useState(audioDuration);
 const musicDuration=detectedDuration||audioDuration;
 useEffect(()=>{const audio=document.querySelector('audio');const sync=()=>{if(audio&&Number.isFinite(audio.duration)&&audio.duration>0)setDetectedDuration(audio.duration)};sync();audio?.addEventListener('loadedmetadata',sync);return()=>audio?.removeEventListener('loadedmetadata',sync)},[]);
 useEffect(()=>{if(Number.isFinite(musicDuration)&&musicDuration>0)setPreset(p=>({...p,duration:Math.min(600,Math.max(1,Math.round(musicDuration)))}))},[musicDuration]);
 const render=()=>{setRendering(true);onRender?.();window.setTimeout(()=>setRendering(false),900)};
 return <section className="export-settings" aria-label="Export settings">
  <header><strong>Export video</strong><button onClick={onClose}>×</button></header>
  <label>Resolution<select value={`${preset.width}x${preset.height}`} onChange={e=>{const [width,height]=e.target.value.split('x').map(Number);setPreset(p=>({...p,width,height}))}}><option value="1080x1920">1080 × 1920 · Reel / Story</option><option value="1080x1080">1080 × 1080 · Square</option><option value="1920x1080">1920 × 1080 · YouTube</option><option value="2160x2160">2160 × 2160 · 4K Square</option></select></label>
  <label>Frame rate<select value={preset.fps} onChange={e=>setPreset(p=>({...p,fps:Number(e.target.value) as 24|30|60}))}><option value="24">24 fps · Cinematic</option><option value="30">30 fps · Social</option><option value="60">60 fps · Smooth</option></select></label>
  <label>Quality<select value={preset.quality} onChange={e=>setPreset(p=>({...p,quality:e.target.value as ExportPreset['quality']}))}><option value="standard">Standard</option><option value="high">High</option><option value="master">Master</option></select></label>
  <label>Duration (seconds)<input type="number" min="1" max="600" value={preset.duration} onChange={e=>setPreset(p=>({...p,duration:Math.max(1,Number(e.target.value)||1)}))}/></label>
  <button type="button" className="duration-sync" disabled={!musicDuration} onClick={()=>setPreset(p=>({...p,duration:Math.min(600,Math.max(1,Math.round(musicDuration)))}))}>{musicDuration?'Use music duration':'Add music to detect duration'}</button>
  <p>MP4 export is rendered from the project canvas at {preset.width}×{preset.height}, {preset.fps} fps.</p>
  <button className="export-render" type="button" onClick={render} disabled={rendering}>{rendering?'Preparing render…':'Render MP4'}</button>
 </section>
}
