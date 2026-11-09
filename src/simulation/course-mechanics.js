/** G1g geometry and portal math. Coordinates are simulation x/y, with z vertical. */
import { TUNING } from '../shared/tuning.js';
const EPS = 1e-10;
const dot = (a, b) => a.x * b.x + a.y * b.y;
const unit = (x, y) => { const n = Math.hypot(x, y); return n > EPS ? { x: x / n, y: y / n } : null; };

/**
 * Earliest contact of a moving circle with a finite segment (including its ends).
 * `delta` is this step's displacement; contact.t is a fraction in [0,1].
 * This is continuous collision detection, so thin diagonal faces cannot tunnel.
 * Initial overlap returns t=0 with a finite separating normal. Inputs are supplied
 * by validated course records; degenerate segments behave as point obstacles.
 */
export function sweepCircleSegment(start, delta, radius, a, b) {
  const edge = { x: b.x - a.x, y: b.y - a.y };
  const length2 = dot(edge, edge);
  const projection = length2 > EPS ? Math.max(0, Math.min(1, dot({ x: start.x - a.x, y: start.y - a.y }, edge) / length2)) : 0;
  const nearest = { x: a.x + edge.x * projection, y: a.y + edge.y * projection };
  const separation = { x: start.x - nearest.x, y: start.y - nearest.y };
  if (dot(separation, separation) <= radius * radius) {
    const normal = unit(separation.x, separation.y) || unit(-delta.x, -delta.y) || { x: 1, y: 0 };
    return { t: 0, normal, point: nearest };
  }
  const speed2 = dot(delta, delta);
  if (speed2 <= EPS) return null;
  const candidates = [];
  const add = (t, normal, point) => {
    if (t >= 0 && t <= 1 && normal && dot(delta, normal) < 0) candidates.push({ t, normal, point });
  };
  // The straight part of the segment's radius-expanded capsule.
  if (length2 > EPS) {
    const length = Math.sqrt(length2), normal = { x: -edge.y / length, y: edge.x / length };
    const distance = dot({ x: start.x - a.x, y: start.y - a.y }, normal);
    const approach = dot(delta, normal);
    if (Math.abs(approach) > EPS) for (const side of [-1, 1]) {
      const t = (side * radius - distance) / approach;
      const centre = { x: start.x + delta.x * t, y: start.y + delta.y * t };
      const along = dot({ x: centre.x - a.x, y: centre.y - a.y }, edge) / length2;
      if (along >= 0 && along <= 1) add(t, { x: normal.x * side, y: normal.y * side }, { x: a.x + along * edge.x, y: a.y + along * edge.y });
    }
  }
  // Circular end caps.
  for (const end of [a, b]) {
    const relative = { x: start.x - end.x, y: start.y - end.y };
    const linear = dot(relative, delta), constant = dot(relative, relative) - radius * radius;
    const discriminant = linear * linear - speed2 * constant;
    if (discriminant < 0) continue;
    const t = (-linear - Math.sqrt(discriminant)) / speed2;
    add(t, unit(start.x + delta.x * t - end.x, start.y + delta.y * t - end.y), { ...end });
  }
  return candidates.sort((left, right) => left.t - right.t)[0] || null;
}

/** Reflect only incoming velocity. Restitution is dimensionless; kick is units/s. */
export function reflectMechanicVelocity(velocity, normal, restitution, kick = 0) {
  const incoming = dot(velocity, normal);
  if (incoming >= 0) return { ...velocity };
  const impulse = -(1 + restitution) * incoming + kick;
  return { x: velocity.x + normal.x * impulse, y: velocity.y + normal.y * impulse };
}

/**
 * Portal endpoint angles point outward. Arriving along -entry.normal emerges
 * along exit.normal. Preserve horizontal speed and vertical velocity; put the
 * centre beyond the exit trigger to prevent immediate re-entry. The caller owns
 * the shared portal cooldown and validates supported exit-floor clearance.
 */
export function portalExit(velocity, entry, exit, clearance) {
  const angle = exit.angle - entry.angle + Math.PI;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  return {
    x: exit.x + Math.cos(exit.angle) * clearance,
    y: exit.y + Math.sin(exit.angle) * clearance,
    vx: velocity.x * cosine - velocity.y * sine,
    vy: velocity.x * sine + velocity.y * cosine,
  };
}

const xy = p => ({x:p[0],y:p[1]});
export function mechanicAnchor(m) {
  return m.kind === 'wedge' ? m.vertices[0] : m.kind === 'fan' ? m.rect : m.kind === 'vortex' ? m.center : m.a;
}

