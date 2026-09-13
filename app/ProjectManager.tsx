'use client';
import {useEffect,useState} from 'react';

type SavedProject={id:string;name:string;updatedAt:string;data:string};
const key='vage-projects';
export default function ProjectManager(){
 const [open,setOpen]=useState(false),[name,setName]=useState('پروژه بدون عنوان'),[projects,setProjects]=useState<SavedProject[]>([]);
 useEffect(()=>{try{setProjects(JSON.parse(localStorage.getItem(key)||'[]'))}catch{}},[]);
 const save=()=>{const item={id:crypto.randomUUID(),name:name.trim()||'پروژه بدون عنوان',updatedAt:new Date().toLocaleString('fa-IR'),data:document.querySelector('.canvas')?.outerHTML||''};const next=[item,...projects.filter(p=>p.name!==item.name)].slice(0,30);localStorage.setItem(key,JSON.stringify(next));setProjects(next);setOpen(true)};
 const remove=(id:string)=>{const next=projects.filter(p=>p.id!==id);localStorage.setItem(key,JSON.stringify(next));setProjects(next)};
 const openProject=(project:SavedProject)=>{document.dispatchEvent(new CustomEvent('vage:project-open',{detail:project}));setOpen(false)};
 return <><button className="project-manager-trigger" onClick={()=>setOpen(true)}>پروژه‌ها</button>{open&&<div className="project-manager-backdrop" onClick={()=>setOpen(false)}><section className="project-manager" onClick={e=>e.stopPropagation()}><header><strong>مدیریت پروژه‌ها</strong><button onClick={()=>setOpen(false)}>×</button></header><div className="project-save-row"><input value={name} onChange={e=>setName(e.target.value)} placeholder="نام پروژه"/><button onClick={save}>ذخیره پروژه</button></div>{projects.length===0?<p className="project-empty">هنوز پروژه‌ای ذخیره نشده است.</p>:<div className="project-list">{projects.map(p=><div className="project-card" key={p.id}><div><strong>{p.name}</strong><small>{p.updatedAt}</small></div><button onClick={()=>openProject(p)}>باز کردن</button><button className="danger" onClick={()=>remove(p.id)}>حذف</button></div>)}</div>}</section></div>}</>;
}
