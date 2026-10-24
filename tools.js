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


// ---------- headless smoke test (needs: npm i jsdom, installed outside the project tree) ----------

function bootGame(JSDOM,PeerImpl){
 const html=read(),src=gameSrc(html),three=html.match(/<script>\/\* three\.js \(inlined\) \*\/([\s\S]*?)<\/script>/)[1];
 const dom=new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g,''),{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/'});
 const w=dom.window,errs=[];
 w.addEventListener('error',e=>errs.push(String(e.message)));w.console.error=(...a)=>errs.push(a.join(' '));w.alert=m=>errs.push('alert: '+m);
 const ctx=new Proxy(function(){},{get:(t,k)=>k==='measureText'?()=>({width:10}):ctx,set:()=>true,apply:()=>ctx});
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 w.matchMedia=w.matchMedia||(()=>({matches:false,addEventListener(){},addListener(){}}));
 w.eval(three);
 w.THREE.WebGLRenderer=function(){return{capabilities:{getMaxAnisotropy:()=>1},shadowMap:{},setSize(){},setPixelRatio(){},render(){}};};
 w.Peer=PeerImpl;w.__PP_TEST=true;
 try{w.eval(src);}catch(e){errs.push('LOAD '+e.stack);}
 return{w,errs,$:id=>w.document.getElementById(id),P:()=>w.__pp,room:()=>w.__pp.room};
}
// In-memory stand-in for PeerJS: same API surface the game uses (Peer(id?), on, connect, destroy; conn.send/on/close/open/peer). Messages are JSON-cloned and delayed 2-3 ms.
function makeNet(){const reg={};let n=0;const D=2;
 class Conn{constructor(peer){this.peer=peer;this.open=false;this.h={};this.other=null;}
  on(e,f){(this.h[e]=this.h[e]||[]).push(f);return this;}
  emit(e,a){(this.h[e]||[]).slice().forEach(f=>f(a));}
  send(m){const o=this.other;if(!this.open||!o)return;const d=JSON.parse(JSON.stringify(m));setTimeout(()=>{if(o.open)o.emit('data',d);},D);}
  close(){if(!this.open)return;const o=this.other;this.open=false;this.other=null;setTimeout(()=>{this.emit('close');if(o&&o.open){o.open=false;o.other=null;o.emit('close');}},D);}}
 class Peer{constructor(a){this.h={};this.conns=[];this.dead=false;const hid=typeof a==='string'?a:null;this.id=hid||'g'+(++n)+Math.random().toString(36).slice(2,5);
  if(hid&&reg[hid]){setTimeout(()=>this.emit('error',{type:'unavailable-id'}),D);return;}
  reg[this.id]=this;setTimeout(()=>{if(!this.dead)this.emit('open',this.id);},D);}
  on(e,f){(this.h[e]=this.h[e]||[]).push(f);return this;}
  emit(e,a){(this.h[e]||[]).slice().forEach(f=>f(a));}
  connect(rid){const cc=new Conn(rid),hc=new Conn(this.id);this.conns.push(cc);
   setTimeout(()=>{const t=reg[rid];if(!t||t.dead){cc.emit('error',new Error('no peer'));return;}cc.other=hc;hc.other=cc;t.conns.push(hc);t.emit('connection',hc);setTimeout(()=>{cc.open=hc.open=true;hc.emit('open');cc.emit('open');},D);},D);return cc;}
  destroy(){this.dead=true;if(reg[this.id]===this)delete reg[this.id];this.conns.forEach(c=>c.close());}}
 return{Peer,reg};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,ms=15000)=>{const t=Date.now();while(Date.now()-t<ms){try{if(f())return true;}catch(e){}await sleep(50);}return false;};
