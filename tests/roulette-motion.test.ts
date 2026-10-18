import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {PhysicalDraw,makePlan} from '../src/events/draw.ts';
import {Random} from '../src/game.ts';

test('a fast ball circles several times, slows down and enters a real pocket',async()=>{
 await RAPIER.init();const rng=new Random(42);
 for(let i=0;i<12;i++){
  const d=new PhysicalDraw(makePlan(()=>rng.next()));let angle=0,prev=Math.atan2(d.ball.translation().z,d.ball.translation().x),early=0,late=0;
  while(d.pocket===null&&d.elapsed<24){d.step(1/120);const p=d.ball.translation(),a=Math.atan2(p.z,p.x);angle+=Math.atan2(Math.sin(a-prev),Math.cos(a-prev));prev=a;
   const v=d.ball.linvel();if(Math.abs(d.elapsed-1)<.005)early=Math.hypot(v.x,v.z);if(Math.abs(d.elapsed-6)<.005)late=Math.hypot(v.x,v.z);
   if(d.elapsed<d.gateOpenAt)assert.equal(d.pocket,null);
  }
  assert.notEqual(d.pocket,null);assert.ok(Math.abs(angle)/(2*Math.PI)>3.5,'must actually travel around the bowl, not just report a high velocity');
  assert.ok(early>late&&late>1,'retain movement during the suspense phase');assert.ok(d.elapsed>6&&d.elapsed<14);d.dispose();
 }
});
test('restoring after gates open preserves physics, timing and the final pocket',async()=>{
 await RAPIER.init();const rng=new Random(113),d=new PhysicalDraw(makePlan(()=>rng.next()));d.step(d.gateOpenAt+.1);
 const saved=d.export(),copy=new PhysicalDraw(d.plan,saved);assert.equal(copy.gateOpenAt,d.gateOpenAt);assert.equal(copy.world.timestep,d.world.timestep);
 while(d.pocket===null&&d.elapsed<24)d.step(1/60);while(copy.pocket===null&&copy.elapsed<24)copy.step(1/60);
 assert.notEqual(d.pocket,null);assert.equal(copy.pocket,d.pocket);assert.equal(copy.elapsed,d.elapsed);d.dispose();copy.dispose();
});
