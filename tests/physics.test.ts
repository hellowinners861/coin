import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from '../src/game.ts';
import { MedalFeed } from '../src/feed.ts';
import { Simulation, v } from '../src/physics.ts';
import { D, DT, INITIAL_COINS, LIMIT, MINI_BALL_RADIUS, PUSHER_CENTER, PUSHER_HALF_STROKE, PUSHER_PERIOD, REWARD_SHOOTER, THICKNESS, TOWER } from '../src/config.ts';

await RAPIER.init();
function empty(s:Simulation) {for(const a of s.actors)s.world.removeRigidBody(s.body(a));s.actors=[];}

test('the real pusher travels 1.8 medal diameters in a two-second round trip',()=>{
  const s=new Simulation(new Game(undefined,123));empty(s);
  try {
    const start=s.pusher.translation().z;let min=start,max=start;
    for(let n=0;n<Math.round(PUSHER_PERIOD/DT);n++) {
      s.step();const z=s.pusher.translation().z;min=Math.min(min,z);max=Math.max(max,z);
    }
    assert.equal(PUSHER_PERIOD,2);
    assert.ok(Math.abs(min-10.5)<1e-4);assert.ok(Math.abs(max-12.3)<1e-4);
    assert.ok(Math.abs(max-min-1.8)<1e-4);
    assert.ok(Math.abs(s.pusher.translation().z-start)<1e-4);assert.equal(s.anomaly,'');
  }finally{s.dispose();}
});

test('the wider stroke pushes a lower medal forward without letting it under the shelf',()=>{
  const s=new Simulation(new Game(undefined,123));empty(s);
  const a=s.spawn('coin',v(0,THICKNESS/2+.004,11.2),'test');
  try {
    for(let n=0;n<960;n++) {
      s.step();assert.equal(s.anomaly,'');
      const p=s.position(a),front=s.pusher.translation().z;
      assert.ok(!(p.z>front+.55&&p.y>-.1&&p.y<1.15),'medal went under the pusher');
    }
    assert.ok(s.position(a).z<10.5,'wider forward stroke did not displace medal');
  }finally{s.dispose();}
});

for(const holding of [false,true])test(`old narrow-stroke save eases into 1.8D travel and preserves an in-progress migration (holding=${holding})`,()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  if(holding)g.payout(10);
  s.pusherTime=holding?1:.4;
  const front=PUSHER_CENTER+.6*Math.cos(s.pusherTime*Math.PI*2/PUSHER_PERIOD);
  s.pusher.setTranslation(v(0,0,front),true);
  const save=s.export();delete save.pusherHalfStroke;save.rewardHolding=holding;
  const resumed=new Simulation(new Game(g.export()),save);
  try {
    assert.equal(resumed.pusherHalfStroke,.6);
    assert.ok(Math.abs(resumed.pusher.translation().z-front)<1e-5);
    resumed.step();assert.ok(Math.abs(resumed.pusher.translation().z-front)<.02);
    for(let n=0;n<59;n++)resumed.step();
    const copy=new Simulation(new Game(resumed.game.export()),resumed.export());
    try {
      assert.equal(copy.pusherHalfStroke,resumed.pusherHalfStroke);
      for(let n=0;n<181;n++){copy.step();assert.equal(copy.anomaly,'');}
      assert.ok(Math.abs(copy.pusherHalfStroke-.9)<1e-6);
    }finally{copy.dispose();}
  }finally{s.dispose();resumed.dispose();}
});

test('initial board has the tuned medal population and one ball',()=>{
  const s=new Simulation(new Game(undefined,123));
  try {
    assert.equal(s.coins(),INITIAL_COINS);assert.equal(s.balls(),1);assert.equal(s.miniBalls(),3);
    assert.ok(s.actors.every(a=>s.body(a).isDynamic()));
    const covered=s.actors.filter(a=>a.kind==='coin').map(a=>s.position(a))
      .filter(p=>Math.abs(p.x-TOWER.x)<TOWER.half&&Math.abs(p.z-TOWER.z)<TOWER.half);
    assert.ok(covered.length>5,'tower lift is artificially empty at start');
  }
  finally{s.dispose();}
});

test('a small physical ball is collected once and queues ten medals after restore',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  const mini=s.spawn('miniBall',v(0,-.3,-.1),'test',undefined,v(0,0,-2));
  assert.ok(Math.abs((s.body(mini).collider(0).shape as RAPIER.Ball).radius-MINI_BALL_RADIUS)<1e-6);
  s.step();
  const copy=new Game(g.export()),resumed=new Simulation(copy,s.export());
  try {
    for(let n=0;n<100;n++)resumed.step();
    assert.equal(resumed.miniBalls(),0);assert.equal(copy.state.miniBallsCollected,1);
    assert.equal(copy.state.payouts[0].remaining,10);assert.equal(copy.state.balls,0);
    assert.equal(copy.state.won,0);assert.equal(copy.state.wallet,100);
    assert.equal(resumed.anomaly,'');
  }finally{s.dispose();resumed.dispose();}
});

