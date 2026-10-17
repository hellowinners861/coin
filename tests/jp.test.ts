import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Game,Random} from '../src/game.ts';
import {makePlan,PhysicalDraw} from '../src/events/draw.ts';
import {makeUpgradePlan,type UpgradeEffect} from '../src/events/jp.ts';

function start(g=new Game(undefined,915)){
 g.cinematic=true;g.enqueue('jpc');g.tick(5.4);const a=g.state.active!;
 // Exercise the base refit independently of the new route benefit.
 a.qualifier!.plan=makePlan(()=>g.random[2].next());
 assert.equal(g.completeQualifier(a.id,2),true);g.tick(2.4);return g;
}
function hit(g:Game,e:UpgradeEffect){
 const a=g.state.active!,r=a.refit!,attempt=r.attempts.at(-1)!;
 const pocket=attempt.plan.labels.indexOf(e);assert.ok(pocket>=0);
 assert.equal(g.resolveUpgrade(a.id,pocket),true);return a;
}
function next(g:Game){assert.equal(g.chooseRefit(g.state.active!.id,true),true);}

test('refit plans have the published ten holes; final plans replace tens, not thirties',()=>{
 const rng=new Random(219);
 for(let i=0;i<200;i++){
  const p=makeUpgradePlan(()=>rng.next());assert.equal(p.labels.length,10);
  for(const [effect,n] of Object.entries({LIGHT:3,BEACON:1,WIND:2,SHIELD:1,CARGO:2,DEPART:1}))assert.equal(p.labels.filter(x=>x===effect).length,n);
  for(let slots=1;slots<=5;slots++){const final=makePlan(()=>rng.next(),slots);assert.equal(final.labels.filter(x=>x==='JACKPOT').length,slots);assert.equal(final.labels.filter(x=>x==='FIELD_30').length,2);assert.equal(final.labels.filter(x=>x==='CREDIT_10').length,8-slots);}
 }
 assert.throws(()=>makePlan(()=>.5,0));assert.throws(()=>makePlan(()=>.5,6));
});
test('every set of three route stamps grants one capped preparation item and one station ticket',()=>{
 const g=new Game(undefined,110);g.cinematic=true;
 for(let route=0;route<3;route++)for(let round=0;round<3;round++){
  for(let i=0;i<3;i++){g.collectMiniBall();g.tick(.1);const a=g.state.active!;assert.equal(a.kind,'mini');g.chooseMiniRoute(a.id,route);if(i===2)assert.equal(a.kitGranted,round<(route===0?2:1));g.skip();}
  assert.equal(g.state.queue.length,1);assert.equal(g.state.queue[0].kind,'station');g.tick(.1);g.skip();
 }
 assert.deepEqual(g.state.jpItems,{lights:2,charts:1,shields:1});assert.deepEqual(g.state.deliveryCompleted,[3,3,3]);
});
test('JP consumes preparation and rescue once, while future preparation remains untouched',()=>{
 const g=new Game(undefined,101);g.state.jpItems={lights:2,charts:1,shields:1};g.state.jpFailures=3;start(g);
 const a=g.state.active!,r=a.refit!;assert.equal(r.slots,4);assert.equal(r.maxBalls,4);assert.equal(r.shield,true);assert.equal(g.state.jpFailures,0);
 assert.deepEqual(g.state.jpItems,{lights:0,charts:0,shields:0});
 const copy=new Game(g.export());copy.cinematic=true;copy.tick(.1);assert.equal(copy.state.active!.refit!.slots,4);assert.deepEqual(copy.state.jpItems,{lights:0,charts:0,shields:0});
 copy.state.jpItems!.lights=1;hit(copy,'BEACON');assert.equal(copy.state.active!.refit!.slots,5);assert.equal(copy.state.jpItems!.lights,1);
});
test('light, gust and a one-use shield update slots without altering any in-flight plan',()=>{
 const g=start(),a=g.state.active!,r=a.refit!,before=structuredClone(r.attempts[0].plan);
 hit(g,'LIGHT');assert.equal(r.slots,2);assert.deepEqual(r.attempts[0].plan,before);
 next(g);hit(g,'SHIELD');assert.equal(r.shield,true);
 next(g);hit(g,'WIND');assert.equal(r.slots,2);assert.equal(r.shield,false);assert.equal(r.who,'garo');assert.equal(r.phase,'final');
 assert.equal(a.plan!.labels.filter(x=>x==='JACKPOT').length,2);
});
test('wind never removes the last JP; further wind can reduce an unprotected bonus',()=>{
 const g=start(),r=g.state.active!.refit!;hit(g,'WIND');assert.equal(r.slots,1);
 next(g);hit(g,'BEACON');assert.equal(r.slots,3);next(g);hit(g,'WIND');assert.equal(r.slots,2);
});
test('cargo is a one-time physical payout, and restore cannot reapply the hit or choice',()=>{
 const g=start(),a=g.state.active!;hit(g,'CARGO');assert.equal(g.state.payouts[0].total,10);assert.equal(g.state.wallet,100);
 assert.equal(g.resolveUpgrade(a.id,0),false);assert.equal(g.resolveUpgrade(a.id+1,0),false);
 const copy=new Game(g.export());copy.cinematic=true;const b=copy.state.active!;
 assert.equal(copy.resolveUpgrade(b.id,b.refit!.attempts[0].pocket!),false);
 assert.equal(copy.chooseRefit(b.id,false),true);const plan=structuredClone(b.plan);
 assert.equal(copy.chooseRefit(b.id,true),false);copy.tick(2.4);assert.deepEqual(b.plan,plan);assert.equal(copy.state.payouts.length,1);
});
test('depart, maximum balls and an eight-second timeout all freeze one final plan before launch',()=>{
 const g=start(),a=g.state.active!;hit(g,'LIGHT');g.tick(7.9);assert.equal(a.refit!.phase,'choice');g.tick(.2);assert.equal(a.refit!.phase,'final');
 assert.equal(g.resolveDraw(a.id,'JACKPOT'),false);g.tick(2.4);assert.equal(g.resolveDraw(a.id,'JACKPOT'),true);
 const d=start();hit(d,'DEPART');assert.equal(d.state.active!.refit!.phase,'final');assert.equal(d.state.active!.refit!.attempts.length,1);
 const max=start();for(let i=0;i<3;i++){hit(max,'LIGHT');if(i<2)next(max);}assert.equal(max.state.active!.refit!.phase,'final');assert.equal(max.chooseRefit(max.state.active!.id,true),false);
});
test('three failed final draws grant rescue to the next JP, never twice after restore',()=>{
 const g=new Game(undefined,43);
 for(let i=1;i<=3;i++){start(g);hit(g,'DEPART');g.tick(2.4);const a=g.state.active!;assert.equal(g.resolveDraw(a.id,'CREDIT_10'),true);assert.equal(g.resolveDraw(a.id,'CREDIT_10'),false);assert.equal(g.state.jpFailures,i);g.skip();}
 const copy=new Game(g.export());start(copy);assert.equal(copy.state.active!.refit!.slots,2);assert.equal(copy.state.jpFailures,0);
 const restored=new Game(copy.export());restored.cinematic=true;assert.equal(restored.state.active!.refit!.slots,2);assert.equal(restored.state.jpFailures,0);
 hit(restored,'DEPART');restored.tick(2.4);restored.resolveDraw(restored.state.active!.id,'JACKPOT');assert.equal(restored.state.jpFailures,0);
});
test('a refit ball snapshot restores the same physical pocket and applies exactly one effect',async()=>{
 await RAPIER.init();const g=start(),a=g.state.active!,attempt=a.refit!.attempts[0];
 const original=new PhysicalDraw(attempt.plan);original.step(1.5);attempt.drawSave=original.export();
 const restored=new Game(g.export());restored.cinematic=true;const b=restored.state.active!,saved=b.refit!.attempts[0];
 const replay=new PhysicalDraw(saved.plan,saved.drawSave);
 while(original.pocket===null&&original.elapsed<24)original.step(1/60);
 while(replay.pocket===null&&replay.elapsed<24)replay.step(1/60);
 assert.notEqual(replay.pocket,null);assert.equal(replay.pocket,original.pocket);assert.equal(replay.result,original.result);
 assert.equal(restored.resolveUpgrade(b.id,replay.pocket!),true);assert.equal(restored.resolveUpgrade(b.id,replay.pocket!),false);
 original.dispose();replay.dispose();
});
