import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CAPACITY, D, MINI_BALL_LIMIT, MINI_BALL_RADIUS, REWARD_SHOOTER, THICKNESS, TOWER } from './config';
import { Random } from './game';
import type { Actor, Part, Simulation, V } from './physics';

function brushedTexture() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#b1b1b1';ctx.fillRect(0,0,256,512);
  const rng=new Random(2443);
  for(let i=0;i<1600;i++) {
    ctx.strokeStyle=`rgba(${rng.next()>.5?'255,255,255':'30,30,30'},${.015+rng.next()*.045})`;
    const x=rng.next()*256,y=rng.next()*512;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rng.next()-.5)*1.2,y+20+rng.next()*180);ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(1.5,2);
  return texture;
}
function coinMap() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#e7b83e';ctx.fillRect(0,0,256,256);
  for(const [r,width] of [[114,3],[106,1.5],[77,1]] ) {
    ctx.beginPath();ctx.arc(128,128,r,0,Math.PI*2);ctx.lineWidth=width;ctx.strokeStyle='#a87216';ctx.stroke();
    ctx.beginPath();ctx.arc(128,126,r-1,0,Math.PI*2);ctx.lineWidth=1;ctx.strokeStyle='#ffe6a0';ctx.stroke();
  }
  ctx.strokeStyle='#ae7c1d';ctx.lineWidth=2;
  for(let i=0;i<40;i++) {
    const a=i*Math.PI/20;
    ctx.beginPath();ctx.moveTo(128+85*Math.cos(a),128+85*Math.sin(a));
    ctx.lineTo(128+89*Math.cos(a),128+89*Math.sin(a));ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(128,95);ctx.lineTo(148,128);ctx.lineTo(128,161);ctx.lineTo(108,128);ctx.closePath();ctx.stroke();
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  return map;
}
export class BoardView {
  overlay?: {scene:THREE.Scene;camera:THREE.PerspectiveCamera;element:HTMLElement};
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-10,10,14,-14,.1,150);
  groups: Record<string,THREE.Group>={};
  coins: THREE.InstancedMesh;
  balls: THREE.InstancedMesh;
  cores: THREE.InstancedMesh;
  miniBalls: THREE.InstancedMesh;
  dummy=new THREE.Object3D();
  private q=new THREE.Quaternion();
  private resizeObserver: ResizeObserver;
  private env: THREE.WebGLRenderTarget;
  private lastSize={width:0,height:0};
  private staticParts: THREE.Mesh[]=[];
  private renderLow=false;
  constructor(public host: HTMLElement, public simulation: Simulation, public boardRegion:HTMLElement=host) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.25;
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label','手前のレールから奥へメダルを送り、前へ押し出すメダル盤面');
    const pmrem=new THREE.PMREMGenerator(this.renderer);
    const room=new RoomEnvironment();
    this.env=pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();
    this.scene.environment=this.env.texture;
    const grain=brushedTexture();
    const materials={
      steel:new THREE.MeshStandardMaterial({color:'#a5aaa7',metalness:.88,roughness:.43,roughnessMap:grain}),
      upper:new THREE.MeshStandardMaterial({color:'#b9bcb7',metalness:.9,roughness:.33,roughnessMap:grain}),
      green:new THREE.MeshStandardMaterial({color:'#233f3b',metalness:.08,roughness:.49}),
      dark:new THREE.MeshStandardMaterial({color:'#303735',metalness:.35,roughness:.47}),
      glass:new THREE.MeshPhysicalMaterial({color:'#d8e4df',metalness:0,roughness:.08,transparent:true,opacity:.065,depthWrite:false,side:THREE.DoubleSide,ior:1.45,specularIntensity:.25}),
      brass:new THREE.MeshStandardMaterial({color:'#a68b5d',metalness:.82,roughness:.38}),
    };
    for(const name of ['pusher','rail','lift','cage']) {this.groups[name]=new THREE.Group();this.scene.add(this.groups[name]);}
    const box=(part:Part, visualOnly=false) => {
      const {size,at,group}=part;
      const isGlass=part.material==='glass';
      const small=Math.min(size.x,size.y,size.z);
      const geometry=isGlass?new THREE.BoxGeometry(size.x,size.y,size.z):new RoundedBoxGeometry(size.x,size.y,size.z,2,Math.min(.035,small*.14));
      const mesh=new THREE.Mesh(geometry,materials[part.material]);
      mesh.position.set(at.x,at.y,at.z);
      if(part.rotation)mesh.quaternion.set(part.rotation.x,part.rotation.y,part.rotation.z,part.rotation.w);
      mesh.castShadow=!isGlass;mesh.receiveShadow=!isGlass;
      if(isGlass)mesh.renderOrder=3;
      if(isGlass&&size.y<.1) {mesh.material=materials.glass.clone();(mesh.material as THREE.MeshPhysicalMaterial).opacity=.012;}
      (group?this.groups[group]:this.scene).add(mesh);
      if(!group&&!visualOnly)this.staticParts.push(mesh);
      return mesh;
    };
    for(const part of simulation.parts)box(part);
    // Folded enamel enclosure and a narrow brushed return lip.
    box({size:{x:15.35,y:.65,z:21.1},at:{x:0,y:-.68,z:7.45},material:'green'},true);
    for(const side of [-1,1]) {
      box({size:{x:.55,y:.32,z:21.2},at:{x:side*7.55,y:-.05,z:7.5},material:'green'},true);
      box({size:{x:.12,y:.1,z:20.7},at:{x:side*7.28,y:.16,z:7.45},material:'brass'},true);
    }
    box({size:{x:15.35,y:1.1,z:1.1},at:{x:0,y:.25,z:18.7},material:'green'},true);
    box({size:{x:15.35,y:.6,z:.85},at:{x:0,y:-2.5,z:-3.55},material:'green'},true);
    box({size:{x:14.5,y:.12,z:.17},at:{x:0,y:-.1,z:0},material:'upper'},true);
    // Thin machine bed trim, not a second colliding front fence.
    box({size:{x:14.5,y:.12,z:.14},at:{x:0,y:.09,z:17.94},material:'brass'},true);
    // Purposeful supply openings in the rear mechanism cover.
    for(const x of [-5.5,0,5.5]) {
      box({size:{x:1.4,y:.48,z:.13},at:{x,y:3.6,z:17.62},material:'steel'},true);
      box({size:{x:1.08,y:.24,z:.17},at:{x,y:3.61,z:17.52},material:'dark'},true);
    }
    // Side feeder faces across the upper shelf, separate from the player rail.
    box({size:{x:.8,y:.48,z:.9},at:{x:-6.9,y:REWARD_SHOOTER.y,z:REWARD_SHOOTER.z},material:'green'},true);
    box({size:{x:.08,y:.22,z:.62},at:{x:-6.47,y:REWARD_SHOOTER.y,z:REWARD_SHOOTER.z},material:'brass'},true);
    box({size:{x:.09,y:.1,z:.45},at:{x:-6.42,y:REWARD_SHOOTER.y,z:REWARD_SHOOTER.z},material:'dark'},true);
    const pivot=new THREE.Mesh(new THREE.CylinderGeometry(.57,.66,.38,40),materials.brass);
    pivot.position.set(0,6.65,-1);pivot.castShadow=true;this.scene.add(pivot);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.2,.30,8.2,24),materials.green);
    stem.position.set(0,2.35,-1.35);stem.castShadow=true;this.scene.add(stem);
    // Screws are limited to actual cover attachment locations.
    const screwGeometry=new THREE.CylinderGeometry(.065,.065,.022,12);
    for(const x of [-7.55,7.55])for(const z of [-2.6,5,12,17.5]) {
      const screw=new THREE.Mesh(screwGeometry,materials.steel);screw.position.set(x,.125,z);this.scene.add(screw);
    }
    // Small warm reflection inside the receiving tray.
    const trayLight=new THREE.PointLight('#d8a14d',5,9,2);trayLight.position.set(0,-2,-1.6);this.scene.add(trayLight);
    const lightStrip=new THREE.Mesh(new THREE.BoxGeometry(8,.035,.05),new THREE.MeshBasicMaterial({color:'#8b6940'}));
    lightStrip.position.set(0,-2.9,-2.7);this.scene.add(lightStrip);
    const ambient=new THREE.HemisphereLight('#f5f2e9','#33423a',2.0);this.scene.add(ambient);
    const key=new THREE.DirectionalLight('#fff5e2',3.6);key.position.set(-8,24,-8);
    key.castShadow=true;key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.left=-13;key.shadow.camera.right=13;key.shadow.camera.top=16;key.shadow.camera.bottom=-16;
    key.shadow.camera.near=.5;key.shadow.camera.far=65;key.shadow.bias=-.0002;key.shadow.normalBias=.015;
    key.target.position.set(0,0,8);this.scene.add(key,key.target);
    const fill=new THREE.DirectionalLight('#e6efee',1.1);fill.position.set(12,13,14);this.scene.add(fill);
    const medallionMap=coinMap();
    // A richer gold base and tighter reflected highlights, without emission:
    // shaded medals still read as metal under the existing neutral room map.
    const edge=new THREE.MeshStandardMaterial({color:'#d9a62e',metalness:.94,roughness:.23});
    const face=new THREE.MeshStandardMaterial({map:medallionMap,metalness:.94,roughness:.26});
    const coinGeometry=new THREE.CylinderGeometry(.5,.5,THICKNESS,32,1);
    this.coins=new THREE.InstancedMesh(coinGeometry,[edge,face,face],CAPACITY);
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.castShadow=true;this.coins.receiveShadow=true;this.coins.frustumCulled=false;this.scene.add(this.coins);
    const ballMaterial=new THREE.MeshPhysicalMaterial({color:'#b88230',metalness:.05,roughness:.18,transmission:.25,thickness:.9,ior:1.44,clearcoat:.7});
    this.balls=new THREE.InstancedMesh(new THREE.SphereGeometry(1.1,32,20),ballMaterial,3);
    this.balls.castShadow=true;this.balls.receiveShadow=true;this.balls.frustumCulled=false;this.scene.add(this.balls);
    this.cores=new THREE.InstancedMesh(new THREE.SphereGeometry(.42,16,12),new THREE.MeshStandardMaterial({color:'#74521e',metalness:.6,roughness:.32}),3);
    this.cores.frustumCulled=false;this.scene.add(this.cores);
    this.miniBalls=new THREE.InstancedMesh(new THREE.SphereGeometry(MINI_BALL_RADIUS,20,14),
      new THREE.MeshPhysicalMaterial({color:'#28c6dc',metalness:.15,roughness:.17,clearcoat:1}),MINI_BALL_LIMIT);
    this.miniBalls.castShadow=true;this.miniBalls.receiveShadow=true;
    this.miniBalls.frustumCulled=false;this.scene.add(this.miniBalls);
    this.camera.position.set(0,32,-15);this.camera.lookAt(0,1.7,8);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resizeObserver.observe(boardRegion);this.resize();
  }
  resize() {
    const {width,height}=this.host.getBoundingClientRect();if(!width||!height)return;
    this.lastSize={width,height};
    this.renderer.setSize(width,height);
    const board=this.boardRegion.getBoundingClientRect();
    const aspect=Math.max(1,board.width)/Math.max(1,board.height);
    const visibleWidth=Math.max(17.4,26.5*aspect), visibleHeight=visibleWidth/aspect;
    this.camera.left=-visibleWidth/2;this.camera.right=visibleWidth/2;
    this.camera.top=visibleHeight/2;this.camera.bottom=-visibleHeight/2;this.camera.updateProjectionMatrix();
  }
  quality(low:boolean) {
    if(this.renderLow===low)return;this.renderLow=low;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,low?1:1.8));
    this.renderer.shadowMap.enabled=!low;
    this.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.material){for(const material of Array.isArray(m.material)?m.material:[m.material]) material.needsUpdate=true;}});
    this.resize();
  }
  private actorMatrix(a:Actor,alpha:number) {
    const b=this.simulation.body(a),p=b.translation(),q=b.rotation();
    this.dummy.position.set(a.previous.x+(p.x/D-a.previous.x)*alpha,a.previous.y+(p.y/D-a.previous.y)*alpha,a.previous.z+(p.z/D-a.previous.z)*alpha);
    this.dummy.quaternion.set(a.previousQ.x,a.previousQ.y,a.previousQ.z,a.previousQ.w);
    this.q.set(q.x,q.y,q.z,q.w);this.dummy.quaternion.slerp(this.q,alpha);
    this.dummy.scale.set(1,1,1);this.dummy.updateMatrix();
  }
  render(alpha=1) {
    for(const name of ['pusher','rail','lift','cage'] as const) {
      const body=this.simulation[name],p=body.translation(),q=body.rotation();
      this.groups[name].position.set(p.x/D,p.y/D,p.z/D);this.groups[name].quaternion.set(q.x,q.y,q.z,q.w);
    }
    let coins=0,balls=0,minis=0;
    for(const a of this.simulation.actors) {
      this.actorMatrix(a,alpha);
      if(a.kind==='coin')this.coins.setMatrixAt(coins++,this.dummy.matrix);
      else if(a.kind==='miniBall')this.miniBalls.setMatrixAt(minis++,this.dummy.matrix);
      else {
        this.balls.setMatrixAt(balls,this.dummy.matrix);
        this.dummy.translateX(.24);this.dummy.updateMatrix();this.cores.setMatrixAt(balls++,this.dummy.matrix);
      }
    }
    this.coins.count=coins;this.balls.count=this.cores.count=balls;
    this.miniBalls.count=minis;this.miniBalls.instanceMatrix.needsUpdate=true;
    this.coins.instanceMatrix.needsUpdate=true;this.balls.instanceMatrix.needsUpdate=true;this.cores.instanceMatrix.needsUpdate=true;
    const canvas=this.host.getBoundingClientRect(),board=this.boardRegion.getBoundingClientRect();
    this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,canvas.width,canvas.height);this.renderer.clear(true,true,true);
    this.renderer.setScissorTest(true);
    this.renderer.setScissor(board.left-canvas.left,canvas.bottom-board.bottom,board.width,board.height);
    this.renderer.setViewport(board.left-canvas.left,canvas.bottom-board.bottom,board.width,board.height);
    this.renderer.render(this.scene,this.camera);
    const overlay=this.overlay;
    if(overlay){
      const r=overlay.element.getBoundingClientRect(),h=this.host.getBoundingClientRect();
      if(r.width>0&&r.height>0){
        overlay.camera.aspect=r.width/r.height;overlay.camera.updateProjectionMatrix();
        this.renderer.setScissorTest(true);this.renderer.setScissor(r.left-h.left,h.bottom-r.bottom,r.width,r.height);
        this.renderer.setViewport(r.left-h.left,h.bottom-r.bottom,r.width,r.height);
        this.renderer.clear(true,true,true);this.renderer.render(overlay.scene,overlay.camera);
        this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,h.width,h.height);
      }
    }
    this.renderer.setScissorTest(false);this.renderer.setViewport(0,0,canvas.width,canvas.height);
  }
  dispose() {
    this.resizeObserver.disconnect();this.env.dispose();
    const materials=new Set<THREE.Material>(),geometries=new Set<THREE.BufferGeometry>(),textures=new Set<THREE.Texture>();
    this.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material])materials.add(mat);});
    for(const mat of materials) {
      for(const value of Object.values(mat))if(value instanceof THREE.Texture)textures.add(value);
      mat.dispose();
    }
    for(const geo of geometries)geo.dispose();for(const texture of textures)texture.dispose();
    this.renderer.dispose();this.renderer.domElement.remove();
  }
}
