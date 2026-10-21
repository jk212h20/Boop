// Development-only, deterministic staging adapter for the rules film.
// Production gameplay remains authoritative; no scripted placements enter a game.
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { CatActor, CatModel, BedShell, Room, QuiltCell } from './FloatingBoard3D';
import { createFabricTextures, createQuiltPatchGeometry, createQuiltStitches, readQuiltColors } from '../rendering/boardAppearance';
import type { Piece } from '../types';

type Actor = Piece & { r: number; c: number; to?: [number,number]; pool?: boolean };
const k = (r:number,c:number,color:'orange'|'gray'='orange',type:'kitten'|'cat'='kitten',to?:[number,number]):Actor => ({r,c,color,type,to});
export function filmActors(id:string,t:number): Actor[] {
  const motionT=(id==='strength'||id==='limits')&&t>=.5?(t-.5)*2:t;
  const u=Math.max(0,Math.min(1,(motionT-.26)/.20));
  let a:Actor[]=[];
  if(id==='welcome'||id==='recap') a=[k(2,1,'orange','cat'),k(2,2,'orange','cat'),k(2,3,'orange','cat')];
  if(id==='setup') a=t>.62?[k(2,2)]:[];
  if(id==='boop') { for(let r=1;r<=3;r++)for(let c=1;c<=3;c++)if(r!==2||c!==2)a.push(k(r,c,(r+c)%2?'orange':'gray','kitten',[r+(r-2),c+(c-2)])); if(t>.20)a.push(k(2,2)); }
  if(id==='edge') a=[k(0,2,'gray','kitten',[-1,2]),...(t>.20?[k(1,2)]:[])];
  if(id==='limits') a=t<.5?[k(2,2,'gray'),k(2,3),...(t>.12?[k(2,1)]:[])]:[k(2,2,'gray','kitten',[2,3]),k(2,4),...(t>.55?[k(2,1)]:[])];
  if(id==='graduate'||id==='mixed') { a=[k(2,1),k(2,2,'orange',id==='mixed'?'cat':'kitten'),k(2,3)]; if(t>.80)a=[]; }
  if(id==='strength') a=t<.5?[k(2,2,'gray','cat'),...(t>.12?[k(2,1)]:[])]:[k(2,2,'gray','cat',[2,3]),...(t>.55?[k(2,1,'orange','cat')]:[])];
  if(id==='eight'||id==='win'&&t>.57) a=[[0,0],[0,2],[0,4],[2,0],[2,3],[3,5],[4,1],[5,4]].map(([r,c],i)=>k(r,c,'orange',id==='win'?'cat':i===1?'cat':'kitten'));
  if(id==='eight'&&t>.64)a=a.filter((_,i)=>i!==0);
  if(id==='choice') a=[k(2,1),k(2,2),k(2,3),k(2,4)];
  if(id==='win'&&t<=.57)a=[k(2,1,'orange','cat'),k(2,2,'orange','cat'),k(2,3,'orange','cat')];
  return a.map(p=>p.to?{...p,r:p.r+(p.to[0]-p.r)*u,c:p.c+(p.to[1]-p.c)*u}:p);
}
export function filmPoolCount(id:string,t:number,color:'orange'|'gray') {
  if(id==='setup')return color==='orange'&&t>.62?7:8;
  if(['graduate','mixed','eight'].includes(id)&&t>.80&&color==='orange')return id==='eight'?1:3;
  return 0;
}
export function floorKittenPose(i:number,t:number,color:'orange'|'gray') {
  const points=[[3.5,1.5],[4.2,.9],[3.6,2.5],[4.2,2.7],[2.8,3.2],[2.9,4],[1.8,3.8],[4.5,1.9]];
  const [x,z]=points[i];const sign=color==='orange'?1:-1;
  const phase=(i%3===0?t*4:0)+i*1.7;
  return {position:[sign*x+Math.sin(phase)*.15,-1.03,z+Math.cos(phase)*.16] as [number,number,number], heading:Math.atan2(Math.cos(phase),-Math.sin(phase))};
}
function World({id,t}:{id:string;t:number}) {
  const fabric=useMemo(()=>({...createFabricTextures(),patch:createQuiltPatchGeometry(),stitches:createQuiltStitches()}),[]);
  const colors=useMemo(readQuiltColors,[]);
  useEffect(()=>()=>{fabric.map.dispose();fabric.bumpMap.dispose();fabric.patch.dispose();fabric.stitches.dispose();},[fabric]);
  const {camera,scene}=useThree();
  useEffect(()=>{(window as any).filmBoopProbe=()=>{const values:any[]=[];scene.traverse(node=>{if(node.userData.catProbe)values.push({id:node.userData.catProbe,x:node.position.x,y:node.position.y,z:node.position.z});});return values;};return ()=>{delete (window as any).filmBoopProbe;};},[scene]);
  useEffect(()=>{
    const intro=id==='welcome'||id==='recap';
    const angle=intro ? -.20+t*.38 : 0;
    camera.position.set(Math.sin(angle)*15, intro?11:15, intro?13:7.5);
    camera.lookAt(0,.25,0);camera.updateProjectionMatrix();
  },[camera,id,t]);
  const poolCats=['graduate','mixed','eight'].includes(id)&&t>.80;
  return <>
    <ambientLight intensity={1.5}/><directionalLight position={[-5,9,4]} intensity={2.1} color="#fff0d8" castShadow shadow-mapSize={[2048,2048]}/>
    <directionalLight position={[6,4,-5]} intensity={1.2} color="#e8efff"/>
    <Room fabric={fabric} quiltColors={colors} onOpenBook={()=>{}} onOpenVideo={()=>{}}/>
    <BedShell fabric={fabric} quiltColors={colors}/>
    {Array.from({length:6},(_,row)=>Array.from({length:6},(_,col)=><QuiltCell key={`${row}-${col}`} row={row} col={col} enabled={false} active={false} hovered={false} colors={colors} fabric={fabric} onClick={()=>{}} onHover={()=>{}}/>))}
    {['boop','strength','limits','edge'].includes(id)&&t>.20&&<mesh position={[((id==='edge'?2: id==='boop'?2:1)-2.5)*1.17, .48, ((id==='edge'?1:2)-2.5)*1.17]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[.43,.48,48]}/><meshBasicMaterial color="#d99536"/></mesh>}
    {filmActors(id,t).map((p,i)=>id==='boop'?<CatActor key={`boop-${i}`} piece={p} row={p.to?.[0]??p.r} col={p.to?.[1]??p.c} boop={p.to?{fromRow:(p.to[0]+2)/2,fromCol:(p.to[1]+2)/2}:undefined} isNew={!p.to} animationKey={1} filmElapsed={(t-.20)*11.17}/>:<group key={`${id}-${i}-${p.type}`} position={id==='edge'&&i===0&&t>.70?[-4.5,-1.03,3.8]:[(p.c-2.5)*1.17,.49+(['graduate','mixed'].includes(id)?Math.max(0,t-.62)*6:0),(p.r-2.5)*1.17]} scale={p.type==='kitten'?.55:.65}><CatModel piece={p} clip={(id==='win'||id==='recap'||id==='welcome')?'Dance':'Sit'} seed={i*.2} filmTime={t*12}/></group>)}
    {['orange','gray'].map(color=>Array.from({length: filmPoolCount(id,t,color as 'orange'|'gray')},(_,i)=><group key={`${color}-${i}`} position={poolCats?[-.85+i*.85,-1.03,4.0]:floorKittenPose(i,t,color as 'orange'|'gray').position} rotation={[0,poolCats?0:floorKittenPose(i,t,color as 'orange'|'gray').heading,0]} scale={.44}><CatModel piece={{color:color as 'orange'|'gray',type:poolCats?'cat':'kitten'}} clip={poolCats?'Sit':i%3===0?'Walk':i%3===1?'Curious':'Sit'} seed={i*.37} filmTime={t*12}/></group>))}
    <Environment resolution={64}><Lightformer position={[0,8,4]} intensity={2} scale={[12,6,1]} rotation={[-Math.PI/2,0,0]}/></Environment>
  </>;
}
export function RulesFilmStage(){
  const [frame,setFrame]=useState({id:'welcome',t:0});
  useEffect(()=>{(window as any).filmFrame=async(id:string,t:number)=>{
    setFrame({id,t});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return document.querySelector('canvas')!.toDataURL('image/png').split(',')[1];
  };return ()=>{delete (window as any).filmFrame;};},[]);
  return <div style={{width:1280,height:900,background:'#b8bcc9'}}><Canvas shadows camera={{position:[0,15,7.5],fov:46}} gl={{preserveDrawingBuffer:true,antialias:true}} dpr={1}><Suspense fallback={null}><World {...frame}/></Suspense></Canvas></div>;
}
