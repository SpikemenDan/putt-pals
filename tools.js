#!/usr/bin/env node
// Putt Pals tooling (one file).  node tools.js check | solve <map> [putt] [--full] | arena [map name] | list
// solve: runs the game's REAL physics headlessly and searches for a hole-in-one (centered release, no sway).
// A putt passes when a shot also works at +-0.4 deg and +-2.5% power ("robust").  Fast mode stops at the first robust shot.
const fs=require('fs'),vm=require('vm'),path=require('path');
const FILE=process.env.F||path.join(__dirname,'putt-pals.html');
const read=()=>fs.readFileSync(FILE,'utf8');
const gameSrc=h=>{const m=h.match(/<script id="game">([\s\S]*?)<\/script>/);if(!m)throw Error('no <script id="game">');return m[1];};

// ---------- arena generator (six walled chambers, 3x2) ----------
const CELLS=[[46,46],[286,46],[526,46],[46,256],[286,256],[526,256]];
const PERIM=[[34,34,732,12],[34,454,732,12],[34,34,12,432],[754,34,12,432],[274,40,12,420],[514,40,12,420],[40,244,720,12]];
// chamber-local coords (228x198). keys: t tee, c cup, w walls, sand, pit [x,y,w,h]
const SPECS={
 'Switchback Garden':['Six chambers in one arena. Bank shots around walls and a pond; the camera warps to the next putt.',[
  {t:[34,34],c:[194,34],w:[[104,0,18,128]]},{t:[34,164],c:[194,34],w:[[104,100,18,98]]},
  {t:[34,100],c:[194,100],w:[[100,40,28,118]]},{t:[34,34],c:[194,164],w:[[0,86,112,14]]},
  {t:[34,100],c:[194,100],pit:[[80,50,70,98]]},{t:[34,34],c:[194,164],w:[[104,0,18,100]]}]],
 'Dune Serpent':['Six sandy chambers. Sand drags the ball, so bank shots need real power.',[
  {t:[30,170],c:[198,30],w:[[0,90,130,14]],sand:[[140,60,60,80]]},{t:[30,30],c:[198,170],w:[[100,70,14,128]],sand:[[130,100,80,70]]},
  {t:[30,100],c:[198,100],w:[[70,30,16,50],[130,120,16,50]],sand:[[100,0,30,198]]},{t:[30,170],c:[198,170],w:[[104,60,18,138]],sand:[[150,110,50,60]]},
  {t:[30,30],c:[198,170],w:[[0,86,140,14]],sand:[[150,100,60,80]]},{t:[30,170],c:[198,30],w:[[104,0,18,120]],sand:[[0,100,90,98]]}]]
};
function arenaLine(name){const[desc,P]=SPECS[name];let W=PERIM.map(r=>r.slice()),sand=[],pit=[],out=[];
 P.forEach((d,k)=>{const[ox,oy]=CELLS[k],mv=r=>[ox+r[0],oy+r[1],r[2],r[3]];
  W.push(...(d.w||[]).map(mv));sand.push(...(d.sand||[]).map(mv));pit.push(...(d.pit||[]).map(mv));
  out.push(`{tee:[${ox+d.t[0]},${oy+d.t[1]}],hole:[${ox+d.c[0]},${oy+d.c[1]}],par:2}`);});
 const j=JSON.stringify;return `course('${name}','${desc}',[80,80],[240,80],[[40,40,720,420]],{w:${j(W)},sand:${j(sand)},pit:${j(pit)},par:12,putts:[${out.join(',')}]}),\n`;}
function applyArena(name){let h=read();const re=new RegExp("course\\('"+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"'.*?\\n");
 if(!re.test(h))throw Error('map not found: '+name);h=h.replace(re,()=>arenaLine(name));fs.writeFileSync(FILE,h);
 return[...h.matchAll(/^course\('([^']+)'/gm)].map(m=>m[1]).indexOf(name);}

// ---------- headless physics ----------
function load(){const src=gameSrc(read());
 const cut=(a,b,incl)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw Error('marker not found: '+a+' / '+b);return src.slice(i,j+(incl?b.length:0));};
 const code=['const $=()=>({}),toast=()=>{},pub=()=>{},aim=()=>{};let R_=null,me,aa=0;',cut('const R=','\n];',true),
  cut('let PI_=0','const NP=','')+'const NP=i=>HOLES[i].putts?HOLES[i].putts.length:1;',cut('function fresh(','\n'),cut('function inside(','function frame(')].join('\n')
  +'\n;this.api={HOLES,fresh,H,step,surf,setPI:v=>{PI_=v;_hc=null;},setMe:v=>{me=v},NP};';
 const ctx={performance,Math,console};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.api;}
function solve(A,mi,pi,full){
 const trial=(ang,pw)=>{A.setPI(pi);const m=A.fresh('s',0);A.setMe(m);m.h=mi;const h=A.H();m.x=h.tee[0];m.y=h.tee[1];m.z=A.surf(h,...h.tee);m.str=1;m.prev=[m.x,m.y,m.z];
  m.vx=Math.cos(ang)*pw*820;m.vy=Math.sin(ang)*pw*820;m.moving=true;m.mt=0;for(let i=0;i<4800&&m.moving&&m.mode!=='sunk';i++)A.step();return m.mode==='sunk'&&!m.over&&m.str===1;};
 const robust=(a,p)=>{for(const da of[-.007,0,.007])for(const dp of[-.025,0,.025])if(!trial(a+da,Math.min(1,p+dp)))return false;return true;};
 let hits=0,best=null;
 for(let d=0;d<720&&(full||!best);d++){const a=d*Math.PI/360;for(let p=.3;p<=1.001;p+=.05)if(trial(a,p)){hits++;if(!best&&robust(a,p)){best={deg:+(a*180/Math.PI).toFixed(1),power:+p.toFixed(2)};if(!full)break;}}}
 return{hits,best};}

const[,,cmd,...args]=process.argv;
if(cmd==='check'){new vm.Script(gameSrc(read()));console.log('SYNTAX_OK',(read().length/1024|0)+' KB');}
else if(cmd==='list'){const A=load();A.HOLES.forEach((h,i)=>console.log(i,h.name,A.NP(i)>1?'6 putts':'1 putt'));}
else if(cmd==='arena'){const names=args.length?[args.join(' ')]:Object.keys(SPECS);for(const n of names)console.log(n,'-> map index',applyArena(n));}
else if(cmd==='solve'){const full=args.includes('--full'),nums=args.filter(a=>a!=='--full').map(Number),A=load(),mi=nums[0]??0;
 const list=nums[1]!==undefined?[nums[1]]:[...Array(A.NP(mi)).keys()];let all=true;
 for(const pi of list){const t=Date.now(),r=solve(A,mi,pi,full);if(!r.best)all=false;console.log(`${A.HOLES[mi].name} putt ${pi+1}: ${full?r.hits+' hole-in-one shots, ':''}robust: ${r.best?JSON.stringify(r.best):'NONE'} (${((Date.now()-t)/1000).toFixed(1)}s)`);}
 console.log(all?'ALL PUTTS VERIFIED':'SOME PUTTS FAIL');}
else console.log('usage: node tools.js check | list | solve <map> [putt] [--full] | arena [map name]');