async function smoke(){
 let JSDOM;try{({JSDOM}=require('jsdom'));}catch(e){console.log('needs jsdom: run "npm i jsdom" in a scratch folder and set NODE_PATH to its node_modules');process.exit(2);}
 let fails=0;const ok=(n,c,x='')=>{if(!c)fails++;console.log((c?'PASS ':'FAIL ')+n+(!c&&x?' :: '+x:''));return !!c;};
 const g=bootGame(JSDOM,function(){throw new Error('no network in solo smoke test');}),errs=g.errs,$=g.$,P=g.P,room=g.room;
 if(!ok('game script loads and test hook present',P(),errs[0]))return finish();
 const s=P().sway,sp=P().spread;
 ok('sway is exactly 0 at every crossing (t=0, 0.7, 1.4)',[0,.7,1.4].every(t=>Math.abs(s(1,t))<1e-9));
 ok('sway is deterministic',s(.8,3.3)===s(.8,3.3)&&s(.8,3.3)===s(.8,3.3));
 ok('sway peak equals spread(p) and grows with power',Math.abs(Math.abs(s(1,.35))-sp(1))<1e-9&&sp(.9)>sp(.4));
 $('solo').click();
 ok('solo room reaches lobby',await until(()=>room()&&room().phase==='lobby'));
 $('mode').value='3';$('startgame').click();
 ok('Start opens voting (tournament, 3 maps)',await until(()=>room().phase==='select'&&room().mode==='tournament'&&room().series===3));
 const maps=[0,8,0],want=[11,23,35];
 for(let m=0;m<3;m++){
  g.w.document.querySelector('#mapgrid [data-map="'+maps[m]+'"]').click();
  if(!ok(`map ${m+1}: vote locks the map and play starts`,await until(()=>room().phase==='play'&&room().map===maps[m]&&room().putt===0,8000)))return finish();
  for(let k=0;k<6;k++){
   if(!ok(`map ${m+1} putt ${k+1}: ready`,await until(()=>{const r=room(),me=P().me;return r.phase==='play'&&r.putt===k&&me.mode==='play'&&me.h===r.map&&P().now()>=r.startAt;},12000)))return finish();
   P().me.str=(k===0&&m===0)?1:2;P().sink(false);
   if(k===0&&m===0)ok('hole-in-one banner appears',await until(()=>$('banner').textContent.includes('HOLE IN ONE'),4000));
   if(k<5){if(!ok(`map ${m+1} putt ${k+1}: all done -> next putt`,await until(()=>room().putt===k+1&&room().phase==='play',12000)))return finish();}
   else if(!ok(`map ${m+1}: results after putt 6`,await until(()=>room().phase==='results',12000)))return finish();
  }
  await sleep(200);const t=$('endt').textContent,last=m===2;
  ok(`map ${m+1}: cumulative total = ${want[m]}`,Object.values(room().totals)[0]?.t===want[m],JSON.stringify(room().totals));
  ok(`map ${m+1}: results text has winner${last?' and OVERALL CHAMPION':' and standings'}`,t.includes('Map winner')&&(last?t.includes('OVERALL CHAMPION'):t.includes('Standings after map '+(m+1)+'/3')),t);
  ok(`map ${m+1}: button label`,$('again').textContent===(last?'Back to lobby':'Next map vote'),$('again').textContent);
  $('again').click();
  ok(last?'tournament ends back in lobby, totals reset':`map ${m+1}: next vote opens`,await until(()=>last?(room().phase==='lobby'&&!Object.keys(room().totals).length&&room().mode==='standard'):(room().phase==='select'&&!Object.keys(room().votes).length&&room().mapNo===m+1)));
 }
 return finish();
 function finish(){ok('no runtime errors',!errs.length,errs.slice(0,3).join(' | '));console.log(fails?`SMOKE FAILED (${fails})`:'SMOKE PASSED');process.exit(fails?1:0);}
}


