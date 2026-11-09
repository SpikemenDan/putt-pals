/** Optional G1g records. Legacy courses omit mechanics and retain their tuples. */
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const finite = Number.isFinite;
const coordinate = n => finite(n) && Math.abs(n) <= 1000000;
const point = v => Array.isArray(v) && v.length === 2 && Array.from(v).every(coordinate);
const endpoint = v => Array.isArray(v) && v.length === 3 && Array.from(v).every(coordinate) && Math.abs(v[2]) <= Math.PI;
export const MECHANIC_KINDS = Object.freeze(['wedge','bouncer','fan','vortex','portal']);
export function validCourseMechanic(m) {
  if (!object(m) || !MECHANIC_KINDS.includes(m.kind) || typeof m.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(m.id)) return false;
  const fields = {wedge:['vertices'],bouncer:['a','b'],fan:['rect','direction'],vortex:['center','radius','spin'],portal:['a','b']}[m.kind];
  const optional = m.kind === 'fan' || m.kind === 'vortex' ? ['height','acceleration'] : ['height'];
  if (Object.keys(m).some(k => !['id','kind',...fields,...optional].includes(k)) || !fields.every(k=>Object.hasOwn(m,k))) return false;
  if (m.height !== undefined && (!finite(m.height) || m.height <= 0 || m.height > 1000)) return false;
  if (m.acceleration !== undefined && (!finite(m.acceleration) || m.acceleration < 0 || m.acceleration > 10000)) return false;
  if (m.kind === 'wedge') {
    if (!Array.isArray(m.vertices) || m.vertices.length !== 3 || !Array.from(m.vertices).every(point)) return false;
    const [a,b,c]=m.vertices;
    return Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) > 1e-6;
  }
  if (m.kind === 'bouncer') return point(m.a) && point(m.b) && Math.hypot(m.a[0]-m.b[0],m.a[1]-m.b[1]) > 1e-6;
  if (m.kind === 'fan') return Array.isArray(m.rect) && m.rect.length === 4 && Array.from(m.rect).every(coordinate) && m.rect[2]>0 && m.rect[3]>0 && finite(m.direction) && Math.abs(m.direction)<=Math.PI;
  if (m.kind === 'vortex') return point(m.center) && finite(m.radius) && m.radius>0 && m.radius<=10000 && [-1,1].includes(m.spin);
  return endpoint(m.a) && endpoint(m.b) && Math.hypot(m.a[0]-m.b[0],m.a[1]-m.b[1]) > 1e-6;
}
export function validateCourseMechanics(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length>128) return ['mechanics must be an array of at most 128 records'];
  const errors=Array.from(list).flatMap((m,i)=>validCourseMechanic(m)?[]:[`mechanics[${i}] is invalid`]);
  if (new Set(list.map(m=>m?.id)).size!==list.length) errors.push('mechanics ids must be unique');
  return errors;
}

/** Exact distance to a triangle/rail, for tee/cup and portal exit clearances. */
export function distanceToMechanicSolid(p,m) {
  const vertices=m.vertices || [m.a,m.b];
  const edges=m.vertices?vertices.map((a,i)=>[a,vertices[(i+1)%3]]):[[m.a,m.b]];
  if(m.vertices){const signs=edges.map(([a,b])=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));if(signs.every(s=>s>=0)||signs.every(s=>s<=0))return 0;}
  return Math.min(...edges.map(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);}));
}
