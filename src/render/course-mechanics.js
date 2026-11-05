/** Original procedural G1g props. The containing course owns/disposes resources. */
import { TUNING } from '../shared/tuning.js';
import { surfaceHeight } from '../simulation/physics.js';
import { mechanicAnchor } from '../simulation/course-mechanics.js';

export function buildCourseMechanics({THREE,course,group,transform,solids,tuning=TUNING.courseMechanics}) {
  const cfg=tuning;
  const material=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,roughness:.7,transparent:opacity<1,opacity,side:THREE.DoubleSide});
  const mesh=(geometry,mat,point)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(...point);m.castShadow=true;group.add(m);return m;};
  const ring=(x,y,z,r,color)=>{const m=mesh(new THREE.TorusGeometry(r,1.8,8,48),material(color),transform.local(x,y,z));m.rotation.x=Math.PI/2;return m;};
  const arrow=(x,y,z,angle,length,color)=>{
    const direction=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
    const helper=new THREE.ArrowHelper(direction,new THREE.Vector3(...transform.local(x,y,z)),length,color,9,6);group.add(helper);
  };
  for(const m of course.mechanics || []) {
    const anchor=mechanicAnchor(m),floor=surfaceHeight(course,...anchor.slice(0,2));
    if(m.kind==='wedge') {
      const shape=new THREE.Shape();m.vertices.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
      const geometry=new THREE.ExtrudeGeometry(shape,{depth:m.height ?? cfg.bodyHeight,bevelEnabled:false});
      // Shape x/y maps to simulation x/y; extrusion maps to simulation z.
      geometry.rotateX(Math.PI/2);geometry.translate(0,(m.height ?? cfg.bodyHeight),0);
      mesh(geometry,material(0xffca52),transform.local(0,0,floor));
    } else if(m.kind==='bouncer') {
      const dx=m.b[0]-m.a[0],dy=m.b[1]-m.a[1],height=m.height ?? cfg.bodyHeight;
      const rail=mesh(new THREE.PlaneGeometry(Math.hypot(dx,dy),height),material(0xf45e97),transform.local((m.a[0]+m.b[0])/2,(m.a[1]+m.b[1])/2,floor+height/2));rail.rotation.y=-Math.atan2(dy,dx);
    } else if(m.kind==='fan') {
      const [x,y,w,h]=m.rect;const area=mesh(new THREE.PlaneGeometry(w,h),material(0x65d9ed,.25),transform.local(x+w/2,y+h/2,floor+1));area.rotation.x=-Math.PI/2;
      arrow(x+w/2,y+h/2,floor+12,m.direction,Math.min(w,h)*.45,0x1c82aa);
    } else if(m.kind==='vortex') {
      ring(...m.center,floor+2,m.radius,0xab65df);
      for(let k=0;k<3;k++)ring(...m.center,floor+8+k*12,m.radius*(.12+k*.13),0x7544ae);
      arrow(m.center[0]+m.radius*.55,m.center[1],floor+14,m.spin*Math.PI/2,25,0xffdb72);
    } else {
      for(const [i,p] of [m.a,m.b].entries()) {
        const z=surfaceHeight(course,p[0],p[1]),color=i?0xffa34a:0x4a9cff;
        ring(p[0],p[1],z+2,cfg.portalRadius,color);
        const frame=mesh(new THREE.TorusGeometry(cfg.portalRadius,2.5,8,48),material(color),transform.local(p[0],p[1],z+cfg.portalRadius));frame.rotation.y=Math.PI/2-p[2];
        arrow(p[0],p[1],z+3,p[2],cfg.portalRadius+20,color);
      }
    }
    if(['wedge','bouncer'].includes(m.kind)) {
      const vertices=m.vertices || [m.a,m.b],xs=vertices.map(p=>p[0]),ys=vertices.map(p=>p[1]);
      solids.push({min:transform.ground(Math.min(...xs),Math.min(...ys),floor),max:transform.ground(Math.max(...xs),Math.max(...ys),floor+(m.height ?? cfg.bodyHeight))});
    }
  }
}
