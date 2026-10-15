import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../src/game.ts';
import { MedalFeed } from '../src/feed.ts';
import { Simulation, v } from '../src/physics.ts';
import { D, INITIAL_COINS, LIMIT, THICKNESS, TOWER } from '../src/config.ts';

await RAPIER.init();
function empty(s:Simulation) {for(const a of s.actors)s.world.removeRigidBody(s.body(a));s.actors=[];}

test('initial board has the tuned medal population and one ball',()=>{
  const s=new Simulation(new Game(undefined,123));
  try {assert.equal(s.coins(),INITIAL_COINS);assert.equal(s.balls(),1);assert.ok(s.actors.every(a=>s.body(a).isDynamic()));}
  finally{s.dispose();}
});

test('opening piles vary with layout seed without consuming lottery randomness',()=>{
  const a=new Game(undefined,123),b=new Game(undefined,456);
  const before=a.random.slice(0,3).map(r=>r.value);
  const sa=new Simulation(a),sb=new Simulation(b);
  try {
    assert.equal(sa.coins(),360);assert.equal(sb.coins(),360);
    assert.deepEqual(a.random.slice(0,3).map(r=>r.value),before);
    const pa=sa.actors.filter(c=>c.kind==='coin').map(c=>sa.position(c));
    const pb=sb.actors.filter(c=>c.kind==='coin').map(c=>sb.position(c));
    assert.ok(pa.some((p,i)=>Math.hypot(p.x-pb[i].x,p.z-pb[i].z)>1));
    assert.ok(new Set(pa.map(p=>p.z.toFixed(2))).size>100,'coins still form rows');
    assert.ok(pa.filter(p=>p.z<11&&p.y>THICKNESS*1.2).length>40,'lower pile lacks overlapping layers');
    assert.ok(pa.every(p=>Math.abs(p.x)<7&&p.z<18&&p.y>-.1),'seed spilled off board');
  }finally{sa.dispose();sb.dispose();}
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

test('a medal that rebounds below the front lip is collected once after restoring',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  s.spawn('coin',v(0,-.3,-.06),'test',undefined,v(0,0,3));
  s.step();assert.equal(s.actors[0].departedFront,true);
  const restoredGame=new Game(g.export()),restored=new Simulation(restoredGame,s.export());
  try {
    for(let n=0;n<180;n++)restored.step();
    assert.equal(restored.anomaly,'');assert.equal(restoredGame.state.won,1);assert.equal(restored.coins(),0);
    for(let n=0;n<60;n++)restored.step();assert.equal(restoredGame.state.won,1);
  }finally{s.dispose();restored.dispose();}
});

test('world snapshot preserves poses, velocities, pending payout, and RNG',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);s.insert();g.payout(30);
  for(let n=0;n<25;n++)s.step();
  const save=s.export(),copy=new Game(g.export()),resumed=new Simulation(copy,save);
  try{
    assert.equal(resumed.actors.length,s.actors.length);
    assert.equal(copy.state.payouts[0].remaining,g.state.payouts[0].remaining);
    assert.deepEqual(g.export(),copy.export());
    for(let i=0;i<s.actors.length;i++) {
      assert.deepEqual(resumed.position(resumed.actors[i]),s.position(s.actors[i]));
      assert.deepEqual(resumed.body(resumed.actors[i]).rotation(),s.body(s.actors[i]).rotation());
      assert.deepEqual(resumed.body(resumed.actors[i]).linvel(),s.body(s.actors[i]).linvel());
      assert.deepEqual(resumed.body(resumed.actors[i]).angvel(),s.body(s.actors[i]).angvel());
    }
    // Warm-start contact caches need not produce identical future trajectories
    // in a dense pile. Verify the actual saved state exactly, then conservation.
    for(let n=0;n<30;n++){s.step();resumed.step();assert.equal(resumed.anomaly,'');}
    assert.equal(resumed.actors.length,s.actors.length);
    const total=(sim:Simulation,game:Game)=>sim.actors.filter(a=>a.source==='fieldReward').length+game.state.won+game.state.payouts.reduce((n,p)=>n+p.remaining,0);
    assert.equal(total(resumed,copy),total(s,g));
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
      s.step();assert.equal(s.anomaly,'',`tower contact at step ${n}`);
    }
    const moved=coins.filter((a,i)=>!s.actors.includes(a)||Math.hypot(s.position(a).x-before[i].x,s.position(a).z-before[i].z)>.3);
    assert.ok(moved.length>3,'tower did not react to base contact');
    const fallen=coins.filter((a,i)=>before[i].y>1.5&&(!s.actors.includes(a)||s.position(a).y<before[i].y-.5));
    assert.ok(fallen.length>3,'unsupported upper coins did not fall');assert.equal(s.anomaly,'',JSON.stringify(s.actors.map(a=>s.position(a)).filter(p=>!Number.isFinite(p.x+p.y+p.z)||p.y < -8||Math.abs(p.x)>8||p.z>19)));
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
    assert.ok(g.state.paid>20);assert.ok(g.state.won>=5,`opening bank only collected ${g.state.won}`);
    assert.equal(g.state.wallet,100-g.state.paid+g.state.won+g.state.direct);
  }finally{s.dispose();}
});


for(const angle of [0,-LIMIT,LIMIT])test(`auto triple uses three real medals and lands near rear retraction at angle ${angle.toFixed(3)}`,()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  g.state.batchSize=3;const feed=new MedalFeed(g,s);feed.setAutomatic(true);s.setAngle(angle);
  const arrived=new Map<number,number>();
  try {
    for(let n=0;n<880;n++) {
      feed.tick();s.step();assert.equal(s.anomaly,'');
      for(const a of s.actors)if(a.source==='player') {
        const p=s.position(a);
        if(p.z>14&&p.y<2&&!arrived.has(a.id))arrived.set(a.id,s.time);
      }
    }
    assert.equal(g.state.paid,3);assert.equal(g.state.wallet,97);assert.equal(arrived.size,3);
    for(const time of arrived.values())assert.ok(Math.abs(time-3)<.4,`arrival at ${time}`);
    assert.ok([...arrived.values()].every(time=>11.4+.6*Math.cos(time*Math.PI*2/3)>11.8));
    assert.ok(s.actors.filter(a=>a.source==='player').every(a=>s.body(a).isDynamic()));
  }finally{s.dispose();}
});
