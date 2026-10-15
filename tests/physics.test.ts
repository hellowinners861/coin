import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../src/game.ts';
import { Simulation, v } from '../src/physics.ts';
import { D, INITIAL_COINS, LIMIT, TOWER } from '../src/config.ts';

await RAPIER.init();
function empty(s:Simulation) {for(const a of s.actors)s.world.removeRigidBody(s.body(a));s.actors=[];}

test('initial board has the tuned medal population and one ball',()=>{
  const s=new Simulation(new Game(undefined,123));
  try {assert.equal(s.coins(),INITIAL_COINS);assert.equal(s.balls(),1);assert.ok(s.actors.every(a=>s.body(a).isDynamic()));}
  finally{s.dispose();}
});

for(const angle of [0,-LIMIT,LIMIT])test(`the same medal rolls from front to rear at angle ${angle.toFixed(3)}`,()=>{
  const g=new Game(undefined,123),s=new Simulation(g);
  try{
    s.setAngle(angle);for(let n=0;n<70;n++)s.step();
    assert.equal(s.insert(),true);const a=s.actors.find(a=>a.source==='player')!;
    const handle=a.handle;assert.ok(s.position(a).z<0);
    let furthest=0,landed=false;
    for(let n=0;n<420;n++){
      s.step();assert.equal(s.anomaly,'');
      if(s.actors.includes(a)){const p=s.position(a);furthest=Math.max(furthest,p.z);if(p.z>14&&p.y<2)landed=true;}
    }
    assert.ok(furthest>15.5,`medal stopped at ${furthest}`);
    assert.ok(landed,'medal never reached upper shelf');
    assert.equal(a.handle,handle);assert.equal(g.state.paid,1);
  }finally{s.dispose();}
});

test('side and rear walls retain both balls and medals',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  try{
    const actors=[s.spawn('coin',v(6,1.2,4),'test',undefined,v(30,0,0)),s.spawn('ball',v(-5.5,2,12),'test',undefined,v(-30,0,15))];
    for(let n=0;n<360;n++){s.step();assert.equal(s.anomaly,'');}
    for(const a of actors){assert.ok(s.actors.includes(a));const p=s.position(a);assert.ok(Math.abs(p.x)<7.2);assert.ok(p.z<18.1);}
    assert.equal(g.state.won,0);
  }finally{s.dispose();}
});

test('front collection removes each object and credits once',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  try{
    const a=s.spawn('coin',v(0,.1,.05),'test',undefined,v(0,0,-3));
    for(let n=0;n<240;n++)s.step();
    assert.ok(!s.actors.includes(a));assert.equal(g.state.won,1);assert.equal(g.state.wallet,101);
    for(let n=0;n<120;n++)s.step();assert.equal(g.state.won,1);
  }finally{s.dispose();}
});

test('world snapshot resumes motion, pending payout, and RNG together',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);s.insert();g.payout(30);
  for(let n=0;n<25;n++)s.step();
  const save=s.export(),copy=new Game(g.export()),resumed=new Simulation(copy,save);
  try{
    assert.equal(resumed.actors.length,s.actors.length);
    assert.equal(copy.state.payouts[0].remaining,g.state.payouts[0].remaining);
    for(let n=0;n<30;n++){s.step();resumed.step();}
    assert.equal(resumed.actors.length,s.actors.length);
    for(let i=0;i<s.actors.length;i++){
      const a=s.position(s.actors[i]),b=resumed.position(resumed.actors[i]);
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.005);
    }
    assert.deepEqual(g.export(),copy.export());
  }finally{s.dispose();resumed.dispose();}
});

test('tower lift delivers 120 independently simulated coins without side loss',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);g.state.towerJobs=1;
  try{
    for(let n=0;n<2400;n++){s.step();assert.equal(s.anomaly,'');}
    const coins=s.actors.filter(a=>a.tower);
    assert.equal(coins.length,TOWER.size);assert.ok(coins.every(a=>s.body(a).isDynamic()));
    assert.equal(s.towerPhase,'standing');
    assert.ok(Math.max(...coins.map(a=>s.position(a).y))>2,'tower collapsed during assembly');
    assert.ok(coins.every(a=>Math.abs(s.position(a).x)<7));
    // A mechanical contact presses the base, like force transmitted by the
    // machine through a pile of medals. Bodies must fall without an HP trigger.
    const before=coins.map(a=>s.position(a));
    const ram=s.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(TOWER.x*D,.18*D,9.4*D));
    s.world.createCollider(RAPIER.ColliderDesc.cuboid(1.5*D,.18*D,.15*D),ram);
    for(let n=0;n<1680;n++){
      ram.setNextKinematicTranslation(v(TOWER.x*D,.18*D,(9.4-Math.min(n/960,1)*11)*D));
      s.step();
    }
    const moved=coins.filter((a,i)=>!s.actors.includes(a)||Math.hypot(s.position(a).x-before[i].x,s.position(a).z-before[i].z)>.3);
    assert.ok(moved.length>3,'tower did not react to base contact');
    const fallen=coins.filter((a,i)=>before[i].y>1.5&&(!s.actors.includes(a)||s.position(a).y<before[i].y-.5));
    assert.ok(fallen.length>3,'unsupported upper coins did not fall');assert.equal(s.anomaly,'');
  }finally{s.dispose();}
});

test('a 300-medal jackpot retains its full physical entitlement',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);g.payout(300);
  try{
    // Includes settling, deferred supply, and any awards from collected medals.
    for(let n=0;n<6720;n++){s.step();assert.equal(s.anomaly,'');}
    const remaining=g.state.payouts.filter(p=>p.total===300).reduce((n,p)=>n+p.remaining,0);
    const live=s.actors.filter(a=>a.source==='jackpot').length;
    assert.equal(live+g.state.won+remaining,300);
  }finally{s.dispose();}
});

test('ordinary play moves the opening bank into the real collection tray',()=>{
  const g=new Game(undefined,42),s=new Simulation(g);
  try{
    let last=-100;
    for(let n=0;n<2400;n++){
      if(s.time-last>1/3&&g.state.wallet>0&&s.insert())last=s.time;
      s.step();assert.equal(s.anomaly,'');
    }
    assert.ok(g.state.paid>20);assert.ok(g.state.won>=5,'the opening bank never reached the collection tray');
    assert.equal(g.state.wallet,100-g.state.paid+g.state.won+g.state.direct);
  }finally{s.dispose();}
});