async function smokeMulti(){
 let JSDOM;try{({JSDOM}=require('jsdom'));}catch(e){console.log('needs jsdom (see smoke)');process.exit(2);}
 let fails=0;const ok=(n,c,x='')=>{if(!c)fails++;console.log((c?'PASS ':'FAIL ')+n+(!c&&x?' :: '+x:''));return !!c;};
 const net=makeNet(),N=4,G=[],finish=()=>{const errs=G.flatMap((x,i)=>x.errs.map(e=>'P'+(i+1)+': '+e));ok('no runtime errors on any client',!errs.length,errs.slice(0,3).join(' | '));console.log(fails?`MULTI SMOKE FAILED (${fails})`:'MULTI SMOKE PASSED');process.exit(fails?1:0);};
 for(let i=0;i<N;i++)G.push(bootGame(JSDOM,net.Peer));
 for(let i=0;i<N;i++){G[i].$('nm').value='P'+(i+1);G[i].$('rc').value='room1';G[i].$('go').click();
  if(!ok(`P${i+1} joins room`,await until(()=>G[i].P().R&&G[i].P().R.connected(),6000)))return finish();}
 ok('first player is host, the other three are guests',G[0].P().R.isHost()&&G.slice(1).every(x=>!x.P().R.isHost()));
 ok('all 4 clients see 4 named players in the lobby',await until(()=>G.every(x=>x.room().phase==='lobby'&&x.P().R.peers().filter(p=>p.presence.n).length===N),6000));
 G[2].$('startgame').click();await sleep(400);
 ok('a guest cannot start the game',G.every(x=>x.room().phase==='lobby'));
 G[0].$('mode').value='1';G[0].$('startgame').click();
 ok('host Start opens voting on every client',await until(()=>G.every(x=>x.room().phase==='select'),4000));
 const card=(i,m)=>G[i].w.document.querySelector('#mapgrid [data-map="'+m+'"]');
 card(1,8).click();
 ok('first guest vote starts the 15 s countdown on the host',await until(()=>G[0].room().deadline>0&&Object.keys(G[0].room().votes).length===1,3000));
 ok('every client sees that vote',await until(()=>G.every(x=>Object.keys(x.room().votes).length===1),3000));
 card(2,0).click();card(3,8).click();await sleep(300);
 ok('voting does not end until everyone has voted',G[0].room().phase==='select');
 card(0,8).click();
 ok('last vote locks the winning map (8) and play starts on all clients',await until(()=>G.every(x=>x.room().phase==='play'&&x.room().map===8&&x.room().putt===0),6000));
 const str=(i,k)=>i===0?1:1+((i+k)%3),tot=[0,0,0,0];
 for(let k=0;k<6;k++){
  if(!ok(`putt ${k+1}: all 4 clients ready`,await until(()=>G.every(x=>{const r=x.room(),me=x.P().me;return r.phase==='play'&&r.putt===k&&me.mode==='play'&&me.h===r.map&&x.P().now()>=r.startAt;}),12000)))return finish();
  for(let i=0;i<N-1;i++){G[i].P().me.str=str(i,k);G[i].P().sink(false);tot[i]+=str(i,k);}
  await sleep(900);
  ok(`putt ${k+1}: game waits for the last player`,G.every(x=>x.room().putt===k&&x.room().phase==='play'));
  G[N-1].P().me.str=str(N-1,k);G[N-1].P().sink(false);tot[N-1]+=str(N-1,k);
  if(k===0)ok('guests see the host\'s hole-in-one banner',await until(()=>G[2].$('banner').textContent.includes('HOLE IN ONE'),4000));
  if(k<5){if(!ok(`putt ${k+1}: everyone advances together`,await until(()=>G.every(x=>x.room().putt===k+1&&x.room().phase==='play'),12000)))return finish();}
  else if(!ok('after putt 6 all clients reach results',await until(()=>G.every(x=>x.room().phase==='results'),12000)))return finish();
 }
 await sleep(300);const T=Object.values(G[0].room().totals);
 ok('map totals match each player\'s strokes',[0,1,2,3].every(i=>T.find(t=>t.n==='P'+(i+1))?.t===tot[i]),JSON.stringify(T)+' vs '+tot);
 ok('lowest score (P1) is the sole map winner',G[0].room().last.win.length===1&&G[0].room().last.names[G[0].room().last.win[0]]==='P1');
 ok('guest results text names the winner',G[2].$('endt').textContent.includes('Map winner: P1'),G[2].$('endt').textContent);
 G[1].$('again').click();await sleep(300);
 ok('a guest cannot leave results',G.every(x=>x.room().phase==='results'));
 G[0].$('again').click();
 ok('host returns everyone to the lobby',await until(()=>G.every(x=>x.room().phase==='lobby'),4000));
 // ---- player drops out mid-putt ----
 G[0].$('mode').value='1';G[0].$('startgame').click();
 await until(()=>G.every(x=>x.room().phase==='select'),4000);
 [0,1,2,3].forEach(i=>card(i,0).click());
 ok('second round starts (map 0)',await until(()=>G.every(x=>x.room().phase==='play'&&x.room().map===0&&x.room().putt===0),6000));
 await until(()=>G.every(x=>x.P().me.mode==='play'&&x.P().now()>=x.room().startAt),8000);
 const gone=G[3].P().R.id();net.reg[gone].destroy();
 ok('host notices the disconnect (3 players left)',await until(()=>G[0].P().R.peers().filter(p=>p.presence.n).length===3,4000));
 for(let i=0;i<3;i++){G[i].P().me.str=2;G[i].P().sink(false);}
 ok('remaining players advance without the dropped player',await until(()=>[0,1,2].every(i=>G[i].room().putt===1&&G[i].room().phase==='play'),12000));
 return finish();
}
const[,,cmd,...args]=process.argv;
if(cmd==='check'){new vm.Script(gameSrc(read()));console.log('SYNTAX_OK',(read().length/1024|0)+' KB');}
else if(cmd==='list'){const A=load();A.HOLES.forEach((h,i)=>console.log(i,h.name,A.NP(i)>1?'6 putts':'1 putt'));}
else if(cmd==='arena'){const names=args.length?[args.join(' ')]:Object.keys(SPECS);for(const n of names)console.log(n,'-> map index',applyArena(n));}
else if(cmd==='solve'){const full=args.includes('--full'),nums=args.filter(a=>a!=='--full').map(Number),A=load(),mi=nums[0]??0;
 const list=nums[1]!==undefined?[nums[1]]:[...Array(A.NP(mi)).keys()];let all=true;
 for(const pi of list){const t=Date.now(),r=solve(A,mi,pi,full);if(!r.best)all=false;console.log(`${A.HOLES[mi].name} putt ${pi+1}: ${full?r.hits+' hole-in-one shots, ':''}robust: ${r.best?JSON.stringify(r.best):'NONE'} (${((Date.now()-t)/1000).toFixed(1)}s)`);}
 console.log(all?'ALL PUTTS VERIFIED':'SOME PUTTS FAIL');}
else if(cmd==='smoke')smoke();
else if(cmd==='smoke-multi')smokeMulti();
else console.log('usage: node tools.js check | list | smoke | smoke-multi | solve <map> [putt] [--full] | arena [map name]');
