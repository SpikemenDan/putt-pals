/** Legacy P9/P11 procedural recipes; no audio files or browser globals. */
export function createRecipes({ tone, puff, random }) {
  return Object.freeze({
  putt:(c,t,o)=>{tone(c,o,'sine',210,70,t,.09,.9);puff(c,o,'highpass',2500,2500,t,.04,.45);},
  bounce:(c,t,o)=>{tone(c,o,'triangle',560+random()*120,300,t,.07,.6);puff(c,o,'bandpass',1500,1500,t,.025,.3);},
  sink:(c,t,o)=>{tone(c,o,'sine',1100,330,t,.18,.7);tone(c,o,'sine',160,60,t+.12,.25,.8);[659,784,988].forEach((f,i)=>tone(c,o,'sine',f,f,t+.28+i*.12,.35,.3));},
  sinkover:(c,t,o)=>{tone(c,o,'triangle',262,131,t,.6,.5);tone(c,o,'triangle',196,98,t+.15,.6,.5);},
  hio:(c,t,o)=>{[523,659,784,1047,1319].forEach((f,i)=>tone(c,o,'triangle',f,f,t+i*.09,.5,.4));puff(c,o,'highpass',6000,6000,t+.3,.5,.12);},
  power:(c,t,o)=>{tone(c,o,'sine',523,1046,t,.25,.4);tone(c,o,'sine',784,1568,t+.1,.25,.35);},
  event:(c,t,o)=>{tone(c,o,'sine',660,880,t,.15,.35);},
  splash:(c,t,o)=>{puff(c,o,'lowpass',3000,300,t,.5,1);tone(c,o,'sine',300,100,t,.2,.3);},
  teleport:(c,t,o)=>{tone(c,o,'sine',300,1500,t,.3,.4);tone(c,o,'sine',306,1520,t,.3,.3);},
  warp:(c,t,o)=>{tone(c,o,'sine',200,900,t,.6,.4);tone(c,o,'sine',203,910,t,.6,.3);puff(c,o,'bandpass',800,2500,t,.6,.2);},
  boing:(c,t,o)=>{tone(c,o,'sine',180,700,t,.22,.6);tone(c,o,'square',180,700,t,.15,.08);},
  // M1d: menu and turn feedback. New cues only; the legacy recipes above are unchanged.
  menu_hover:(c,t,o)=>{tone(c,o,'sine',880,1040,t,.05,.15);},
  menu_click:(c,t,o)=>{tone(c,o,'triangle',520,780,t,.09,.3);puff(c,o,'highpass',3000,3000,t,.02,.15);},
  ready:(c,t,o)=>{tone(c,o,'sine',523,523,t,.16,.3);tone(c,o,'sine',784,784,t+.09,.22,.3);},
  ring:(c,t,o)=>{tone(c,o,'sine',440,660,t,.18,.12);},
  // M1e: one short accent per self-utility power-up, layered over the generic 'power' sweep.
  pu_mag:(c,t,o)=>{tone(c,o,'sine',360,140,t,.28,.3);tone(c,o,'sine',365,145,t+.04,.24,.2);},
  pu_steady:(c,t,o)=>{tone(c,o,'triangle',700,700,t,.05,.25);tone(c,o,'triangle',700,700,t+.09,.05,.25);},
  pu_chip:(c,t,o)=>{tone(c,o,'sine',300,900,t,.12,.4);tone(c,o,'sine',900,500,t+.12,.12,.25);},
  pu_ghost:(c,t,o)=>{puff(c,o,'highpass',4000,1500,t,.35,.25);tone(c,o,'sine',900,500,t,.35,.12);},
  pu_small:(c,t,o)=>{tone(c,o,'sine',1400,1900,t,.12,.3);},
  pu_tall:(c,t,o)=>{tone(c,o,'sine',240,150,t,.22,.5);},
  pu_aim360:(c,t,o)=>{tone(c,o,'triangle',400,1200,t,.3,.25);tone(c,o,'triangle',1200,400,t+.15,.3,.2);},
  pu_aim180:(c,t,o)=>{tone(c,o,'sine',500,900,t,.2,.25);tone(c,o,'sine',900,500,t+.2,.2,.25);},
  pu_sticky:(c,t,o)=>{puff(c,o,'bandpass',500,250,t,.2,.5);tone(c,o,'sine',200,110,t,.18,.3);}
  });
}
