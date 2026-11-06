/**
 * GLSL for the loading-screen planet (VIS-M1). Like the game's effect shaders these write display (sRGB) values straight to
 * gl_FragColor. Coasts are cut per pixel from a smooth land field plus noise, so they stay razor sharp at any screen size.
 * The shadow bands and halftone dots follow the game's toon material (materials.js): one art style from the globe to the ball.
 */

const NOISE = `
float hash3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int k=0;k<4;k++){s+=a*vnoise(p);p=p*2.03+7.1;a*=.5;}return s;}
float halftone(float cell,float amount){vec2 c=mod(gl_FragCoord.xy,cell)-.5*cell;float r=amount*cell*.5;return 1.-smoothstep(r-.6,r+.6,length(c));}
`;

export const SPHERE_VERTEX = `
varying vec2 vUv;varying vec3 vObj;varying vec3 vN;varying vec3 vView;varying vec3 vEast;
void main(){vUv=uv;vObj=normalize(position);vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*position);vEast=mat3(modelMatrix)*vec3(position.z,0.,-position.x);vView=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`;

export const PLANET_FRAGMENT = `
uniform sampler2D field,landMap,cloudMap;uniform vec3 sun;uniform float time,cloudShift,dotCell,cloudGate,inkPx,atmosphere;uniform vec2 texel;
varying vec2 vUv;varying vec3 vObj;varying vec3 vN;varying vec3 vView;varying vec3 vEast;
${NOISE}
void main(){
  vec2 uv=vec2(vUv.x,1.-vUv.y);
  vec4 f=texture2D(field,uv);
  float fine=fbm(vObj*42.),broad=fbm(vObj*11.);
  float land=(f.r-.5)*.5+(broad-.47)*.028+(fine-.47)*.008;
  float aa=max(fwidth(land),1e-4),isLand=smoothstep(-aa,aa,land);
  float lat=(vUv.y-.5)*3.14159,warm=pow(max(cos(lat),0.),1.15);
  // Sea: shallow to deep, with ice near the poles.
  float depth=clamp(-land,0.,.5);
  vec3 sea=mix(vec3(.27,.77,.84),vec3(.11,.44,.82),smoothstep(0.,.07,depth));
  sea=mix(sea,vec3(.06,.24,.6),smoothstep(.06,.24,depth));
  sea=mix(sea,vec3(.08,.55,.8),(broad-.4)*.5*step(.1,depth)); // currents: broad teal and blue swirls
  float reef=(1.-smoothstep(.02,.05,depth))*smoothstep(.5,.62,fine)*smoothstep(.5,.75,warm);
  sea=mix(sea,vec3(1.,.62,.66),reef*.55); // coral on warm shallows
  sea=mix(sea,vec3(.94,.97,1.),smoothstep(.3,.17,warm+(broad-.5)*.16));
  // Land: climate colours with fine terrain mottling, beaches on warm coasts, suburbs round the cities.
  vec3 ground=texture2D(landMap,uv).rgb*(.93+.14*broad);
  ground=mix(ground,ground*vec3(1.1,1.04,.72),smoothstep(.5,.66,broad)*.45); // sunlit meadows
  ground=mix(ground,vec3(.98,.55,.75),smoothstep(.66,.7,fine)*smoothstep(.5,.6,broad)*smoothstep(.45,.7,warm)*.3); // flowering plains
  ground=mix(ground,vec3(.94,.87,.67),(1.-smoothstep(.006,.02,land))*smoothstep(.25,.42,warm)*.9);
  vec4 lm=texture2D(landMap,uv);
  vec3 cell=floor(vObj*vec3(62.,58.,66.)+vec3(fine*1.4));float crop=hash3(cell);
  vec3 field3=crop<.3?vec3(.93,.8,.32):crop<.55?vec3(.62,.82,.3):crop<.8?vec3(.4,.72,.3):vec3(.72,.56,.34);
  ground=mix(ground,field3,lm.a*.78); // patchwork farms round towns and villages
  ground=mix(ground,vec3(.8,.74,.66),f.b*.6);
  float lava=f.a*smoothstep(.55,.6,fine*.7+broad*.35);
  ground=mix(ground,vec3(1.,.42,.08),lava);
  vec3 albedo=mix(sea,ground,isLand);
  // Relief: the elevation map tilts the normal, so mountains catch the sun.
  vec3 N=normalize(vN);
  float hE=texture2D(field,uv+vec2(texel.x,0.)).g,hW=texture2D(field,uv-vec2(texel.x,0.)).g,hS=texture2D(field,uv+vec2(0.,texel.y)).g,hN=texture2D(field,uv-vec2(0.,texel.y)).g;
  vec3 east=normalize(vEast+vec3(1e-5)),north=normalize(cross(N,east));
  vec3 lit=normalize(N-isLand*1.3*((hE-hW)*east+(hN-hS)*north));
  float ndl=dot(lit,sun);
  // Light: a real day-to-night falloff, stepped a little like the game's cel bands.
  float soft=smoothstep(-.16,.72,ndl),band=smoothstep(.1,.13,ndl)*.5+smoothstep(.44,.47,ndl)*.5;
  float day=mix(soft,band,.34);
  vec3 c=albedo*mix(vec3(.13,.17,.38),vec3(1.06,1.03,.98),day);
  if(day<.5)c*=1.-.14*halftone(dotCell,day<.3?.62:.4);
  // Cloud shadows on the ground.
  float cs=texture2D(cloudMap,uv+vec2(cloudShift+.006,.006)).r;
  c*=1.-.34*smoothstep(cloudGate,cloudGate+.08,cs);
  // Sun on the water.
  vec3 V=normalize(vView),H=normalize(sun+V);
  float ripple=vnoise(vObj*90.+time*.35);
  float glint=pow(max(dot(N,H),0.),70.+ripple*90.);
  c+=vec3(1.,.96,.84)*glint*.85*(1.-isLand)*step(0.,ndl);
  // Ink coastline, a fixed number of pixels wide.
  c=mix(c,vec3(.05,.05,.13),(1.-smoothstep(inkPx*.55,inkPx*1.1,abs(land)/aa))*.82);
  c=mix(c,vec3(1.,.5,.12),lava*.8); // lava glows through shadow
  // City lights on the night side.
  float lights=f.b*step(.5,vnoise(vObj*230.))*(1.-smoothstep(-.08,.14,ndl));
  c+=vec3(1.,.78,.4)*lights*1.2;
  // Air: the limb fades into a lit blue haze.
  float rim=pow(1.-max(dot(N,V),0.),2.2);
  c=mix(c,vec3(.62,.84,1.),rim*(.25+atmosphere*.75)*(.2+.8*smoothstep(-.2,.5,dot(N,sun))));
  gl_FragColor=vec4(c,1.);
}`;

