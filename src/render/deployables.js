import { TUNING } from '../shared/tuning.js';
import { surfaceHeight } from '../simulation/physics.js';

/** Lazy actors: absent objects add no scene nodes. All GPU resources have one owner. */
export function createDeployableView(THREE, scene, settings = TUNING.deployables) {
  const actors = new Map();
  const D = settings;
  function release(key) {
    const group = actors.get(key);
    if (!group) return;
    scene.remove(group);
    group.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    actors.delete(key);
  }
  function make(o, preview) {
    const group = new THREE.Group();
    const color = preview ? (o.valid ? 0x53e798 : 0xff536b) : o.kind === 'orbital' ? 0xbba0ff : 0xffd24a;
    const material = () => new THREE.MeshBasicMaterial({color,transparent:preview,opacity:preview ? 0.5 : 1,side:THREE.DoubleSide});
    const body = new THREE.Mesh(new THREE.CylinderGeometry(D.bumperRadius,D.bumperRadius, D.height,24),material());
    body.position.y = D.height/2;
    group.add(body);
    const ring = r => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(Math.max(0,r-1.5),r,64),material());
      mesh.rotation.x = -Math.PI/2; mesh.position.y = 0.7; group.add(mesh);
    };
    ring(D.bumperRadius + TUNING.ball.radius);
    if (o.kind === 'orbital') { ring(D.orbitalRange); ring(D.orbitalRange/2); }
    for (let i=0;i<D.maxImpacts-(o.impacts ?? 0);i++) {
      const pip = new THREE.Mesh(new THREE.SphereGeometry(2,8,6),material());
      const a=i*Math.PI*2/D.maxImpacts;
      pip.position.set(Math.cos(a)*D.bumperRadius*0.6,D.height+3,Math.sin(a)*D.bumperRadius*0.6); group.add(pip);
    }
    group.userData.signature = `${o.kind}:${o.impacts ?? 0}:${preview ? o.valid : ''}`;
    scene.add(group);
    return group;
  }
  return {
    update(objects, placement, course, origin) {
      const keep = new Set();
      for (const [key,o,preview] of [...objects.map(o=>[o.id,o,false]),...(placement ? [['preview',placement,true]] : [])]) {
        keep.add(key);
        const signature = `${o.kind}:${o.impacts ?? 0}:${preview ? o.valid : ''}`;
        if (actors.get(key)?.userData.signature !== signature) release(key);
        let group=actors.get(key);
        if (!group) { group=make(o,preview); actors.set(key,group); }
        const floor = o.z ?? surfaceHeight(course,o.x,o.y);
        group.position.set(o.x+origin[0],floor < -900 ? 0 : floor,o.y+origin[1]);
      }
      for (const key of actors.keys()) if (!keep.has(key)) release(key);
    },
    dispose() { for (const key of actors.keys()) release(key); },
  };
}
