import RAPIER from '@dimforge/rapier3d-compat';
import { CAPACITY, D, DT, INITIAL_COINS, LIMIT, METRES_PER_UNIT, PUSHER_PERIOD, THICKNESS, TOWER } from './config';
import type { Game } from './game';

export type V = { x: number; y: number; z: number };
export type Q = { x: number; y: number; z: number; w: number };
export type Part = { size: V; at: V; rotation?: Q; material: 'steel' | 'upper' | 'green' | 'dark' | 'glass' | 'brass'; group?: 'pusher' | 'rail' | 'lift' | 'cage'; };
export type Actor = {
  id: number; handle: number; kind: 'coin' | 'ball'; source: string; tower?: number;
  departedFront?: boolean;
  previous: V; previousQ: Q;
};
type TowerPhase = 'idle' | 'lowering' | 'rising' | 'uncovering' | 'standing';
export type PhysicsSave = {
  world: Uint8Array; actors: Actor[]; time: number; angle: number; targetAngle: number;
  nextId: number; pusher: number; rail: number; lift: number; cage: number;
  towerPhase: TowerPhase; towerTime: number; towerId: number; towerBorn: number;
  payoutClock: number; ballClock: number; collisions: number;
};
export const v = (x: number, y: number, z: number): V => ({ x, y, z });
const enginePoint = (p: V) => v(p.x * D, p.y * D, p.z * D);
const xRotation = (a: number): Q => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
export const yaw = (a: number): Q => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const defaultRotation: Q = { x: 0, y: 0, z: 0, w: 1 };

// One source of geometry for both visible surfaces and collision solids.
export function machineParts(): Part[] {
  const parts: Part[] = [];
  const box = (size: V, at: V, material: Part['material'], group?: Part['group'], rotation?: Q) =>
    parts.push({ size, at, material, group, rotation });
  const { x, z, half: h } = TOWER;
  box(v(x-h+7, .4, 18), v((-7+x-h)/2, -.2, 9), 'steel');
  box(v(7-x-h, .4, 18), v((x+h+7)/2, -.2, 9), 'steel');
  box(v(h*2, .4, z-h), v(x, -.2, (z-h)/2), 'steel');
  box(v(h*2, .4, 18-z-h), v(x, -.2, (z+h+18)/2), 'steel');
  box(v(h*2-.015, .24, h*2-.015), v(0, 0, 0), 'steel', 'lift');
  // Enclosed pit: a lift never creates a side-loss route.
  for (const s of [-1, 1]) {
    box(v(.12, 5.5, h*2+.2), v(x+s*(h+.07), -2.75, z), 'dark');
    box(v(h*2+.2, 5.5, .12), v(x, -2.75, z+s*(h+.07)), 'dark');
    box(v(.16, .8, 21), v(s*7.08, .4, 7.5), 'steel');
    box(v(.075, 7.9, 21), v(s*7.11, 4.75, 7.5), 'glass');
  }
  box(v(14.3, 8.8, .18), v(0, 4.2, 18.09), 'dark');
  box(v(14.3, .07, 21), v(0, 8.65, 7.5), 'glass');
  box(v(14.3, 4, .18), v(0, -2, -3.1), 'dark');
  box(v(14.3, .2, 3.2), v(0, -3.8, -1.6), 'dark');
  // The shelf moves into the rear enclosure. Its underside clears the floor
  // by less than a coin thickness; there is no under-pusher escape route.
  box(v(13.98, 1.18, 7.6), v(0, .61, 3.8), 'upper', 'pusher');
  box(v(14, .1, .12), v(0, 1.15, .03), 'steel', 'pusher');
  // Rear stripper stops shelf coins returning into the mechanism.
  box(v(14, 2.6, .18), v(0, 2.49, 17.76), 'dark');
  // A physical, narrow track. Upright coins roll, then follow a downturned tip.
  const slope = Math.atan(2.8 / 18);
  const addTrack = (p: V, a: number, length: number) => {
    const q = xRotation(a);
    box(v(.35, .065, length+.012), p, 'steel', 'rail', q);
    for (const s of [-1, 1]) {
      box(v(.09, 1.1, length+.012), v(s*.22, p.y+.50*Math.cos(a), p.z+.50*Math.sin(a)), 'steel', 'rail', q);
    }
  };
  // A continuous straight running surface avoids artificial contact seams.
  addTrack(v(0, 7-8.5*Math.tan(slope), 8.5), slope, 17/Math.cos(slope));
  // The running floor ends before the bend. The outer curved hood redirects
  // the rolling medal downward; no faceted floor lip can trap its thin rim.
  const y0 = 7-17*Math.tan(slope);
  const count = 8;
  for (let i=0; i<count; i++) {
    const a = Math.PI/2*(i+.5)/count;
    box(v(.6,.07,Math.PI/2/count+.015),v(0,y0+.5+Math.cos(a),17.3+Math.sin(a)),'steel','rail',xRotation(a));
  }
  box(v(.6,1.7,.07),v(0,y0-.35,18.3),'steel','rail');
  for(const s of [-1,1])box(v(.09,2.5,1.5),v(s*.22,y0+.1,17.65),'steel','rail');
  for (const s of [-1,1]) {
    box(v(.10, 3.4, 2.8), v(s*1.38, 1.83, 0), 'glass', 'cage');
    box(v(2.8, 3.4, .10), v(0, 1.83, s*1.38), 'glass', 'cage');
  }
  return parts;
}