test('side rewards wait for forward shelf, hold it, and preserve remaining shots on restore',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);g.payout(10);
  let first=false;
  try {
    for(let n=0;n<400;n++) {
      const before=s.coins();s.step();assert.equal(s.anomaly,'');
      if(s.coins()>before) {
        const a=s.actors.at(-1)!;
        assert.equal(a.source,'fieldReward');
        assert.ok(Math.abs(s.pusher.translation().z-(PUSHER_CENTER-PUSHER_HALF_STROKE))<.001);
        assert.ok(s.position(a).x>REWARD_SHOOTER.x&&s.position(a).z>16);
        first=true;
      }
      if(s.time<PUSHER_PERIOD/2-DT)assert.equal(s.coins(),0);
    }
    assert.equal(first,true);assert.equal(s.rewardHolding,true);
    const copy=new Game(g.export()),resumed=new Simulation(copy,s.export());
    try {
      assert.equal(resumed.pusherTime,s.pusherTime);
      for(let n=0;n<700;n++){resumed.step();assert.equal(resumed.anomaly,'');}
      assert.equal(copy.state.payouts.length,0);assert.equal(resumed.coins(),10);
      assert.equal(copy.state.wallet,100);assert.equal(copy.state.won,0);
      assert.equal(resumed.rewardHolding,false);assert.ok(resumed.pusherTime>s.pusherTime);
      assert.ok(resumed.actors.every(a=>resumed.position(a).z>14),'shots did not stay near the rear');
    }finally{resumed.dispose();}
  }finally{s.dispose();}
});

test('a blocked side feeder releases the pusher and retains the full payout',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);g.payout(10);
  const blocker=s.spawn('ball',v(REWARD_SHOOTER.x,REWARD_SHOOTER.y,REWARD_SHOOTER.z),'obstruction');
  s.body(blocker).setBodyType(RAPIER.RigidBodyType.Fixed,true);
  try {
    for(let n=0;n<1000;n++){s.step();assert.equal(s.anomaly,'');}
    assert.equal(g.state.payouts[0].remaining,10);assert.equal(s.coins(),0);
    assert.equal(s.rewardHolding,false);assert.ok(s.pusherTime>1.6);
    s.world.removeRigidBody(s.body(blocker));s.actors=[];
    for(let n=0;n<1100;n++){s.step();assert.equal(s.anomaly,'');}
    assert.equal(g.state.payouts.length,0);assert.equal(s.coins(),10);
  }finally{s.dispose();}
});

test('a mini ball at the reward muzzle does not inhibit a shot or disappear',()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);g.payout(10);
  const mini=s.spawn('miniBall',v(REWARD_SHOOTER.x,REWARD_SHOOTER.y,REWARD_SHOOTER.z),'obstruction');
  // Hold the obstruction in place so gravity cannot make the test pass by
  // moving it out of the muzzle before the first forward stroke.
  s.body(mini).setBodyType(RAPIER.RigidBodyType.Fixed,true);
  try {
    s.pusherTime=PUSHER_PERIOD/2-DT;
    s.step();
    assert.equal(s.coins(),1);assert.equal(g.state.payouts[0].remaining,9);
    assert.ok(s.actors.includes(mini));assert.equal(s.miniBalls(),1);
    assert.equal(g.state.miniBallsCollected,0);assert.equal(s.anomaly,'');
  }finally{s.dispose();}
});

for(const holding of [false,true])test(`legacy 3-second save retains shelf position at 1.5x speed (holding=${holding})`,()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  if(holding)g.payout(10);
  const oldPhase=holding?1.5:.75,front=holding?10.8:11.4;
  s.pusher.setTranslation(v(0,0,front),true);
  const save=s.export();delete save.pusherPeriod;delete save.pusherHalfStroke;
  save.pusherTime=oldPhase;save.rewardHolding=holding;
  const resumed=new Simulation(new Game(g.export()),save);
  try {
    assert.equal(resumed.pusherTime,oldPhase*2/3);
    assert.ok(Math.abs(resumed.pusher.translation().z-front)<1e-5);
    resumed.step();assert.equal(resumed.anomaly,'');
    assert.ok(Math.abs(resumed.pusher.translation().z-front)<.02,'restored shelf jumped to a different phase');
    assert.equal(resumed.export().pusherPeriod,2);
  }finally{s.dispose();resumed.dispose();}
});

test('opening piles vary with layout seed without consuming lottery randomness',()=>{
  const a=new Game(undefined,123),b=new Game(undefined,456);
  const before=a.random.slice(0,3).map(r=>r.value);
  const sa=new Simulation(a),sb=new Simulation(b);
  try {
    assert.equal(sa.coins(),INITIAL_COINS);assert.equal(sb.coins(),INITIAL_COINS);
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


for(const count of [1,3] as const)for(const angle of [0,-LIMIT,LIMIT])test(`auto ${count} lands when the shelf is forward at angle ${angle.toFixed(3)}`,()=>{
  const g=new Game(undefined,123),s=new Simulation(g);empty(s);
  g.state.batchSize=count;const feed=new MedalFeed(g,s);feed.setAutomatic(true);s.setAngle(angle);
  const arrived=new Map<number,number>();
  // At centre the single feed can use the first 1s forward stroke. Turning
  // the rail misses that early launch window; triple feed targets 3s too.
  const target=count===1&&angle===0?1:3;
  try {
    for(let n=0;n<Math.ceil((target+.35)/DT);n++) {
      feed.tick();s.step();assert.equal(s.anomaly,'');
      for(const a of s.actors)if(a.source==='player') {
        const p=s.position(a);
        if(p.z>14&&p.y<2&&!arrived.has(a.id))arrived.set(a.id,s.time);
      }
    }
    assert.equal(g.state.paid,count);assert.equal(g.state.wallet,100-count);assert.equal(arrived.size,count);
    for(const time of arrived.values())assert.ok(Math.abs(time-target)<.4,`arrival at ${time}`);
    const centre=[...arrived.values()].reduce((sum,t)=>sum+t,0)/count;
    assert.ok(Math.abs(centre-target)<.08,`batch centre at ${centre}`);
    assert.ok([...arrived.values()].every(time=>PUSHER_CENTER+PUSHER_HALF_STROKE*Math.cos(time*Math.PI*2/PUSHER_PERIOD)<11.0));
    assert.ok(s.actors.filter(a=>a.source==='player').every(a=>s.body(a).isDynamic()));
  }finally{s.dispose();}
});