/** Continuous force, in world units/s², relative to the mechanic's floor. */
export function courseMechanicForce(records, player, floorAt, tuning = TUNING.courseMechanics) {
  const force={x:0,y:0,z:0};
  for (const m of records || []) {
    if (!['fan','vortex'].includes(m.kind)) continue;
    const anchor=mechanicAnchor(m), floor=floorAt(anchor[0],anchor[1]);
    if (player.z < floor-1 || player.z > floor+(m.height ?? tuning[m.kind+'Height'])) continue;
    if (m.kind==='fan') {
      const [x,y,w,h]=m.rect;
      if(player.x<x || player.x>x+w || player.y<y || player.y>y+h) continue;
      const a=m.acceleration ?? tuning.fanAcceleration;
      force.x+=Math.cos(m.direction)*a; force.y+=Math.sin(m.direction)*a;
    } else {
      const dx=m.center[0]-player.x,dy=m.center[1]-player.y,d=Math.hypot(dx,dy);
      if(d>=m.radius) continue;
      const fall=1-d/m.radius,a=(m.acceleration ?? tuning.vortexAcceleration)*fall;
      if(d>EPS) {force.x+=(dx*tuning.vortexPull-dy*m.spin)/d*a;force.y+=(dy*tuning.vortexPull+dx*m.spin)/d*a;}
      if(d<m.radius*.4) force.z+=tuning.vortexLift*(1-d/(m.radius*.4));
    }
  }
  return force;
}

/** Swept solid motion, including overlap recovery. At most four impacts per tick. */
export function moveCourseSolids(records, player, dt, radius, floorAt, tuning = TUNING.courseMechanics) {
  let position={x:player.x,y:player.y}, remaining=dt;
  const hits=[];
  const solids=(records || []).filter(m=>['wedge','bouncer'].includes(m.kind) && player.z < floorAt(...mechanicAnchor(m).slice(0,2))+(m.height ?? tuning.bodyHeight));
  for(let iteration=0;iteration<4 && remaining>EPS;iteration++) {
    const delta={x:player.vx*remaining,y:player.vy*remaining}; let contact=null;
    for(const m of solids) {
      const vertices=m.kind==='wedge'?m.vertices:[m.a,m.b];
      const edges=m.kind==='wedge'?vertices.map((v,i)=>[v,vertices[(i+1)%3]]):[[m.a,m.b]];
      // A restored/spawned ball inside a triangle separates through its nearest face.
      let inside=m.kind==='wedge', recovery=null;
      if(inside) {
        const [a,b,c]=vertices,sign=Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
        for(const [a,b] of edges) {
          const normal=unit((b[1]-a[1])*sign,-(b[0]-a[0])*sign),signed=dot({x:position.x-a[0],y:position.y-a[1]},normal);
          if(signed>0) inside=false;
          if(!recovery || signed>recovery.signed) recovery={signed,normal,point:{x:position.x-normal.x*signed,y:position.y-normal.y*signed}};
        }
        if(inside) {const hit={t:0,...recovery,mechanic:m};if(!contact || contact.t>0)contact=hit;continue;}
      }
      for(const [a,b] of edges) {
        const hit=sweepCircleSegment(position,delta,radius,xy(a),xy(b));
        if(!hit || hit.t===0 && dot(delta,hit.normal)>=0) continue;
        if(!contact || hit.t<contact.t)contact={...hit,mechanic:m};
      }
    }
    if(!contact) {position.x+=delta.x;position.y+=delta.y;break;}
    position={x:contact.point.x+contact.normal.x*(radius+1e-5),y:contact.point.y+contact.normal.y*(radius+1e-5)};
    const bounce=contact.mechanic.kind==='bouncer';
    const velocity=reflectMechanicVelocity({x:player.vx,y:player.vy},contact.normal,player.armedPowerups?.sticky?0:bounce?tuning.bouncerRestitution:tuning.wedgeRestitution,player.armedPowerups?.sticky?0:bounce?tuning.bouncerKick:0);
    player.vx=velocity.x;player.vy=velocity.y;remaining*=1-contact.t;
    hits.push(contact.mechanic.id);
  }
  return {...position,hits};
}

/** One oriented pair transfer per tick, sharing one cooldown across all pairs. */
export function applyCoursePortal(records, player, dt, radius, floorAt, tuning = TUNING.courseMechanics) {
  if(player.coursePortalCooldown>0) {player.coursePortalCooldown=Math.max(0,player.coursePortalCooldown-dt);return null;}
  for(const m of records || []) {
    if(m.kind!=='portal')continue;
    for(const [a,b] of [[m.a,m.b],[m.b,m.a]]) {
      if(player.vx*Math.cos(a[2])+player.vy*Math.sin(a[2])>=0)continue;
      const floor=floorAt(a[0],a[1]),height=player.z-floor;
      if(height < -1 || height > (m.height ?? tuning.portalHeight) || Math.hypot(player.x-a[0],player.y-a[1])>tuning.portalRadius)continue;
      const to=portalExit({x:player.vx,y:player.vy},{x:a[0],y:a[1],angle:a[2]},{x:b[0],y:b[1],angle:b[2]},tuning.portalRadius+radius+tuning.portalClearance);
      const exitFloor=floorAt(to.x,to.y);
      if(!Number.isFinite(exitFloor) || exitFloor < -900) continue;
      Object.assign(player,to,{z:exitFloor+Math.max(0,height),coursePortalCooldown:tuning.portalCooldown});
      return m.id;
    }
  }
  return null;
}
