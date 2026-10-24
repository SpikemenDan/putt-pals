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
// chamber-local coords (228x198). keys: t tee, c cup position, cup cup radius 8..17 (optional), pd [x,y], tp [ax,ay,bx,by,color], fan [x,y,w,h,dx,dy,force], tornado [x,y,radius,+-strength], w walls, sand, ice, slime, pit [x,y,w,h]
// P6 test chambers (not a playable map): 0 fan, 1 teleporter, 2 jump pad, 3 tornado
const MECH=[
 {t:[30,170],c:[198,170],w:[[100,98,14,100]],fan:[[114,0,114,98,0,1,260]]},
 {t:[30,60],c:[200,140],w:[[107,0,14,198]],tp:[[70,90,160,90,0]]},
 {t:[30,100],c:[200,100],w:[[150,0,14,198]],slime:[[40,60,50,80]],pd:[[110,100]]},
 {t:[30,170],c:[198,170],w:[[100,60,14,138]],tornado:[[160,60,60,-250]]}];
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
function arenaData(P){const W=PERIM.map(r=>r.slice()),o={sand:[],ice:[],slime:[],pit:[],pd:[],tp:[],fan:[],tornado:[]},putts=[];
 P.forEach((d,k)=>{const[ox,oy]=CELLS[k],mv=r=>[ox+r[0],oy+r[1],r[2],r[3]];
  W.push(...(d.w||[]).map(mv));for(const key of['sand','ice','slime','pit'])o[key].push(...(d[key]||[]).map(mv));
  o.pd.push(...(d.pd||[]).map(r=>[ox+r[0],oy+r[1]]));                                   // jump pad [x,y]
  o.tp.push(...(d.tp||[]).map(r=>[ox+r[0],oy+r[1],ox+r[2],oy+r[3],r[4]||0]));            // teleporter pair [ax,ay,bx,by,color]
  o.fan.push(...(d.fan||[]).map(r=>[ox+r[0],oy+r[1],r[2],r[3],r[4],r[5],r[6]]));         // fan [x,y,w,h,dx,dy,force]
  o.tornado.push(...(d.tornado||[]).map(r=>[ox+r[0],oy+r[1],r[2],r[3]]));                // tornado [x,y,radius,strength(+/- = spin)]
  putts.push({tee:[ox+d.t[0],oy+d.t[1]],hole:[ox+d.c[0],oy+d.c[1]],cup:d.cup});});
 return{w:W,...o,putts};}
function arenaLine(name){const[desc,P]=SPECS[name],D=arenaData(P),j=JSON.stringify,f=k=>D[k].length?k+':'+j(D[k])+',':'';
 const putts=D.putts.map(p=>`{tee:${j(p.tee)},hole:${j(p.hole)},par:2${p.cup?',cup:'+p.cup:''}}`).join(',');
 return `course('${name}','${desc}',[80,80],[240,80],[[40,40,720,420]],{w:${j(D.w)},sand:${j(D.sand)},${f('ice')}${f('slime')}pit:${j(D.pit)},${f('pd')}${f('tp')}${f('fan')}${f('tornado')}par:12,putts:[${putts}]}),\n`;}
