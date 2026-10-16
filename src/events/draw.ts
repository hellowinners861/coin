import RAPIER from '@dimforge/rapier3d-compat';
import type { Result } from '../config';
// Labels are shuffled independently of launch physics. Every physical pocket has
// the same marginal reward distribution, even when pocket frequencies differ.
export type DrawPlan<L extends string=Result> = { labels: L[]; seed: number };
export type DrawSnapshot = { world: Uint8Array; ball: number; elapsed: number; retry: number; pocket: number | null; gates: number[]; accumulator:number };
export function shuffledPlan<L extends string>(labels:L[],next:()=>number):DrawPlan<L> {
  labels=[...labels];
  for(let i=9;i>0;i--){const j=Math.floor(next()*(i+1));[labels[i],labels[j]]=[labels[j],labels[i]];}
  return {labels,seed:Math.floor(next()*4294967296)};
}
export function makePlan(next:()=>number,jpSlots=1):DrawPlan {
  if(!Number.isInteger(jpSlots)||jpSlots<1||jpSlots>5)throw new Error('JP slots must be between one and five');
  return shuffledPlan<Result>([...Array(8-jpSlots).fill('CREDIT_10'),'FIELD_30','FIELD_30',...Array(jpSlots).fill('JACKPOT')],next);
}
export const pockets=Array.from({length:10},(_,i)=>({x:Math.cos(i*Math.PI/5)*.52,z:Math.sin(i*Math.PI/5)*.52}));
export function floorMesh() {
  const vertices:number[]=[],indices:number[]=[];const step=.02,n=64;
  const height=(x:number,z:number)=>.11*(1-Math.min(1,Math.hypot(x,z)/.64));
  for(let i=0;i<n;i++)for(let j=0;j<n;j++) {
    const x=-.64+i*step,z=-.64+j*step;
    for(const t of [[[x,z],[x,z+step],[x+step,z]],[[x+step,z],[x,z+step],[x+step,z+step]]]) {
      if(t.some(([a,b])=>Math.hypot(a,b)>.65))continue;
      // A conservative opening avoids invisible triangles bridging pocket rims.
      if(pockets.some(p=>t.some(([a,b])=>Math.hypot(a-p.x,b-p.z)<.145)))continue;
      const start=vertices.length/3;t.forEach(([a,b])=>vertices.push(a,height(a,b),b));indices.push(start,start+1,start+2);
    }
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export class PhysicalDraw<L extends string=Result> {
  world:RAPIER.World;ball:RAPIER.RigidBody;elapsed=0;retry=0;pocket:number|null=null;gates:number[]=[];accumulator=0;
  constructor(public plan:DrawPlan<L>,saved?:DrawSnapshot) {
    if(saved){this.world=RAPIER.World.restoreSnapshot(saved.world);this.ball=this.world.getRigidBody(saved.ball);this.elapsed=saved.elapsed;this.retry=saved.retry;this.pocket=saved.pocket;this.gates=saved.gates??[];this.accumulator=saved.accumulator??0;return;}
    this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=1/120;
    const mesh=floorMesh();this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices).setFriction(.035).setRestitution(.12));
    for(let i=0;i<64;i++){
      const a=i*Math.PI/32;
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(.034,.18,.024).setTranslation(Math.cos(a)*.66,.1,Math.sin(a)*.66).setRotation({x:0,y:-Math.sin(a/2),z:0,w:Math.cos(a/2)}).setFriction(.025));
    }
    this.gates=pockets.map(p=>this.world.createCollider(RAPIER.ColliderDesc.cylinder(.012,.16).setTranslation(p.x,-.006,p.z).setFriction(.01).setRestitution(.12)).handle);
    const phase=(plan.seed/4294967296)*Math.PI*2;
    this.ball=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(.39*Math.cos(phase),.23,.39*Math.sin(phase)).setCcdEnabled(true).setCanSleep(false).setLinearDamping(.01));
    this.world.createCollider(RAPIER.ColliderDesc.ball(.048).setFriction(.025).setRestitution(.22).setDensity(2),this.ball);
    this.ball.setLinvel({x:-Math.sin(phase)*1.4,y:0,z:Math.cos(phase)*1.4},true);
  }
  step(dt:number) {
    if(this.pocket!==null||this.elapsed>=24)return;
    this.accumulator+=dt;
    while(this.accumulator>=1/120){
      this.accumulator-=1/120;
      if(this.elapsed>=3.2&&this.gates.length){for(const handle of this.gates)this.world.removeCollider(this.world.getCollider(handle),true);this.gates=[];}
      this.world.step();this.elapsed+=1/120;const p=this.ball.translation();
      if(p.y<-.09){
        let nearest=-1,d=.18;pockets.forEach((h,k)=>{const v=Math.hypot(p.x-h.x,p.z-h.z);if(v<d){nearest=k;d=v;}});
        if(nearest>=0){this.pocket=nearest;break;}
        // A ball outside a valid pocket is a failed attempt, never an award.
        if(p.y<-.5){this.elapsed=24;break;}
      }
    }
  }
  get result(){return this.pocket===null?undefined:this.plan.labels[this.pocket];}
  export():DrawSnapshot{return {world:this.world.takeSnapshot(),ball:this.ball.handle,elapsed:this.elapsed,retry:this.retry,pocket:this.pocket,gates:[...this.gates],accumulator:this.accumulator};}
  dispose(){this.world.free();}
}
