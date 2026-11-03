/** Development-only isolated chamber. Uses the production input, renderer and simulation. */
import * as THREE from 'three';
import {TUNING,TUNING_FIELDS,createTuning} from '../shared/tuning.js';
import {unitsOf} from '../shared/config-meta.js';
import {SimulationEngine} from '../simulation/engine.js';
import {createGameRenderer,createGameView} from '../render/index.js';
import {createInputAdapter} from '../input/adapter.js';
import {canPlaceDeployable} from '../gameplay/course-powerups.js';
if (!import.meta.env.DEV) throw new Error('Preview requires the development server');

const $=id=>document.getElementById(id),canvas=document.querySelector('canvas');
const course={name:'Bumper chamber',tee:[100,200],hole:[650,200],tiles:[[0,0,800,400]],w:[[0,0,800,8],[0,392,800,8],[0,0,8,400],[792,0,8,400]],q:[],pl:[],rp:[],pd:[],tp:[],pit:[],sand:[],ice:[],slime:[],fan:[],tornado:[],movers:[]};
const settings=structuredClone(TUNING.deployables);
const renderer=createGameRenderer({THREE,canvas,deployableSettings:settings});
const view=createGameView({renderer});view.setCourse(course,0);
let engine,player,objects=[],placement=null,seq=0,acc=0,time=0,last=performance.now(),disposed=false,raf;
const say=text=>{$('status').textContent=text;};
const object=(kind,x,y)=>({id:'d'+(++seq),kind,x,y,z:0,impacts:0,owner:'preview',placedAt:0,map:0,putt:0,round:0});
function reset(){engine?.dispose();engine=new SimulationEngine(course);player=engine.addPlayer('preview','Preview');player.deployableSettings=settings;objects=[object($('kind').value,350,200)];player.deployables=objects;placement=null;acc=0;time=0;input?.cancel();say('Ready. Try a direct hit or skim the Orbital pull ring.');}
const ray=new THREE.Raycaster();
const point=(x,y)=>{const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),renderer.camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-5),new THREE.Vector3());};
const simPoint=p=>({x:p.x-renderer.course.transform.origin[0],y:p.z-renderer.course.transform.origin[1]});
const input=createInputAdapter({canvas,camera:view.rig,pickGround:point,getState:()=>({active:true,mode:player?.mode ?? 'play',moving:!!player?.moving,connected:true,transitioning:false}),
  dispatch:c=>{if(c.type==='shot')engine.launch('preview',c.angle,c.power);else if(c.type==='cycle-camera')view.rig.cycleView();},
  placement:{active:()=>!!placement,cancel:()=>{placement=null;say('Placement cancelled.');},move:p=>{Object.assign(placement,simPoint(p));placement.valid=canPlaceDeployable(course,placement.x,placement.y,time,objects,settings);},confirm:p=>{const at=simPoint(p);if(!canPlaceDeployable(course,at.x,at.y,time,objects,settings)){say('Choose clear level ground.');return;}objects.push(object(placement.kind,at.x,at.y));placement=null;player.deployables=objects;say('Placed. Your own ball is affected too.');}}});
reset();input.setAimAngle(0);
$('reset').onclick=reset;$('kind').onchange=reset;
$('launch').onclick=()=>{if(!player.moving && player.mode==='play')engine.launch('preview',0,0.8);};
$('place').onclick=()=>{input.cancel();placement={kind:$('kind').value,x:350,y:250,valid:true};say('Choose a spot. Right-click or Escape cancels.');};
const rows=[];
for(const [path,min,max,description] of TUNING_FIELDS.filter(([p])=>['bumperRadius','bumperRestitution','maxImpacts','orbitalRange','orbitalPull','height','contactRelease'].some(k=>p==='deployables.'+k))){
  const key=path.split('.')[1],label=document.createElement('label'),value=document.createElement('output'),range=document.createElement('input'),note=document.createElement('small'),resetButton=document.createElement('button');
  range.type='range';range.min=min;range.max=max;range.step=key==='maxImpacts'?1:max<=20?0.1:max<=2?0.01:1;range.value=settings[key];
  value.textContent=String(settings[key]);note.textContent=`${unitsOf('tuning',path)} · ${min}–${max} · default ${TUNING.deployables[key]}. ${description}`;resetButton.textContent='Reset';resetButton.type='button';
  range.oninput=()=>{try{apply({...settings,[key]:Number(range.value)});}catch(e){say(e.message);refresh();}};
  resetButton.onclick=()=>apply({...settings,[key]:TUNING.deployables[key]});label.append(key+' ',value,range,note,resetButton);$('fields').append(label);rows.push({key,range,value});
}
function refresh(){for(const r of rows){r.range.value=settings[r.key];r.value.textContent=String(settings[r.key]);}}
function apply(next){
  if(!next || typeof next!=='object' || Array.isArray(next) || Object.keys(next).some(k=>!Object.hasOwn(TUNING.deployables,k)))throw new Error('Unknown deployable setting');
  const validated=createTuning({deployables:next}).deployables;Object.assign(settings,validated);refresh();reset();
}
$('defaults').onclick=()=>apply(TUNING.deployables);
$('export').onclick=()=>{$('json').value=JSON.stringify({version:1,deployables:Object.fromEntries(Object.entries(settings).filter(([k,v])=>TUNING.deployables[k]!==v))},null,2);say('Exported temporary overrides.');};
$('import').onclick=()=>{try{const v=JSON.parse($('json').value);if(v.version!==1 || Object.keys(v).some(k=>!['version','deployables'].includes(k)))throw new Error('Expected version 1 deployables overrides');if(!v.deployables || Object.keys(v.deployables).some(k=>!rows.some(r=>r.key===k)))throw new Error('Import only the editable physics settings');apply(v.deployables);}catch(e){say('Import rejected: '+e.message);}};
function frame(now){if(disposed)return;const dt=Math.min(0.05,(now-last)/1000);last=now;acc+=dt;time+=dt;
  while(acc>=1/240){
    for(const e of engine.step().events)if(e.type==='deployable_hit'){
      const o=objects.find(o=>o.id===e.id);if(o){o.impacts++;if(o.impacts>=settings.maxImpacts)objects=objects.filter(v=>v.id!==o.id);player.deployables=objects;say(`${o.kind}: ${Math.max(0,settings.maxImpacts-o.impacts)} impacts left`);}
    }acc-=1/240;
  }
  renderer.resize(canvas.parentElement.clientWidth);
  view.frame({now,dt,hazardTime:time,local:{...player,color:0},remotes:[],aim:input.frameAim(now/1000),keys:input.keys,deployables:objects,placement});raf=requestAnimationFrame(frame);
}
raf=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);input.dispose();engine.dispose();view.dispose();},{once:true});