function applyArena(name){let h=read();const re=new RegExp("course\\('"+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"'.*?\\n");
 if(!re.test(h))throw Error('map not found: '+name);h=h.replace(re,()=>arenaLine(name));fs.writeFileSync(FILE,h);
 return[...h.matchAll(/^course\('([^']+)'/gm)].map(m=>m[1]).indexOf(name);}

// ---------- headless physics ----------
function load(){const src=gameSrc(read());
 const cut=(a,b,incl)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw Error('marker not found: '+a+' / '+b);return src.slice(i,j+(incl?b.length:0));};
 const code=['const $=()=>({}),toast=()=>{},pub=()=>{},aim=()=>{};let R_=null,me,aa=0;',cut('const R=','\n];',true),
  cut('let PI_=0','const NP=','')+'const NP=i=>HOLES[i].putts?HOLES[i].putts.length:1;',cut('function fresh(','\n'),cut('function inside(','function frame(')].join('\n')
  +'\n;this.api={HOLES,fresh,H,step,surf,limitOf,cupOf,setPI:v=>{PI_=v;_hc=null;},setMe:v=>{me=v},NP};';
 const ctx={performance,Math,console};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx.api;}
function solve(A,mi,pi,full){
 const trial=(ang,pw)=>{A.setPI(pi);const m=A.fresh('s',0);A.setMe(m);m.h=mi;const h=A.H();m.x=h.tee[0];m.y=h.tee[1];m.z=A.surf(h,...h.tee);m.str=1;m.prev=[m.x,m.y,m.z];
  m.vx=Math.cos(ang)*pw*820;m.vy=Math.sin(ang)*pw*820;m.moving=true;m.mt=0;for(let i=0;i<4800&&m.moving&&m.mode!=='sunk';i++)A.step();return m.mode==='sunk'&&!m.over&&m.str===1;};
 const robust=(a,p)=>{for(const da of[-.007,0,.007])for(const dp of[-.025,0,.025])if(!trial(a+da,Math.min(1,p+dp)))return false;return true;};
 let hits=0,best=null;
 for(let d=0;d<720&&(full||!best);d++){const a=d*Math.PI/360;for(let p=.3;p<=1.001;p+=.05)if(trial(a,p)){hits++;if(!best&&robust(a,p)){best={deg:+(a*180/Math.PI).toFixed(1),power:+p.toFixed(2)};if(!full)break;}}}
 return{hits,best};}


// ---------- headless smoke test (needs: npm i jsdom, installed outside the project tree) ----------

// Minimal stand-in for WebAudio: every node is a permissive proxy; counts oscillator/noise starts and panners.
function makeFakeAC(){
 const st={starts:0,panners:0};
 const mk=()=>{const s={};return new Proxy(function(){},{get:(t,k)=>{if(typeof k==='symbol')return undefined;if(k==='connect')return x=>x;if(k==='start')return()=>{st.starts++;};if(k==='getChannelData')return()=>new Float32Array(8);if(!(k in s))s[k]=mk();return s[k];},set:(t,k,v)=>{s[k]=v;return true;},apply:()=>mk()});};
 function FakeAC(){this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination=mk();this.listener=mk();FakeAC.last=this;}
 Object.assign(FakeAC.prototype,{resume(){},createGain:mk,createOscillator:mk,createBiquadFilter:mk,createBufferSource:mk,createPanner(){st.panners++;return mk();},createBuffer(){return{getChannelData:()=>new Float32Array(8)};}});
 FakeAC.st=st;return FakeAC;}
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
 w.AudioContext=makeFakeAC();
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
 ok('audio: context is created by the first click',!!P().audio);
 ok('lobby: Join room is enabled with the prefilled room code',!$('go').disabled);
 ok('lobby: solo shows "Solo practice" and hides the invite button',$('roomlabel').textContent==='Solo practice'&&$('lobbyinvite').hidden,$('roomlabel').textContent);
 {const rc=$('rc');rc.value='';rc.dispatchEvent(new g.w.Event('input'));const d0=$('go').disabled;rc.value='abcd';rc.dispatchEvent(new g.w.Event('input'));
  ok('lobby: Join room needs a room code',d0&&!$('go').disabled);}
 $('mode').value='3';$('startgame').click();
 ok('Start opens voting (tournament, 3 maps)',await until(()=>room().phase==='select'&&room().mode==='tournament'&&room().series===3));
 const maps=[0,8,0],want=[11,23,35];
 for(let m=0;m<3;m++){
  g.w.document.querySelector('#mapgrid [data-map="'+maps[m]+'"]').click();
  if(!ok(`map ${m+1}: vote locks the map and play starts`,await until(()=>room().phase==='play'&&room().map===maps[m]&&room().putt===0,8000)))return finish();
  for(let k=0;k<6;k++){
   if(k===1&&m===0){
    const started=await until(()=>P().trans,9000);
    ok('transition: starts at the next putt (no flash overlay)',started&&!$('warp').classList.contains('go'));
    if(started){
     const pts=[],ys=[],t0=Date.now();let prev=null,maxStep=0,sawMid=false;
     while(P().trans&&Date.now()-t0<4000){const c=P().cam.position.clone(),b=P().ball.position;ys.push(b.y);if(prev)maxStep=Math.max(maxStep,c.distanceTo(prev));prev=c;await sleep(40);}
     const dur=Date.now()-t0;
     ok('transition: ball arcs above the floor mid-flight',Math.max(...ys)>ys[ys.length-1]+25,Math.max(...ys)+' vs '+ys[ys.length-1]);
     ok('transition: ends within about 1.5 s',dur<2200,String(dur));
     for(let i=0;i<8;i++){const c=P().cam.position.clone();if(prev)maxStep=Math.max(maxStep,c.distanceTo(prev));prev=c;await sleep(40);}
     ok('transition: camera never jumps (largest step per 40 ms sample is small), including the hand-off to the normal camera',maxStep<60,maxStep.toFixed(1));
     ok('transition: game is playable afterwards',P().me.mode==='play'&&!P().trans);
    }
   }
   if(!ok(`map ${m+1} putt ${k+1}: ready`,await until(()=>{const r=room(),me=P().me;return r.phase==='play'&&r.putt===k&&me.mode==='play'&&me.h===r.map&&P().now()>=r.startAt;},12000)))return finish();
   if(k===0&&m===0){
    const vw=$('vw'),seq=[];ok('camera: starts as Ball cam',vw.textContent==='View: Ball cam',vw.textContent);
    for(let i=0;i<3;i++){vw.click();seq.push(vw.textContent);await sleep(350);}
    ok('camera: button cycles Hole view, World view, Ball cam',seq.join('|')==='View: Hole view|View: World view|View: Ball cam',seq.join('|'));
    g.w.document.body.dispatchEvent(new g.w.KeyboardEvent('keydown',{key:'c',bubbles:true}));ok('camera: C key switches view',vw.textContent==='View: Hole view',vw.textContent);
    await sleep(350);g.w.document.body.dispatchEvent(new g.w.KeyboardEvent('keydown',{key:'C',bubbles:true}));g.w.document.body.dispatchEvent(new g.w.KeyboardEvent('keydown',{key:'c',bubbles:true}));await sleep(350);
    ok('camera: back on Ball cam after 3 presses total',vw.textContent==='View: Ball cam',vw.textContent);
   }
   if(k===0&&m===0){
    const sbT=$('sb').textContent,rows=$('sb').children.length;
    ok('scoreboard: header, one ranked row, Putt and Total columns',/SCOREBOARD/.test(sbT)&&/Total/.test(sbT)&&rows===2&&/^1\. /.test($('sb').children[1].textContent),sbT);
    const lim=(()=>{const mm=/(\d+):(\d\d)$/.exec($('info').textContent);return mm?(+mm[1]*60+ +mm[2]):0;})(),saved=P().me.t0;
    P().me.t0=performance.now()-(lim-5)*1000;await sleep(400);
    ok('timer: HUD pill turns red in the last 10 s',$('info').classList.contains('warn'),lim+' '+$('info').textContent);
    P().me.t0=saved;await sleep(400);
    ok('timer: warning clears when time is restored',!$('info').classList.contains('warn'),$('info').textContent);
   }
   if(k===0&&m===0){
    const me0=P().me,old=me0.mode,key=(t,k2)=>g.w.document.body.dispatchEvent(new g.w.KeyboardEvent(t,{key:k2,bubbles:true}));
    ok('spectator: not free-roaming while playing',!P().free);
    me0.mode='spectator';await sleep(300);
    ok('spectator: free roam turns on and the button says so',P().free&&$('vw').textContent==='View: Free roam',$('vw').textContent);
    const p0=P().cam.position.clone();key('keydown','w');await sleep(400);key('keyup','w');const p1=P().cam.position.clone();
    ok('spectator: W moves the camera',p0.distanceTo(p1)>20,String(p0.distanceTo(p1)));
    key('keydown','e');await sleep(300);key('keyup','e');ok('spectator: E raises the camera',P().cam.position.y>p1.y+10,P().cam.position.y+' vs '+p1.y);
    const p2=P().cam.position.clone();key('keydown','Shift');key('keydown','a');await sleep(300);key('keyup','a');key('keyup','Shift');
    ok('spectator: A strafes (Shift is fast)',P().cam.position.distanceTo(p2)>40,String(P().cam.position.distanceTo(p2)));
    $('vw').click();ok('spectator: View button does not leave free roam',P().free);
    me0.mode=old;await sleep(300);
    ok('spectator: leaving spectator mode restores the normal camera',!P().free&&/^View: (Ball cam|Hole view|World view)$/.test($('vw').textContent),$('vw').textContent);
   }
   P().me.str=(k===0&&m===0)?1:2;P().sink(false);
   if(k===0&&m===0)ok('hole-in-one banner appears',await until(()=>$('banner').textContent.includes('HOLE IN ONE'),4000));
   if(k===0&&m===0){
    const AcC=g.w.AudioContext,log=()=>g.w.__ppAudio||[];
    await sleep(300);
    ok('audio: stroke, sink and hole-in-one fanfare were played',['putt','sink','hio'].every(n=>log().includes(n)),log().join(','));
    ok('audio: listener follows the camera',Math.abs(P().audio.listener.positionX.value-P().cam.position.x)<40,P().audio.listener.positionX.value+' vs '+P().cam.position.x);
    const n0=log().length,pn0=AcC.st.panners;ok('audio: positioned sound uses a panner',P().sfx('bounce',{x:100,y:10,z:50},1)&&AcC.st.panners===pn0+1);
    $('snd').click();const n1=log().length;ok('audio: Sound button mutes',P().muted&&$('snd').textContent==='Sound: Off'&&P().sfx('putt',null,1)===false&&log().length===n1,$('snd').textContent);
    g.w.document.body.dispatchEvent(new g.w.KeyboardEvent('keydown',{key:'m',bubbles:true}));
    ok('audio: M key unmutes and sounds play again',!P().muted&&$('snd').textContent==='Sound: On'&&P().sfx('putt',null,1)===true);
   }
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
else if(cmd==='surfaces'){ // P4: ice/slime/sand friction + timer scaling, using the game's real step()
 const A=load();let bad=0;const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)bad++;};
 const roll=key=>{const base=A.HOLES[0],h=Object.assign({},base,{tiles:[[0,0,4000,400]],w:[],pit:[],fan:[],tornado:[],movers:[],pl:[],rp:[],pd:[],tp:[],q:[],sand:[],ice:[],slime:[],tee:[100,200],hole:[3900,390],putts:null});
  if(key)h[key]=[[0,0,4000,400]];A.HOLES.push(h);const mi=A.HOLES.length-1;A.setPI(0);const m=A.fresh('s',0);A.setMe(m);m.h=mi;m.x=100;m.y=200;m.z=A.surf(A.H(),100,200);m.str=1;m.prev=[100,200,m.z];m.vx=300;m.vy=0;m.moving=true;m.mt=0;
  for(let i=0;i<24000&&m.moving;i++)A.step();A.HOLES.pop();return m.x-100;};
 const d={turf:roll(null),sand:roll('sand'),ice:roll('ice'),slime:roll('slime')};console.log('roll distance from 300 u/s:',JSON.stringify(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,+v.toFixed(1)]))));
 ok('ice rolls farther than turf',d.ice>d.turf*2);ok('turf rolls farther than sand',d.turf>d.sand);ok('slime stops shorter than sand',d.slime<d.sand);ok('every roll stops (finite)',Object.values(d).every(v=>v>0&&v<3800));
 const L=(i,p)=>A.limitOf(i,p);ok('par-2 putt gets 120 s',L(0,0)===120000);ok('limit never below 120 s',A.HOLES.every((h,i)=>[...Array(A.NP(i)).keys()].every(p=>L(i,p)>=120000)));ok('par-4 single-putt map gets 240 s',L(A.HOLES.findIndex(h=>!h.putts&&h.par===4),0)===240000);ok('limit capped at 300 s',A.HOLES.every((h,i)=>[...Array(A.NP(i)).keys()].every(p=>L(i,p)<=300000)));
 console.log(bad?bad+' FAILED':'ALL SURFACE/TIMER CHECKS PASS');process.exit(bad?1:0);}