export class Simulation {
  world: RAPIER.World;
  actors: Actor[] = [];
  parts = machineParts();
  time = 0; angle = 0; targetAngle = 0; nextId = 1;
  pusher: RAPIER.RigidBody; rail: RAPIER.RigidBody; lift: RAPIER.RigidBody; cage: RAPIER.RigidBody;
  towerPhase: TowerPhase = 'idle'; towerTime = 0; towerId = 0; towerBorn = 0;
  payoutClock = 0; ballClock = 0; collisions = 0; anomaly = '';
  onImpact: (force: number) => void = () => {};
  private events = new RAPIER.EventQueue(true);
  private reserved = 0;
  constructor(public game: Game, saved?: PhysicsSave) {
    if (saved) {
      this.world = RAPIER.World.restoreSnapshot(saved.world);
      this.actors = structuredClone(saved.actors);
      this.time = saved.time; this.angle = saved.angle; this.targetAngle = saved.targetAngle;
      this.nextId = saved.nextId;
      this.pusher = this.world.getRigidBody(saved.pusher);
      this.rail = this.world.getRigidBody(saved.rail);
      this.lift = this.world.getRigidBody(saved.lift);
      this.cage = this.world.getRigidBody(saved.cage);
      this.towerPhase=saved.towerPhase; this.towerTime=saved.towerTime;
      this.towerId=saved.towerId; this.towerBorn=saved.towerBorn;
      this.payoutClock=saved.payoutClock; this.ballClock=saved.ballClock;
      this.collisions=saved.collisions;
      this.reserved=this.towerPhase==='lowering'?TOWER.size:0;
      if(!this.pusher||!this.rail||!this.lift||!this.cage||this.actors.some(a=>!this.world.getRigidBody(a.handle))) {
        this.events.free();this.world.free();throw new Error('保存された盤面の剛体を復元できません');
      }
      return;
    }
    this.world = new RAPIER.World(v(0, -9.81 / METRES_PER_UNIT, 0));
    this.world.timestep = DT;
    this.world.numSolverIterations = 12;
    this.world.maxCcdSubsteps = 2;
    // Millimetre-thick metal needs a much stiffer contact model than Rapier's
    // general-purpose defaults; otherwise a tall stack behaves like foam.
    this.world.integrationParameters.contact_natural_frequency = 600;
    this.world.integrationParameters.normalizedAllowedLinearError = .00002 / METRES_PER_UNIT;
    this.world.integrationParameters.normalizedPredictionDistance = .0007 / METRES_PER_UNIT;
    const kinematic = (p: V) => this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...Object.values(enginePoint(p)) as [number,number,number]));
    this.pusher = kinematic(v(0,0,12));
    this.rail = kinematic(v(0,0,-1));
    this.lift = kinematic(v(TOWER.x,-.12,TOWER.z));
    this.cage = kinematic(v(TOWER.x,-4.7,TOWER.z));
    for (const part of this.parts) {
      const { size, at, rotation, group } = part;
      const desc = RAPIER.ColliderDesc.cuboid(size.x*D/2,size.y*D/2,size.z*D/2)
        .setTranslation(at.x*D,at.y*D,at.z*D).setFriction(.35).setRestitution(.03);
      if (rotation) desc.setRotation(rotation);
      const parent = group ? this[group] : undefined;
      this.world.createCollider(desc, parent);
    }
    this.seedBoard();
  }
  body(a: Actor) { return this.world.getRigidBody(a.handle); }
  coins() { return this.actors.filter(a=>a.kind==='coin').length; }
  balls() { return this.actors.filter(a=>a.kind==='ball').length; }
  hasCapacity(n = 1) { return this.coins()+this.reserved+n <= CAPACITY; }
  position(a: Actor): V { const p=this.body(a).translation(); return v(p.x/D,p.y/D,p.z/D); }
  export(): PhysicsSave {
    return {
      world:this.world.takeSnapshot(), actors:structuredClone(this.actors),
      time:this.time,angle:this.angle,targetAngle:this.targetAngle,nextId:this.nextId,
      pusher:this.pusher.handle,rail:this.rail.handle,lift:this.lift.handle,cage:this.cage.handle,
      towerPhase:this.towerPhase,towerTime:this.towerTime,towerId:this.towerId,towerBorn:this.towerBorn,
      payoutClock:this.payoutClock,ballClock:this.ballClock,collisions:this.collisions,
    };
  }
  spawn(kind: Actor['kind'], p: V, source: string, rotation=defaultRotation, velocity=v(0,0,0), tower?: number) {
    const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(p.x*D,p.y*D,p.z*D).setRotation(rotation)
      .setLinvel(velocity.x*D,velocity.y*D,velocity.z*D)
      .setLinearDamping(.025).setAngularDamping(.045).setCcdEnabled(true));
    const collider = kind==='coin'
      ? RAPIER.ColliderDesc.roundCylinder(THICKNESS*D/2-.004,.5*D-.004,.004).setMass(.005).setFriction(.45)
      : RAPIER.ColliderDesc.ball(1.1*D).setMass(.012).setFriction(.3);
    collider.setRestitution(.05).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.world.createCollider(collider,b);
    if(tower) b.setAdditionalSolverIterations(4);
    const actor: Actor = { id:this.nextId++,handle:b.handle,kind,source,tower,previous:{...p},previousQ:{...rotation} };
    this.actors.push(actor);
    return actor;
  }
  private seedBoard() {
    // Scatter each loose layer with minimum spacing, then let gravity settle
    // it. Layers use independent positions so the result is a pile, not columns.
    const random=()=>this.game.random[3].next();
    let lowerBase=0;
    // A dense foundation transmits the pusher stroke. Loose offset layers
    // above it provide the irregular, overlapping surface visible to players.
    for(let row=0;row<13;row++) for(let col=0;col<13;col++) {
      const p=v((col-6)*1.005+(row%2)*.5025+(random()-.5)*.012,THICKNESS/2+.004,.08+row*.885+(random()-.5)*.012);
      if(p.x>6.45)continue;
      if(Math.abs(p.x-TOWER.x)<TOWER.half+.9 && Math.abs(p.z-TOWER.z)<TOWER.half+.9)continue;
      this.spawn('coin',p,'initial',yaw(random()*Math.PI*2));lowerBase++;
    }
    const scatter=(count:number, rear:boolean)=>{
      let layer=rear?0:1, positions:V[]=[];
      for(let i=0;i<count;i++) {
        let p:V|undefined;
        for(let attempt=0;attempt<700;attempt++) {
          const candidate=v((random()-.5)*12.7,0,rear?12.16+random()*4.8:.8+random()*10.3);
          if(!rear && Math.abs(candidate.x-TOWER.x)<TOWER.half+.9 && Math.abs(candidate.z-TOWER.z)<TOWER.half+.9)continue;
          if(positions.every(q=>Math.hypot(q.x-candidate.x,q.z-candidate.z)>1.015)) {p=candidate;break;}
        }
        if(!p) {layer++;positions=[];i--;continue;}
        positions.push(p);
        p.y=(rear?1.2:0)+THICKNESS/2+.018+layer*.18+random()*.012;
        const angle=random()*Math.PI*2, tilt=(random()-.5)*.05;
        const rotation={x:Math.sin(tilt/2)*Math.cos(angle/2),y:Math.cos(tilt/2)*Math.sin(angle/2),z:-Math.sin(tilt/2)*Math.sin(angle/2),w:Math.cos(tilt/2)*Math.cos(angle/2)};
        this.spawn('coin',p,'initial',rotation);
      }
    };
    const lower=Math.round(INITIAL_COINS*.7);
    scatter(lower-lowerBase,false);scatter(INITIAL_COINS-lower,true);
    this.spawn('ball',v(-3.7,1.18,4.1),'initial');
    // Let the initial arrangement settle on the stationary machine.
    for(let n=0;n<100;n++) this.world.step();
    for(const a of this.actors) { a.previous=this.position(a); a.previousQ={...this.body(a).rotation()}; }
  }
  inputPoint(): V { return v(Math.sin(this.angle)*.2,7.51,-1+Math.cos(this.angle)*.2); }
  canInsert() {
    if(!this.hasCapacity() || this.game.state.wallet<1) return false;
    const p=this.inputPoint();
    return !this.actors.some(a=>{const q=this.position(a);return Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)<.72;});
  }
  insert() {
    if(!this.canInsert()) return false;
    const a=this.angle, c=Math.cos(a), s=Math.sin(a);
    // Cylinder's normal is across the rail: the medal stands on its rim.
    const q={x:Math.sin(a/2)*Math.SQRT1_2,y:Math.sin(a/2)*Math.SQRT1_2,z:Math.cos(a/2)*Math.SQRT1_2,w:Math.cos(a/2)*Math.SQRT1_2};
    const coin=this.spawn('coin',this.inputPoint(),'player',q,v(s*5,-.78,c*5));
    this.body(coin).setAngvel(v(c*10,0,-s*10),true);
    this.game.spend(this.balls());
    return true;
  }
  setAngle(angle: number) { this.targetAngle=Math.max(-LIMIT,Math.min(LIMIT,angle)); }
  private clearArea(x: number,z: number,half: number,above=-1) {
    return !this.actors.some(a=>{const p=this.position(a);const r=a.kind==='ball'?1.1:.5;return p.y>above&&Math.abs(p.x-x)<half+r&&Math.abs(p.z-z)<half+r;});
  }
  private tickTower() {
    const phase=this.towerPhase;
    if(phase==='idle') {
      if(this.game.state.towerJobs && this.hasCapacity(TOWER.size) && this.clearArea(TOWER.x,TOWER.z,TOWER.half+.25)) {
        this.towerPhase='lowering'; this.towerTime=0; this.towerId++;
        this.reserved=TOWER.size; this.game.state.towerJobs--; this.game.onDurableChange();
      }
      return;
    }
    this.towerTime+=DT;
    if(phase==='lowering') {
      const t=Math.min(this.towerTime/1.5,1), y=-.12-4.2*t;
      this.lift.setNextKinematicTranslation(enginePoint(v(TOWER.x,y,TOWER.z)));
      if(t===1) {
        // Each layer alternates orientation, supported by its neighbours.
        for(let layer=0;layer<40;layer++) for(let i=0;i<3;i++) {
          const angle=i*Math.PI*2/3+(layer%2)*Math.PI/24;
          this.spawn('coin',v(TOWER.x+Math.cos(angle)*.59,y+.12+THICKNESS/2+.003+layer*(THICKNESS+.002),TOWER.z+Math.sin(angle)*.59),'tower',defaultRotation,v(0,0,0),this.towerId);
        }
        this.reserved=0; this.towerPhase='rising'; this.towerTime=0;
        this.cage.setNextKinematicTranslation(enginePoint(v(TOWER.x,y,TOWER.z)));
        this.game.onDurableChange();
      }
    } else if(phase==='rising') {
      const t=Math.min(this.towerTime/4,1), smooth=t*t*(3-2*t), y=-4.32+4.2*smooth;
      this.lift.setNextKinematicTranslation(enginePoint(v(TOWER.x,y,TOWER.z)));
      this.cage.setNextKinematicTranslation(enginePoint(v(TOWER.x,y,TOWER.z)));
      if(t===1) { this.towerPhase='uncovering';this.towerTime=0; }
    } else if(phase==='uncovering') {
      const t=Math.min(this.towerTime/2.5,1);
      this.cage.setNextKinematicTranslation(enginePoint(v(TOWER.x,-.12-4.6*t,TOWER.z)));
      if(t===1) {
        this.towerPhase='standing';this.towerBorn=this.time;this.towerTime=0;
        for(const a of this.actors) if(a.tower===this.towerId)this.body(a).wakeUp();
        this.game.onSound('tower');this.game.onDurableChange();
      }
    } else if(phase==='standing' && this.time-this.towerBorn>3) {
      const members=this.actors.filter(a=>a.tower===this.towerId);
      const high=members.filter(a=>this.position(a).y>1.15).length;
      if(high<12) { this.towerPhase='idle'; this.game.onDurableChange(); }
    }
  }
  private tickRewards() {
    this.payoutClock-=DT;this.ballClock-=DT;
    const s=this.game.state;
    const payout=s.payouts[0];
    if(payout && this.payoutClock<=0 && this.hasCapacity()) {
      const x=(this.game.random[3].next()-.5)*11;
      // Do not spawn a reward inside another object.
      const p=v(x,3.0,16.2);
      if(!this.actors.some(a=>{const q=this.position(a);return Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)<.7;})) {
        this.spawn('coin',p,payout.total===300?'jackpot':'fieldReward');
        payout.remaining--;this.payoutClock=1/12;
        if(payout.remaining===0) {s.payouts.shift();this.game.onDurableChange();}
      }
    }
    if(s.ballJobs && this.balls()<3 && this.ballClock<=0) {
      const p=v(-5.5,3.7,16);
      if(!this.actors.some(a=>{const q=this.position(a);return Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)<1.7;})) {
        this.spawn('ball',p,'reward');s.ballJobs--;this.ballClock=2;this.game.onDurableChange();
      }
    }
    this.tickTower();
  }
  step() {
    this.time+=DT;
    const diff=this.targetAngle-this.angle;
    this.angle+=Math.max(-DT*.8,Math.min(DT*.8,diff));
    this.rail.setNextKinematicRotation(yaw(this.angle));
    const front=11.4+.6*Math.cos(this.time*Math.PI*2/PUSHER_PERIOD);
    this.pusher.setNextKinematicTranslation(enginePoint(v(0,0,front)));
    this.tickRewards();
    for(const a of this.actors) {
      a.previous=this.position(a);a.previousQ={...this.body(a).rotation()};
    }
    this.world.step(this.events);
    this.events.drainCollisionEvents((first,second,started)=>{
      if(!started)return;
      this.collisions++;
      const a=this.world.getCollider(first)?.parent(),b=this.world.getCollider(second)?.parent();
      const av=a?.linvel()??v(0,0,0),bv=b?.linvel()??v(0,0,0);
      const speed=Math.hypot(av.x-bv.x,av.y-bv.y,av.z-bv.z);
      // Resting support contacts are silent; only fresh impacts make a sound.
      if(speed>.6)this.onImpact(speed*.08);
    });
    const collected: Actor[]=[];
    for(const a of this.actors) {
      const p=this.position(a);
      // Remember crossing below the front lip. A falling medal may bounce
      // back under the deck; it has still entered the front collection tray.
      if(p.z<0 && p.y<-.15)a.departedFront=true;
      if((p.z<0||a.departedFront) && p.y < -1.25) collected.push(a);
      else if(!Number.isFinite(p.x+p.y+p.z)||p.y< -8||Math.abs(p.x)>8||p.z>19) {
        this.anomaly='物理計算の異常を検出しました。保存した状態から再開できます。';
      }
    }
    for(const a of collected) {
      this.world.removeRigidBody(this.body(a));
      const index=this.actors.indexOf(a);this.actors.splice(index,1);
      if(a.kind==='coin')this.game.collectCoin();else this.game.collectBall();
    }
    this.game.tick(DT);
  }
  dispose() { this.events.free();this.world.free(); }
}
