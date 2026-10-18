import * as THREE from 'three';
import { floorMesh,bowlHeight,pockets,PhysicalDraw } from './draw';
import { upgradeInfo,routeInfo,type UpgradeEffect,type RouteEffect } from './jp';

export function pocketStyle(label:string,mode:'route'|'refit'|'prize',index:number){
 if(mode==='route'){const route=routeInfo[label as RouteEffect]??Object.values(routeInfo)[index%3];return {text:route.short,color:route.color};}
 const upgrade=mode==='refit'?upgradeInfo[label as UpgradeEffect]:undefined;
 return {text:upgrade?.symbol??(label==='JACKPOT'?'JP':label==='FIELD_30'?'30':'10'),color:upgrade?.color??(label==='JACKPOT'?'#f5c660':label==='FIELD_30'?'#80d1e4':'#d1e4e8')};
}
export class DrawView {
 scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(39,1,.01,20);ball:THREE.Mesh;gates:THREE.Mesh[]=[];
 private rims:THREE.Mesh<THREE.TorusGeometry,THREE.MeshStandardMaterial>[]=[];
 private indicators:THREE.Mesh[]=[];private labels:THREE.Sprite[]=[];
 private shadow:THREE.Mesh;private orbit:THREE.Group;private winner:THREE.Mesh;private clock=0;private disposed=false;
 constructor(public draw:PhysicalDraw<string>, public mode:'route'|'refit'|'prize'='prize'){
  this.scene.background=new THREE.Color('#0b1e2a');this.scene.environmentIntensity=.55;
  this.scene.add(new THREE.HemisphereLight('#d5edff','#192a35',1.5));
  const key=new THREE.DirectionalLight('#fff0cf',3);key.position.set(-2,4,2);this.scene.add(key);
  const fill=new THREE.DirectionalLight('#8ac7eb',1.7);fill.position.set(2,2,-2);this.scene.add(fill);
  const metal=(color:string,roughness=.3)=>new THREE.MeshStandardMaterial({color,metalness:.72,roughness});
  const brass=metal('#b69652'),navy=metal('#16394b',.38),steel=metal('#75939d');
  const ring=<M extends THREE.Material>(radius:number,tube:number,y:number,material:M)=>{
   const mesh=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,12,128),material);mesh.rotation.x=Math.PI/2;mesh.position.y=y;this.scene.add(mesh);return mesh;
  };
  const expanded=draw.motionVersion>=2,outer=expanded?1.13:.89,wallRadius=expanded?.93:.66,edgeY=expanded?.21:-.08;
  const drum=new THREE.Mesh(new THREE.CylinderGeometry(outer,outer-.05,.16,128),navy);drum.position.y=-.17;this.scene.add(drum);
  ring(outer-.02,.022,edgeY,brass);ring(outer-.04,.008,edgeY+.035,steel);
  // Actual bowl and its ten openings use the same geometry as the collider.
  const m=floorMesh(!expanded),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(m.vertices,3));g.setIndex(new THREE.BufferAttribute(m.indices,1));g.computeVertexNormals();
  this.scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#173c4b',metalness:.38,roughness:.4,side:THREE.DoubleSide})));
  ring(wallRadius+.008,.021,expanded?.19:.04,brass);ring(wallRadius+.02,.008,expanded?.32:.11,steel);
  const wall=new THREE.Mesh(new THREE.CylinderGeometry(wallRadius,wallRadius,.18,128,1,true),new THREE.MeshPhysicalMaterial({color:'#d5eaf5',transparent:true,opacity:.12,roughness:.12,side:THREE.DoubleSide,depthWrite:false}));
  wall.position.y=expanded?.23:.055;this.scene.add(wall);
  ring(.28,.002,.063,brass);ring(.25,.002,.069,brass);
  // Engraved compass at the centre, kept flush with the physical slope.
  const compass=new THREE.Group();this.scene.add(compass);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,geo=new THREE.BufferGeometry();
   const points=[0,.112,0,Math.cos(a-.12)*.05,.102,Math.sin(a-.12)*.05,Math.cos(a)*.2,.077,Math.sin(a)*.2,Math.cos(a+.12)*.05,.102,Math.sin(a+.12)*.05];
   geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();compass.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:i%2?'#6e929d':'#c1a365',metalness:.6,roughness:.4,side:THREE.DoubleSide})));
  }
  this.orbit=new THREE.Group();this.scene.add(this.orbit);
  for(let i=0;i<80;i++){const a=i*Math.PI/40,major=i%8===0;
   const marker=new THREE.Mesh(new THREE.BoxGeometry(major?.014:.006,.004,major?.035:.014),major?brass:steel);
   marker.position.set(Math.cos(a)*(outer-.05),edgeY+.045,Math.sin(a)*(outer-.05));marker.rotation.y=-a+Math.PI/2;this.scene.add(marker);
  }
  for(let i=0;i<3;i++){const light=new THREE.Mesh(new THREE.SphereGeometry(.012,8,6),new THREE.MeshBasicMaterial({color:'#91d5e9'}));const a=i*Math.PI*2/3;light.position.set(Math.cos(a)*(outer-.036),edgeY+.055,Math.sin(a)*(outer-.036));this.orbit.add(light);}
  pockets.forEach((p,i)=>{
   const style=pocketStyle(draw.plan.labels[i],mode,i);
   const rim=ring(.145,.014,.017,new THREE.MeshStandardMaterial({color:style.color,metalness:.65,roughness:.28,emissive:style.color,emissiveIntensity:.05}));
   rim.position.x=p.x;rim.position.z=p.z;this.rims.push(rim);
   const gate=new THREE.Mesh(new THREE.CylinderGeometry(.143,.143,.012,48),metal('#476776',.42));gate.position.set(p.x,.005,p.z);this.scene.add(gate);this.gates.push(gate);
   const well=new THREE.Mesh(new THREE.CylinderGeometry(.145,.12,.17,48,1,true),new THREE.MeshStandardMaterial({color:'#07131c',roughness:.7,side:THREE.DoubleSide}));well.position.set(p.x,-.065,p.z);this.scene.add(well);
   const lamp=new THREE.Mesh(new THREE.SphereGeometry(.012,10,8),new THREE.MeshBasicMaterial({color:style.color}));lamp.position.set(p.x*1.25,.04,p.z*1.25);this.scene.add(lamp);this.indicators.push(lamp);
   // Upright high-resolution plaques outside each hole, never floating over the ball.
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=112;const ctx=canvas.getContext('2d')!;
   const paint=()=>{ctx.clearRect(0,0,256,112);ctx.fillStyle='#102c3a';ctx.beginPath();ctx.roundRect(4,4,248,104,14);ctx.fill();ctx.strokeStyle=style.color;ctx.lineWidth=3;ctx.stroke();
   ctx.fillStyle=style.color;ctx.textAlign='center';ctx.font='600 50px "Noto Sans JP",sans-serif';ctx.fillText(style.text,128,60);
   ctx.fillStyle='#9fb9c5';ctx.font='21px sans-serif';ctx.fillText(mode==='prize'?(draw.plan.labels[i]==='JACKPOT'?'300 MEDALS':'MEDALS'):mode==='route'?'ROUTE':'REFIT',128,90);};paint();
   const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
   void document.fonts.load('600 50px "Noto Sans JP"',style.text).then(()=>{if(!this.disposed){paint();tex.needsUpdate=true;}},()=>{});
   const label=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:true,toneMapped:false}));
   label.scale.set(.255,.112,1);label.position.set(p.x*(expanded?2.04:1.48),expanded?.25:.07,p.z*(expanded?2.04:1.48));this.scene.add(label);this.labels.push(label);
  });
  this.ball=new THREE.Mesh(new THREE.SphereGeometry(.048,32,24),new THREE.MeshPhysicalMaterial({color:'#fff5d8',metalness:.24,roughness:.15,clearcoat:1,clearcoatRoughness:.08}));this.scene.add(this.ball);
  const stripe=new THREE.Mesh(new THREE.TorusGeometry(.0478,.004,6,40),metal('#a74336',.4));this.ball.add(stripe);
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(32,32,2,32,32,32);
  gradient.addColorStop(0,'#0009');gradient.addColorStop(1,'#0000');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(.15,.15),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false}));this.shadow.rotation.x=-Math.PI/2;this.scene.add(this.shadow);
  this.winner=ring(.155,.009,.035,new THREE.MeshBasicMaterial({color:'#fff3b0'}));this.winner.visible=false;
  this.fit(1);
 }
 fit(aspect:number){
  // Fit the entire cabinet at any monitor aspect ratio, including portrait.
  this.camera.aspect=aspect;const framing=this.draw.motionVersion>=2?3.5:2.65,distance=Math.max(framing,framing/Math.max(.1,aspect));
  this.camera.position.set(0,distance*.92,distance*.39);this.camera.lookAt(0,this.draw.motionVersion>=2?.06:0,0);this.camera.updateProjectionMatrix();
 }
 update(dt=1/60){
  this.clock+=dt;const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.gates.forEach(g=>{g.visible=this.draw.gates.length>0;});
  const p=this.draw.ball.translation();this.ball.position.set(p.x,Math.max(-.2,p.y),p.z);this.ball.quaternion.copy(this.draw.ball.rotation());
  this.shadow.position.set(p.x,this.draw.motionVersion>=2?bowlHeight(p.x,p.z)+.003:.113-.11*Math.min(1,Math.hypot(p.x,p.z)/.64),p.z);this.shadow.visible=p.y>=0;
  this.orbit.rotation.y=reduced?0:-this.clock*.28;
  const hit=this.draw.pocket;
  this.rims.forEach((rim,i)=>{rim.material.emissiveIntensity=hit===i?(reduced?.5:.5+.25*Math.sin(this.clock*5)):.05;this.labels[i].material.opacity=hit===null||hit===i?1:.5;});
  this.winner.visible=hit!==null;if(hit!==null){const hole=pockets[hit];this.winner.position.set(hole.x,.035,hole.z);const scale=reduced?1:1+Math.sin(this.clock*4)*.06;this.winner.scale.setScalar(scale);}
 }
 dispose(){
  this.disposed=true;
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  this.scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}if(o instanceof THREE.Sprite)materials.add(o.material);});
  for(const m of materials){for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);m.dispose();}
  geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());
 }
}
