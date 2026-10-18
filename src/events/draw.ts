import RAPIER from '@dimforge/rapier3d-compat';
import type { Result } from '../config';
// Labels are shuffled independently of launch physics. Every physical pocket has
// the same marginal reward distribution, even when pocket frequencies differ.
export type DrawPlan<L extends string=Result> = { labels: L[]; seed: number };
export type DrawSnapshot = { world: Uint8Array; ball: number; elapsed: number; retry: number; pocket: number | null; gates: number[]; accumulator:number; gateOpenAt?:number; motionVersion?:number };
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
export function bowlHeight(x:number,z:number){const r=Math.hypot(x,z);return r<.64?.11*(1-r/.64):.65*(r-.64);}
export function floorMesh(legacy=false) {
  const vertices:number[]=[],indices:number[]=[];const step=.02,n=legacy?64:94,edge=legacy?.64:.94;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++) {
    const x=-edge+i*step,z=-edge+j*step;
    for(const t of [[[x,z],[x,z+step],[x+step,z]],[[x+step,z],[x,z+step],[x+step,z+step]]]) {
      if(t.some(([a,b])=>Math.hypot(a,b)>(legacy?.65:.94)))continue;
      // A conservative opening avoids invisible triangles bridging pocket rims.
      if(pockets.some(p=>t.some(([a,b])=>Math.hypot(a-p.x,b-p.z)<.145)))continue;
      const start=vertices.length/3;t.forEach(([a,b])=>vertices.push(a,legacy?.11*(1-Math.min(1,Math.hypot(a,b)/.64)):bowlHeight(a,b),b));indices.push(start,start+1,start+2);
    }
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
export class PhysicalDraw<L extends string=Result> {
  world:RAPIER.World;ball:RAPIER.RigidBody;elapsed=0;retry=0;pocket:number|null=null;gates:number[]=[];accumulator=0;gateOpenAt=6.4;motionVersion=2;
  constructor(public plan:DrawPlan<L>,saved?:DrawSnapshot) {
    if(saved){this.world=RAPIER.World.restoreSnapshot(saved.world);this.ball=this.world.getRigidBody(saved.ball);this.elapsed=saved.elapsed;this.retry=saved.retry;this.pocket=saved.pocket;this.gates=saved.gates??[];this.accumulator=saved.accumulator??0;this.gateOpenAt=saved.gateOpenAt??3.2;this.motionVersion=saved.motionVersion??1;return;}
    this.world=new RAPIER.World({x:0,y:-9.81,z:0});this.world.timestep=1/240;
    this.world.numSolverIterations=8;
    const mesh=floorMesh();this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices,mesh.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.005).setRestitution(.04));
    // A continuous inner wall, rather than separated boxes that brake the ball
    // at every exposed edge. It never moves or changes with reward labels.
    const wallVertices:number[]=[],wallIndices:number[]=[];
    for(let i=0;i<=192;i++){const a=i*Math.PI/96;wallVertices.push(Math.cos(a)*.93,-.08,Math.sin(a)*.93,Math.cos(a)*.93,.4,Math.sin(a)*.93);if(i<192){const j=i*2;wallIndices.push(j,j+2,j+1,j+1,j+2,j+3);}}
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(wallVertices),new Uint32Array(wallIndices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.001).setRestitution(.01));
    // Real pocket sleeves catch a fast ball after it crosses the opening,
    // instead of allowing it to travel sideways underneath the plate.
    for(const p of pockets){const v:number[]=[],ix:number[]=[];
      for(let i=0;i<=48;i++){const a=i*Math.PI/24;v.push(p.x+Math.cos(a)*.17,-.3,p.z+Math.sin(a)*.17,p.x+Math.cos(a)*.17,.02,p.z+Math.sin(a)*.17);if(i<48){const j=i*2;ix.push(j,j+2,j+1,j+1,j+2,j+3);}}
      this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(v),new Uint32Array(ix),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.04).setRestitution(.12));
    }
    this.gates=pockets.map(p=>this.world.createCollider(RAPIER.ColliderDesc.cylinder(.012,.16).setTranslation(p.x,-.006,p.z).setFriction(.01).setRestitution(.12)).handle);
    const phase=(plan.seed/4294967296)*Math.PI*2;
    const variation=((Math.imul(plan.seed,1664525)+1013904223)>>>0)/4294967296;
    this.gateOpenAt=6.2+variation*.8;
    // At 240 Hz the maximum travel is below a ball radius. Hard CCD at a
    // touching triangle seam was repeatedly clamping motion to a fraction of dt.
    this.ball=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(.83*Math.cos(phase),.18,.83*Math.sin(phase)).setCanSleep(false).setLinearDamping(.025));
    this.world.createCollider(RAPIER.ColliderDesc.ball(.048).setFriction(.005).setRestitution(.04).setDensity(2),this.ball);
    const speed=4.8+variation*.6;
    this.ball.setLinvel({x:-Math.sin(phase)*speed,y:0,z:Math.cos(phase)*speed},true);
    this.ball.setAngvel({x:Math.cos(phase)*speed/.048,y:0,z:Math.sin(phase)*speed/.048},true);
  }
  step(dt:number) {
    if(this.pocket!==null||this.elapsed>=24)return;
    this.accumulator+=dt;
    const stepSize=this.motionVersion>=2?1/240:1/120;
    while(this.accumulator>=stepSize){
      this.accumulator-=stepSize;
      // Passive drag only: no steering toward a reward or forced winning pocket.
      if(this.motionVersion>=2)this.ball.setLinearDamping(this.elapsed<3?.025:this.elapsed<this.gateOpenAt?.16:.38);
      if(this.elapsed>=this.gateOpenAt&&this.gates.length){for(const handle of this.gates)this.world.removeCollider(this.world.getCollider(handle),true);this.gates=[];}
      this.world.step();this.elapsed+=stepSize;const p=this.ball.translation();
      if(p.y<-.09){
        let nearest=-1,d=.18;pockets.forEach((h,k)=>{const v=Math.hypot(p.x-h.x,p.z-h.z);if(v<d){nearest=k;d=v;}});
        if(nearest>=0){this.pocket=nearest;break;}
        // A ball outside a valid pocket is a failed attempt, never an award.
        if(p.y<-.5){this.elapsed=24;break;}
      }
    }
  }
  get result(){return this.pocket===null?undefined:this.plan.labels[this.pocket];}
  export():DrawSnapshot{return {world:this.world.takeSnapshot(),ball:this.ball.handle,elapsed:this.elapsed,retry:this.retry,pocket:this.pocket,gates:[...this.gates],accumulator:this.accumulator,gateOpenAt:this.gateOpenAt,motionVersion:this.motionVersion};}
  dispose(){this.world.free();}
}
