import * as THREE from 'three';
import { floorMesh,pockets,PhysicalDraw } from './draw';
export class DrawView {
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(39,1,.01,10);ball:THREE.Mesh;gates:THREE.Mesh[]=[];
 constructor(public draw:PhysicalDraw, public mode:'route'|'prize'='prize'){
  this.scene.background=new THREE.Color('#142d28');this.camera.position.set(0,1.65,1.34);this.camera.lookAt(0,0,0);
  this.scene.add(new THREE.HemisphereLight('#ffffff','#233c30',3));const light=new THREE.DirectionalLight('#ffffff',4);light.position.set(-1,3,1);this.scene.add(light);
  const m=floorMesh(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.vertices,3));g.setIndex(new THREE.BufferAttribute(m.indices,1));g.computeVertexNormals();
  this.scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#527768',metalness:.55,roughness:.35,side:THREE.DoubleSide})));
  const outer=new THREE.Mesh(new THREE.TorusGeometry(.66,.025,8,96),new THREE.MeshStandardMaterial({color:'#c2b28b',metalness:.8,roughness:.25}));outer.rotation.x=Math.PI/2;outer.position.y=.09;this.scene.add(outer);
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.36,64,1,true),new THREE.MeshPhysicalMaterial({color:'#c6e2d8',transparent:true,opacity:.18,roughness:.18,side:THREE.DoubleSide,depthWrite:false}));wall.position.y=.1;this.scene.add(wall);
  pockets.forEach((p,i)=>{
   const result=draw.plan.labels[i],color=mode==='route'?['#a1d5b4','#9ac8e0','#d9b576'][i%3]:result==='JACKPOT'?'#e5b548':result==='FIELD_30'?'#91bdce':'#d5dfd5';
   const rim=new THREE.Mesh(new THREE.TorusGeometry(.143,.008,6,32),new THREE.MeshStandardMaterial({color,metalness:.65,roughness:.35}));rim.rotation.x=Math.PI/2;rim.position.set(p.x,.018,p.z);this.scene.add(rim);
   const gate=new THREE.Mesh(new THREE.CylinderGeometry(.143,.143,.012,32),new THREE.MeshStandardMaterial({color:'#607b6b',metalness:.65,roughness:.38}));gate.position.set(p.x,.005,p.z);this.scene.add(gate);this.gates.push(gate);
   const well=new THREE.Mesh(new THREE.CylinderGeometry(.144,.144,.16,24,1,true),new THREE.MeshStandardMaterial({color:'#0b1917',side:THREE.DoubleSide}));well.position.set(p.x,-.065,p.z);this.scene.add(well);
   const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.fillText(mode==='route'?String(i%3+1):result==='JACKPOT'?'JP':result==='FIELD_30'?'30':'10',64,43);
   const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false,toneMapped:false}));label.scale.set(.19,.095,1);label.position.set(p.x*.76,.15,p.z*.76);this.scene.add(label);
  });
  this.ball=new THREE.Mesh(new THREE.SphereGeometry(.048,24,16),new THREE.MeshStandardMaterial({color:'#f5eee0',metalness:.35,roughness:.17}));this.scene.add(this.ball);
 }
 update(){this.gates.forEach(g=>g.visible=this.draw.gates.length>0);const p=this.draw.ball.translation();this.ball.position.set(p.x,Math.max(-.2,p.y),p.z);}
 dispose(){this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}if(o instanceof THREE.Sprite){o.material.map?.dispose();o.material.dispose();}});}
}
