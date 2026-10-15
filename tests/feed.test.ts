import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.ts';
import { MedalFeed, automaticLaunchPhase } from '../src/feed.ts';
import { FEED_INTERVAL, PUSHER_PERIOD } from '../src/config.ts';

function harness(game=new Game(undefined,123)) {
  const launches:number[]=[];
  let blocked=false;
  const sim={time:0,angle:0,targetAngle:0,insert(){
    if(blocked||!game.spend(0))return false;
    launches.push(sim.time);return true;
  }};
  return {game,sim,launches,feed:new MedalFeed(game,sim),block(value:boolean){blocked=value;}};
}

test('one accepted press launches exactly three individually charged medals',()=>{
  const h=harness();h.game.state.batchSize=3;
  assert.equal(h.feed.requestManual(),true);assert.equal(h.feed.requestManual(),false);
  assert.equal(h.game.state.wallet,100);
  h.feed.tick();assert.equal(h.game.state.wallet,99);
  h.sim.time=FEED_INTERVAL-.01;h.feed.tick();assert.equal(h.launches.length,1);
  h.sim.time=FEED_INTERVAL;h.feed.tick();h.sim.time=2*FEED_INTERVAL;h.feed.tick();
  for(let n=0;n<10;n++)h.feed.tick();
  assert.equal(h.launches.length,3);assert.equal(h.game.state.wallet,97);
  assert.equal(h.game.state.paid,3);assert.equal(h.game.state.feedQueue,null);
});

test('a three-medal burst uses only remaining credit, and blocked launches are not charged',()=>{
  const h=harness();h.game.state.wallet=2;h.game.state.batchSize=3;
  h.block(true);h.feed.requestManual();h.feed.tick();assert.equal(h.game.state.wallet,2);
  h.block(false);h.feed.tick();h.sim.time=1;h.feed.tick();
  assert.equal(h.game.state.wallet,0);assert.equal(h.game.state.paid,2);assert.equal(h.launches.length,2);
  h.sim.time=2;h.feed.tick();assert.equal(h.game.state.wallet,0);
});

test('saved manual bursts continue without launching already paid medals twice',()=>{
  const h=harness();h.game.state.batchSize=3;h.feed.requestManual();h.feed.tick();
  const restored=harness(new Game(h.game.export()));
  restored.feed.tick();assert.equal(restored.launches.length,0);
  restored.sim.time=FEED_INTERVAL;restored.feed.tick();restored.sim.time=2*FEED_INTERVAL;restored.feed.tick();
  assert.equal(restored.game.state.wallet,97);assert.equal(restored.game.state.paid,3);
  assert.equal(restored.launches.length,2);
});

for(const count of [1,3] as const)test(`automatic ${count}-medal mode waits for the chosen phase and launches only once per cycle`,()=>{
  const h=harness();h.game.state.batchSize=count;h.feed.setAutomatic(true);
  h.feed.tick();assert.equal(h.launches.length,0);
  h.sim.time=automaticLaunchPhase(count)-.01;h.feed.tick();assert.equal(h.launches.length,0);
  h.sim.time=automaticLaunchPhase(count);h.feed.tick();
  for(let i=1;i<count;i++){h.sim.time+=FEED_INTERVAL;h.feed.tick();}
  assert.equal(h.launches.length,count);
  h.feed.setAutomatic(false);h.feed.setAutomatic(true);h.feed.tick();assert.equal(h.launches.length,count);
  h.sim.time=PUSHER_PERIOD+automaticLaunchPhase(count);h.feed.tick();assert.equal(h.launches.length,count+1);
});

test('OFF cancels unsent automatic medals immediately and reload never enables auto',()=>{
  const h=harness();h.game.state.batchSize=3;h.feed.setAutomatic(true);
  h.sim.time=automaticLaunchPhase(3);h.feed.tick();
  const saved=h.game.export();assert.equal(saved.feedQueue!.remaining,2);
  const restored=harness(new Game(saved));restored.sim.time=10;restored.feed.tick();
  assert.equal(restored.feed.automatic,false);assert.equal(restored.launches.length,0);
  h.feed.setAutomatic(false);h.sim.time+=FEED_INTERVAL;h.feed.tick();
  assert.equal(h.launches.length,1);assert.equal(h.game.state.wallet,99);assert.equal(h.game.state.feedQueue,null);
});

test('auto stops at zero and refill requires explicitly enabling it again',()=>{
  const h=harness();h.game.state.wallet=1;h.game.state.batchSize=3;h.feed.setAutomatic(true);
  h.sim.time=automaticLaunchPhase(3);h.feed.tick();
  assert.equal(h.game.state.wallet,0);assert.equal(h.feed.automatic,false);
  h.game.refillWallet();h.sim.time+=PUSHER_PERIOD;h.feed.tick();
  assert.equal(h.launches.length,1);assert.equal(h.game.state.wallet,100);
});

test('auto skips a blocked timing window rather than firing at a bad phase',()=>{
  const h=harness();h.feed.setAutomatic(true);h.block(true);
  h.sim.time=automaticLaunchPhase(1);h.feed.tick();assert.equal(h.game.state.wallet,100);
  h.sim.time+=.1;h.feed.tick();h.block(false);h.feed.tick();assert.equal(h.launches.length,0);
  h.sim.time+=PUSHER_PERIOD-.1;h.feed.tick();assert.equal(h.launches.length,1);
});

test('auto waits while the rail is turning and mode changes apply to the next burst',()=>{
  const h=harness();h.feed.setAutomatic(true);h.sim.targetAngle=.2;
  h.sim.time=automaticLaunchPhase(1);h.feed.tick();assert.equal(h.launches.length,0);
  h.sim.angle=.2;h.feed.tick();assert.equal(h.launches.length,1);
  h.game.state.batchSize=3;h.sim.time=PUSHER_PERIOD+automaticLaunchPhase(3);h.feed.tick();
  assert.equal(h.launches.length,2);assert.equal(h.game.state.feedQueue!.remaining,2);
  h.game.state.batchSize=1;
  h.sim.time+=FEED_INTERVAL;h.feed.tick();h.sim.time+=FEED_INTERVAL;h.feed.tick();
  assert.equal(h.launches.length,4);
});


test('rapid separate presses share the same safe rail spacing after saving',()=>{
  const h=harness();h.feed.requestManual();h.feed.tick();
  const restored=harness(new Game(h.game.export()));
  restored.sim.time=.05;assert.equal(restored.feed.requestManual(),true);restored.feed.tick();
  assert.equal(restored.launches.length,0);assert.equal(restored.game.state.wallet,99);
  restored.sim.time=FEED_INTERVAL;restored.feed.tick();
  assert.equal(restored.launches.length,1);assert.equal(restored.game.state.wallet,98);
});


test('arrival is centred on maximum forward extension rather than rear retraction',()=>{
  // These expected phases come from the actual 3-second shelf motion: its
  // front edge is nearest the player at 1.5s, not at 0s or 3s.
  assert.ok(Math.abs(automaticLaunchPhase(1)-.55)<1e-8);
  assert.ok(Math.abs(automaticLaunchPhase(3)-.31)<1e-8);
});