/** Thin high cloud painted on a shell just above the ground; the piled-up 3D clouds sit among it. */
export const CLOUD_SHELL_FRAGMENT = `
uniform sampler2D cloudMap;uniform vec3 sun;uniform float cloudGate,dotCell,atmosphere;
varying vec2 vUv;varying vec3 vObj;varying vec3 vN;varying vec3 vView;
${NOISE}
void main(){
  vec2 uv=vec2(vUv.x,1.-vUv.y);
  float d=texture2D(cloudMap,uv).r+(fbm(vObj*11.)-.47)*.16;
  float a=smoothstep(cloudGate-.02,cloudGate+.14,d)*.6; // a soft, thin veil
  if(a<.01)discard;
  float thick=smoothstep(cloudGate,cloudGate+.24,d);
  vec3 N=normalize(vN);float ndl=dot(N,sun);
  float day=smoothstep(-.16,.6,ndl);
  vec3 c=mix(vec3(.72,.8,.98),vec3(1.),thick);
  c*=mix(vec3(.16,.2,.42),vec3(1.),day);
  float rim=pow(1.-max(dot(N,normalize(vView)),0.),3.2);
  c=mix(c,vec3(.7,.87,1.),rim*atmosphere*.8);
  gl_FragColor=vec4(c,a);
}`;

/** The air above the limb: pale at the ground, deepening to blue, gone by the top of the shell, brighter toward the sun. */
export const ATMOSPHERE_VERTEX = 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}';
export const ATMOSPHERE_FRAGMENT = `
uniform vec3 sun;uniform float radius,shell,atmosphere;varying vec3 vW;
void main(){
  vec3 rd=normalize(vW-cameraPosition);
  vec3 closest=cameraPosition+rd*dot(-cameraPosition,rd);
  float h=clamp((length(closest)-radius)/(shell-radius),0.,1.);
  float g=(1.-pow(h,1.5))*(.5+atmosphere*.75);
  g*=.6+.4*smoothstep(-.3,.7,dot(normalize(closest),sun));
  g=clamp(g,0.,1.);
  vec3 c=mix(vec3(.08,.24,.72),vec3(.26,.58,.98),exp(-h*2.4));
  c=mix(c,vec3(.8,.94,1.),exp(-h*9.));
  gl_FragColor=vec4(c*g,g);
}`;

