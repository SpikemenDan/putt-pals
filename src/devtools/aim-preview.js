/** Isolated U2 chamber. No online rooms or shipped configuration are changed here. */
import * as THREE from 'three';
import {TUNING,TUNING_FIELDS,createTuning} from '../shared/tuning.js';
import {DISPLAY,DISPLAY_FIELDS,createDisplay} from '../shared/display.js';
import {unitsOf} from '../shared/config-meta.js';
import {SimulationEngine} from '../simulation/engine.js';
import {createGameRenderer,createGameView} from '../render/index.js';
import {createInputAdapter} from '../input/adapter.js';

if (!import.meta.env.DEV) throw new Error('Aim preview requires the development server');
const $=id=>document.getElementById(id),canvas=document.querySelector('canvas');
const mappingKeys=['fullPullPx','canvasPullFraction'];
const mapping=Object.fromEntries(mappingKeys.map(k=>[k,TUNING.aim[k]]));
const launchSettings={shotPower:TUNING.shotPower};
const display=structuredClone(DISPLAY);
const course={name:'Aim chamber',tee:[120,200],hole:[650,200],tiles:[[0,0,800,400]],w:[[0,0,800,8],[0,392,800,8],[0,0,8,400],[792,0,8,400]],q:[],pl:[],rp:[],pd:[],tp:[],pit:[],sand:[],ice:[],slime:[],fan:[],tornado:[],movers:[]};
const renderer=createGameRenderer({THREE,canvas,display});
const view=createGameView({renderer});view.setCourse(course,0);
let engine,player,accumulator=0,last=performance.now(),disposed=false,raf;
const status=text=>{$('status').textContent=text;};
function reset(){engine?.dispose();engine=new SimulationEngine(course);player=engine.addPlayer('preview','Preview');accumulator=0;input?.cancel();input?.setAimAngle(0);}
const ray=new THREE.Raycaster();
const input=createInputAdapter({canvas,camera:view.rig,display,aimSettings:mapping,
  pickGround(x,y){const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1),renderer.camera);return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-5),new THREE.Vector3());},
  getState:()=>({active:true,mode:player?.mode ?? 'play',moving:!!player?.moving,connected:true,transitioning:false}),
  dispatch:c=>{if(c.type==='shot')engine.launch('preview',c.angle,c.power,launchSettings.shotPower);else if(c.type==='cycle-camera')view.rig.cycleView();},
});
reset();$('reset').onclick=reset;$('camera').onclick=()=>view.rig.cycleView();
const rows=[];
const fields=[...TUNING_FIELDS.filter(([p])=>p==='shotPower').map(f=>['launch',...f]),...TUNING_FIELDS.filter(([p])=>mappingKeys.some(k=>p==='aim.'+k)).map(f=>['mapping',...f]),...DISPLAY_FIELDS.filter(([p])=>p.startsWith('aim.')).map(f=>['display',...f])];
for(const [domain,path,min,max,description] of fields){
  const key=path.split('.').at(-1),label=document.createElement('label'),output=document.createElement('output'),range=document.createElement('input'),note=document.createElement('small'),button=document.createElement('button');
  const shipped=domain==='launch'?TUNING[key]:domain==='mapping'?TUNING.aim[key]:DISPLAY.aim[key];
  range.type='range';range.min=min;range.max=max;range.step=max<=5?0.01:max<=100?0.1:1;range.dataset.setting=domain+'.'+key;
  note.textContent=`${unitsOf(domain==='display'?'display':'tuning',path)} · ${min}–${max} · default ${shipped}. ${description}`;
  button.textContent='Reset';button.type='button';
  const change=value=>{
    const next={shotPower:launchSettings.shotPower,aim:{...mapping},display:{aim:{...display.aim}}};
    if(domain==='launch')next.shotPower=value;else (domain==='mapping'?next.aim:next.display.aim)[key]=value;
    try{apply(next,domain!=='display');status(domain==='display'?'Arrow appearance changed live.':'Power setting changed; ball reset.');}catch(e){status(e.message);refresh();}
  };
  range.oninput=()=>change(Number(range.value));button.onclick=()=>change(shipped);
  label.append(`${domain==='launch'?'Launch':domain==='mapping'?'Power':'Arrow'} · ${key} `,output,range,note,button);$('fields').append(label);rows.push({domain,key,range,output});
}
function refresh(){for(const row of rows){const value=row.domain==='launch'?launchSettings[row.key]:row.domain==='mapping'?mapping[row.key]:display.aim[row.key];row.range.value=value;row.output.textContent=String(value);}}
function apply(config,restart=true){
  if(!config || typeof config!=='object' || Array.isArray(config) || Object.keys(config).some(k=>!['aim','display','shotPower'].includes(k)))throw new Error('Expected aim and display overrides');
  if(config.aim !== undefined && (!config.aim || typeof config.aim!=='object' || Array.isArray(config.aim) || Object.keys(config.aim).some(k=>!mappingKeys.includes(k))))throw new Error('Only fullPullPx and canvasPullFraction are editable power settings');
  if(config.display !== undefined && (!config.display || typeof config.display !== 'object' || Array.isArray(config.display) || Object.keys(config.display).some(k=>k!=='aim')))throw new Error('Only aim display settings are editable');
  const nextMapping=createTuning({aim:config.aim ?? {},shotPower:config.shotPower === undefined ? TUNING.shotPower : config.shotPower}),nextDisplay=createDisplay(config.display ?? {});
  // Validate everything before applying anything.
  for(const key of mappingKeys)mapping[key]=nextMapping.aim[key];
  launchSettings.shotPower=nextMapping.shotPower;
  Object.assign(display.aim,nextDisplay.aim);refresh();if(restart)reset();
}
$('defaults').onclick=()=>{apply({});status('Restored shipped defaults and reset the ball.');};
$('export').onclick=()=>{
  const aim=Object.fromEntries(mappingKeys.filter(k=>mapping[k]!==TUNING.aim[k]).map(k=>[k,mapping[k]]));
  const appearance=Object.fromEntries(Object.entries(display.aim).filter(([k,v])=>v!==DISPLAY.aim[k]));
  $('json').value=JSON.stringify({version:1,...(launchSettings.shotPower!==TUNING.shotPower?{shotPower:launchSettings.shotPower}:{}),aim,display:{aim:appearance}},null,2);status('Exported temporary overrides.');
};
$('import').onclick=()=>{try{const v=JSON.parse($('json').value);if(v.version!==1 || Object.keys(v).some(k=>!['version','aim','display','shotPower'].includes(k)))throw new Error('Expected version 1 aim overrides');apply({aim:v.aim,display:v.display,shotPower:v.shotPower});status('Imported validated overrides and reset the ball.');}catch(e){status('Import rejected: '+e.message);}};
refresh();
function frame(now){
  if(disposed)return;const dt=Math.min(0.05,(now-last)/1000);last=now;accumulator+=dt;
  while(accumulator>=1/240){engine.step();accumulator-=1/240;}
  renderer.resize(canvas.parentElement.clientWidth);
  const guide=input.frameAim(now/1000),fullPull=Math.min(mapping.fullPullPx,canvas.clientWidth*mapping.canvasPullFraction);
  $('fill').style.width=(input.charge*100)+'%';
  $('readout').textContent=input.charging?`${(input.charge*fullPull).toFixed(1)} px effective pull · ${(input.charge*100).toFixed(1)}% power · ${(input.charge*display.aim.arrowMaxLength).toFixed(1)} world-unit arrow`:player.moving?'Ball rolling · Reset ball to try again':'Pull to set power';
  $('mapping').textContent=`Full power launches at ${launchSettings.shotPower} units/s after ${fullPull.toFixed(1)} CSS px on this ${canvas.clientWidth}px-wide canvas. Twice the pull gives twice the power until full charge.`;
  view.frame({now,dt,local:{...player,color:0},remotes:[],aim:guide,keys:input.keys});raf=requestAnimationFrame(frame);
}
raf=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);input.dispose();engine.dispose();view.dispose();},{once:true});