else if(cmd==='cups'){ // P5: cup radius, clamp, and difficulty monotonicity on a flat test hole using the game's real step()
 const A=load();let bad=0;const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)bad++;};
 const base=A.HOLES[0],mk=cup=>{const h=Object.assign({},base,{tiles:[[0,0,4000,400]],w:[],pit:[],fan:[],tornado:[],movers:[],pl:[],rp:[],pd:[],tp:[],q:[],sand:[],ice:[],slime:[],tee:[100,200],hole:[400,200],putts:null});if(cup!==undefined)h.cup=cup;return h;};
 const shoot=(cup,deg,pw)=>{const h=mk(cup);A.HOLES.push(h);const mi=A.HOLES.length-1;A.setPI(0);const m=A.fresh('s',0);A.setMe(m);m.h=mi;m.x=100;m.y=200;m.z=A.surf(A.H(),100,200);m.str=1;m.prev=[100,200,m.z];const a=deg*Math.PI/180;m.vx=Math.cos(a)*pw*820;m.vy=Math.sin(a)*pw*820;m.moving=true;m.mt=0;
  for(let i=0;i<4800&&m.moving&&m.mode!=='sunk';i++)A.step();A.HOLES.pop();return m.mode==='sunk'&&!m.over;};
 ok('default radius is 17',A.cupOf({})===17&&A.cupOf(mk())===17);ok('radius 12 is kept',A.cupOf({cup:12})===12);ok('radius clamps to 8..17',A.cupOf({cup:3})===8&&A.cupOf({cup:99})===17&&A.cupOf({cup:'x'})===17);
 const radii=[17,14,11,8],hits={};
 for(const r of radii){let n=0;for(let a=-4;a<=4.001;a+=.25)for(let p=.35;p<=1.001;p+=.05)if(shoot(r,a,p))n++;hits[r]=n;}
 console.log('hole-in-one shots out of 462 on a flat 300-unit putt, by cup radius:',JSON.stringify(hits));
 ok('smaller cups are never easier (17>=14>=11>=8)',hits[17]>=hits[14]&&hits[14]>=hits[11]&&hits[11]>=hits[8]);ok('radius 8 is strictly harder than 17',hits[8]<hits[17]);ok('radius 8 is still possible',hits[8]>0);ok('omitting cup equals radius 17',[0,.5,1.5].every(a=>shoot(undefined,a,.5)===shoot(17,a,.5)));
 console.log(bad?bad+' FAILED':'ALL CUP CHECKS PASS');process.exit(bad?1:0);}