export const CLOUD_VERTEX = `
attribute vec3 soft;attribute float ao,reach;varying vec3 vN;varying vec3 vS;varying vec3 vV;varying float vAo;varying float vLimb;varying float vEdge;
void main(){mat3 m=mat3(modelMatrix);vN=normalize(m*normal);vS=normalize(m*soft);vAo=ao;vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);vEdge=length(vS-vV*dot(vS,vV))*reach;vec3 at=modelMatrix[3].xyz;vLimb=dot(normalize(at),normalize(cameraPosition-at));gl_Position=projectionMatrix*viewMatrix*w;}`;

/**
 * Soft volumetric cloud: light comes mostly from the whole cloud's soft normal, so a pile of lobes reads as one rounded body. It shades
 * smoothly from warm white to cool periwinkle, and its edges fade out, so there is no hard outline. `opacity` sets how thick it is;
 * `haze` melts it into the air.
 */
export const CLOUD_FRAGMENT = `
uniform vec3 sun,tint;uniform float haze,opacity;varying vec3 vN;varying vec3 vS;varying vec3 vV;varying float vAo;varying float vLimb;varying float vEdge;
void main(){
  vec3 n=normalize(mix(normalize(vN),normalize(vS),.82));
  float l=clamp((dot(n,sun)*.5+.5)*mix(.66,1.08,vAo),0.,1.);
  vec3 c=mix(vec3(.68,.75,.96),vec3(1.,.995,.97),smoothstep(.34,.74,l));
  float a=opacity*(1.-smoothstep(.55,1.05,vEdge)); // fades with distance from the cloud's centre on screen, so there are no holes between lobes
  a*=smoothstep(.5,.68,vLimb); // a whole cloud melts away as it nears the horizon, instead of being cut off by it
  if(a<.004)discard;
  gl_FragColor=vec4(mix(c*tint,vec3(.74,.87,1.),haze),a);
}`;

/** A soft, tapering ribbon: contrails and ship wakes. `line` runs 0 at the source to 1 at the far end, `across` -1 to 1 side to side. */
export const TRAIL_VERTEX = 'attribute vec2 trail;varying vec2 vT;void main(){vT=trail;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
export const CONTRAIL_FRAGMENT = 'varying vec2 vT;void main(){float a=(1.-vT.x)*(1.-vT.x);gl_FragColor=vec4(1.,1.,1.,a*.85);}';
export const WAKE_FRAGMENT = `
uniform float time;varying vec2 vT;
void main(){
  float side=abs(vT.y),arm=smoothstep(.62,.8,side)*(1.-smoothstep(.9,1.,side));
  float churn=(1.-smoothstep(.1,.34,side))*(1.-smoothstep(.15,.55,vT.x));
  float wave=.5+.5*sin(vT.x*46.-time*3.+side*9.);
  float a=max(arm*(.4+.6*wave),churn)*(1.-vT.x);
  if(a<.08)discard;
  gl_FragColor=vec4(.95,.99,1.,a);
}`;

/** Stars: round points with a soft glow, each twinkling at its own pace. */
export const STAR_VERTEX = 'attribute float size;attribute vec3 tone;attribute float phase;uniform float time,pixel;varying vec3 vTone;varying float vBright;void main(){vTone=tone;vBright=.72+.28*sin(time*(.6+phase*1.8)+phase*40.);gl_PointSize=size*pixel;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
export const STAR_FRAGMENT = 'varying vec3 vTone;varying float vBright;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=(1.-smoothstep(.15,1.,r))*vBright;gl_FragColor=vec4(vTone*a,a);}';

/** A small, faint spiral galaxy on a flat quad, far away. */
export const GALAXY_VERTEX = 'varying vec2 vUv;void main(){vUv=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
export const GALAXY_FRAGMENT = `uniform vec3 tone;uniform float strength;varying vec2 vUv;
void main(){float r=length(vUv);if(r>1.)discard;float a=atan(vUv.y,vUv.x);
  float arms=.5+.5*sin(a*2.-log(r+.04)*5.2);
  float g=exp(-r*r*16.)*1.5+pow(arms,3.)*exp(-r*3.4)*.75;
  g*=(1.-r)*strength;
  vec3 c=mix(tone,vec3(1.,.95,.84),exp(-r*r*20.));
  gl_FragColor=vec4(c*g,g);}`;

/** A shooting star: a bright head and a fading tail along a quad. `life` runs 0 to 1. */
export const STREAK_VERTEX = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
export const STREAK_FRAGMENT = 'uniform float life;varying vec2 vUv;void main(){float head=smoothstep(0.,1.,vUv.x);float side=1.-abs(vUv.y*2.-1.)/max(head,.02);float g=head*head*smoothstep(0.,.5,side)*sin(life*3.14159);gl_FragColor=vec4(vec3(.95,.97,1.)*g,g);}';
