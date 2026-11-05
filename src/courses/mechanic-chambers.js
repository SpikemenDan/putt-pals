/** G1g development/solver chambers; excluded from normal voting and shipped maps. */
export const MECHANIC_PROOF_SHOTS=Object.freeze({wedge:{deg:358,power:.485},bouncer:{deg:0,power:.3},fan:{deg:0,power:.5},vortex:{deg:13.5,power:.65},portal:{deg:0,power:.4}});
const empty=()=>Object.fromEntries(['w','sand','ice','slime','pit','q','pl','rp','pd','tp','fan','tornado','movers'].map(k=>[k,[]]));
export function createMechanicChambers() {
  const base=(id,name,tee,hole,mechanics)=>({id,name,desc:'G1g local mechanic chamber',...empty(),tiles:[[0,0,800,500]],tee,hole,par:3,penalty:2,limitSeconds:180,cup:15,mechanics});
  return {
    wedge:base('g1g-wedge','Diagonal wedge',[80,250],[369,340],[{id:'corner',kind:'wedge',vertices:[[300,160],[480,340],[480,160]]}]),
    bouncer:base('g1g-bouncer','Corner bouncer',[500,250],[250,250],[{id:'bank',kind:'bouncer',a:[600,180],b:[600,320]}]),
    fan:base('g1g-fan','Stronger fan',[80,250],[650,250],[{id:'gust',kind:'fan',rect:[180,190,50,120],direction:0}]),
    vortex:base('g1g-vortex','Vortex chamber',[80,250],[650,350],[{id:'cyclone',kind:'vortex',center:[300,250],radius:150,spin:1}]),
    portal:base('g1g-portal','Oriented portal pair',[80,250],[600,385],[{id:'pair',kind:'portal',a:[200,250,Math.PI],b:[600,150,Math.PI/2]}]),
  };
}