else if(cmd==='mechanics'){ // P6: one test chamber per mechanic (fan, teleporter, jump pad, tornado) inside the six-chamber arena
 const A=load();let bad=0;const ok=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)bad++;};
 const names=['fan','teleporter','jump pad','tornado'],D=arenaData(MECH),
  mk=strip=>Object.assign({},A.HOLES[0],{tiles:[[40,40,720,420]],w:D.w,sand:D.sand,ice:D.ice,slime:D.slime,pit:D.pit,pd:D.pd,tp:D.tp,fan:D.fan,tornado:D.tornado,q:[],pl:[],rp:[],movers:[],par:8,
   putts:D.putts.map(p=>({tee:p.tee,hole:p.hole,par:2,cup:p.cup})),...(strip||{})});
 const shot=(map,pi,deg,pw)=>{A.HOLES.push(map);const mi=A.HOLES.length-1;A.setPI(pi);const m=A.fresh('s',0);A.setMe(m);m.h=mi;const h=A.H();m.x=h.tee[0];m.y=h.tee[1];m.z=A.surf(h,...h.tee);m.str=1;m.prev=[m.x,m.y,m.z];
  const a=deg*Math.PI/180;m.vx=Math.cos(a)*pw*820;m.vy=Math.sin(a)*pw*820;m.moving=true;m.mt=0;for(let i=0;i<4800&&m.moving&&m.mode!=='sunk';i++)A.step();A.HOLES.pop();return m.mode==='sunk'&&!m.over&&m.str===1;};
 const full=mk(),keyOf=['fan','tp','pd','tornado'];
 names.forEach((n,pi)=>{A.HOLES.push(full);const mi=A.HOLES.length-1;const r=solve(A,mi,pi,false);A.HOLES.pop();
  ok(n+' chamber: robust hole-in-one found'+(r.best?' ('+r.best.deg+' deg, power '+r.best.power+')':''),!!r.best);
  if(r.best){const bare=mk({[keyOf[pi]]:[]});ok(n+' chamber: the same shot FAILS with the '+n+' removed',!shot(bare,pi,r.best.deg,r.best.power));}});
 console.log(bad?bad+' FAILED':'ALL MECHANIC CHECKS PASS');process.exit(bad?1:0);}
else if(cmd==='smoke')smoke();
else if(cmd==='smoke-multi')smokeMulti();
else console.log('usage: node tools.js check | list | smoke | smoke-multi | surfaces | cups | mechanics | solve <map> [putt] [--full] | arena [map name]');
