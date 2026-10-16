import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {Game,Random} from '../src/game.ts';
import {PhysicalDraw,makePlan} from '../src/events/draw.ts';
import {idle,diaries,outcome} from '../src/events/scripts.ts';

test('physical JP plans have exactly seven tens, two thirties and one JP',()=>{
 const rng=new Random(8271),counts=Array.from({length:10},()=>({CREDIT_10:0,FIELD_30:0,JACKPOT:0}));
 for(let i=0;i<10000;i++){const plan=makePlan(()=>rng.next());assert.deepEqual([...plan.labels].sort(),[...Array(7).fill('CREDIT_10'),'FIELD_30','FIELD_30','JACKPOT'].sort());plan.labels.forEach((label,k)=>counts[k][label as keyof typeof counts[0]]++);}
 // Pocket bias cannot select reward bias: each pocket gets independently shuffled labels.
 for(const pocket of counts){assert.ok(pocket.CREDIT_10>6700&&pocket.CREDIT_10<7300);assert.ok(pocket.FIELD_30>1750&&pocket.FIELD_30<2250);assert.ok(pocket.JACKPOT>800&&pocket.JACKPOT<1200);}
});
test('physical ticket cannot be paid or skipped before a real result; resolve and reload pay once',()=>{
 const g=new Game(undefined,441);g.cinematic=true;g.enqueue('jpc');g.tick(.1);const a=g.state.active!;
 assert.equal(a.physical,true);assert.equal(a.result,undefined);g.skip();g.tick(40);assert.equal(g.state.active?.id,a.id);assert.equal(g.state.payouts.length,0);
 assert.equal(g.resolveDraw(a.id+1,'JACKPOT'),false);assert.equal(g.resolveDraw(a.id,'TOWER_STANDARD'),false);
 assert.equal(g.resolveDraw(a.id,'JACKPOT'),false);assert.equal(g.completeQualifier(a.id,2),true);g.tick(2.5);assert.equal(g.resolveDraw(a.id,'JACKPOT'),true);assert.equal(g.resolveDraw(a.id,'JACKPOT'),false);
 const copy=new Game(g.export());copy.cinematic=true;copy.skip();copy.skip();assert.equal(copy.state.payouts.length,1);assert.equal(copy.state.payouts[0].total,300);assert.equal(copy.state.jackpots,1);assert.equal(copy.state.diaryUnlocked,1);assert.equal(copy.state.wallet,100);
});
test('movies do not change normal rewards; diaries pause queued tickets and replay is not an award',()=>{
 const g=new Game(undefined,61);g.cinematic=true;g.enqueue('normal');g.tick(.1);const result=g.state.active!.result;
 const saved=g.export();const copy=new Game(saved);copy.cinematic=true;copy.tick(8.4);assert.equal(copy.state.active!.result,result);const payout=copy.state.payouts.length;copy.tick(.1);assert.equal(copy.state.payouts.length,payout);
 copy.skip();copy.state.theater={ticket:0,position:'center',journal:0,journalTime:0};copy.enqueue('normal');copy.tick(100);assert.equal(copy.state.active,null);assert.equal(copy.state.queue.length,1);assert.equal(copy.state.payouts.length,payout);
});
test('ball worlds restore the same pocket and all ten pockets are reachable',async()=>{
 await RAPIER.init();const rng=new Random(42),visited=new Set<number>();
 for(let i=0;i<100;i++){
  const plan=makePlan(()=>rng.next()),original=new PhysicalDraw(plan);
  while(original.elapsed<1.6)original.step(1/60);
  const restored=new PhysicalDraw(plan,structuredClone(original.export()));
  while(original.elapsed<24&&original.pocket===null)original.step(1/60);
  while(restored.elapsed<24&&restored.pocket===null)restored.step(1/60);
  assert.notEqual(original.pocket,null,`seed ${plan.seed}`);assert.equal(original.pocket,restored.pocket);assert.equal(original.result,restored.result);assert.ok(original.elapsed>=3.2);
  visited.add(original.pocket!);original.dispose();restored.dispose();
 }
 assert.equal(visited.size,10);
});
test('every story background and pose is deployed, with alpha sprite atlases',async()=>{
 const {existsSync,readFileSync}=await import('node:fs');const cuts=[...idle.flat(),...diaries.flatMap(d=>d.cuts),...Object.values(outcome).flat()];
 const backgrounds=new Set(cuts.map(c=>c.bg));assert.equal(backgrounds.size,9);
 for(const bg of backgrounds)assert.ok(existsSync(`public/events/${bg}.webp`));
 for(const who of ['nagi','mina','garo']){const file=readFileSync(`public/events/${who}.webp`);assert.equal(file.toString('ascii',0,4),'RIFF');assert.ok(file.includes(Buffer.from('ALPH')),'transparent sprite');}
});

test('each mini-ball owns one prepaid event; route choice and save cannot duplicate rewards',()=>{
 const g=new Game(undefined,721);g.cinematic=true;g.collectMiniBall();const normalRng=g.random[0].value,jpRng=g.random[2].value;
 assert.equal(g.state.payouts.length,1);assert.equal(g.state.payouts[0].total,10);assert.equal(g.state.queue[0].kind,'mini');g.tick(.1);const id=g.state.active!.id;
 assert.equal(g.chooseMiniRoute(id,3),false);assert.equal(g.chooseMiniRoute(id,1),true);assert.equal(g.chooseMiniRoute(id,0),false);
 const copy=new Game(g.export());copy.cinematic=true;assert.equal(copy.chooseMiniRoute(id,1),false);copy.skip();copy.skip();
 assert.deepEqual(copy.state.deliveryStamps,[0,1,0]);assert.equal(copy.state.payouts.length,1);assert.equal(copy.state.wallet,100);assert.equal(copy.state.won,0);assert.equal(copy.state.balls,0);
 assert.equal(copy.random[0].value,normalRng);assert.equal(copy.random[2].value,jpRng);
});
test('three stamps on one route open one station challenge using the requested normal table',()=>{
 const g=new Game(undefined,7);g.cinematic=true;
 for(let i=0;i<3;i++){g.collectMiniBall();g.tick(.1);assert.equal(g.chooseMiniRoute(g.state.active!.id,2),true);g.skip();}
 assert.deepEqual(g.state.deliveryStamps,[0,0,0]);assert.deepEqual(g.state.deliveryCompleted,[0,0,1]);assert.equal(g.state.queue.length,1);assert.equal(g.state.queue[0].kind,'station');assert.equal(g.state.queue[0].route,2);
 assert.equal(g.state.payouts.reduce((n,p)=>n+p.total,0),30);g.random[0].next=()=>0;g.tick(.1);assert.equal(g.state.active!.result,'NONE');g.skip();assert.equal(g.state.payouts.reduce((n,p)=>n+p.total,0),30);
});
test('mini events autoplay and skip retain the stamp; staged reel stops do not reroll',()=>{
 const g=new Game(undefined,2);g.cinematic=true;g.collectMiniBall();g.tick(.1);g.tick(5);assert.equal(g.state.active!.stampApplied,true);g.skip();assert.equal(g.state.deliveryStamps!.reduce((a,b)=>a+b,0),1);
 g.enqueue('normal');g.tick(.1);const a=g.state.active!,rng=g.random[0].value;
 g.advancePresentation(a.id);assert.equal(a.elapsed,2.4);g.advancePresentation(a.id);assert.equal(a.elapsed,4.2);g.advancePresentation(a.id);assert.equal(a.elapsed,8.4);g.tick(.01);
 assert.equal(g.random[0].value,rng);assert.equal(a.applied,true);
});
test('a saved two-ball JP never pays the route ball and settles exactly once on the final ball',async()=>{
 await RAPIER.init();const g=new Game(undefined,827);g.cinematic=true;g.enqueue('jpc');g.tick(5.4);const a=g.state.active!;
 const first=new PhysicalDraw(a.qualifier!.plan);while(first.pocket===null&&first.elapsed<24)first.step(1/60);assert.notEqual(first.pocket,null);
 a.qualifier!.drawSave=first.export();assert.equal(g.completeQualifier(a.id,first.pocket!),true);first.dispose();assert.equal(g.state.payouts.length,0);assert.equal(g.resolveDraw(a.id,'JACKPOT'),false);
 const copy=new Game(g.export());copy.cinematic=true;copy.tick(2.5);const b=copy.state.active!,plan={...b.plan!,seed:(b.plan!.seed+Math.imul(b.route!,2654435761))>>>0};
 const second=new PhysicalDraw(plan);while(second.pocket===null&&second.elapsed<24)second.step(1/60);assert.ok(second.result);b.drawSave=second.export();
 assert.equal(copy.resolveDraw(b.id,second.result!),true);assert.equal(copy.resolveDraw(b.id,second.result!),false);assert.equal(copy.state.payouts.length,1);assert.equal(copy.state.payouts[0].total,second.result==='JACKPOT'?300:second.result==='FIELD_30'?30:10);second.dispose();
 const restored=new Game(copy.export());restored.cinematic=true;restored.skip();assert.equal(restored.state.payouts.length,1);
});

test('reel presentation never shows a winning triple for NONE or changes the awarded result',async()=>{
 const {reelLabels}=await import('../src/events/challenge.ts');
 for(let id=1;id<=6;id++){const a={id,kind:'normal' as const,result:'NONE' as const,elapsed:9,applied:true};const labels=reelLabels(a);assert.equal(labels[0],labels[1]);assert.notEqual(labels[2],labels[0]);assert.equal(a.result,'NONE');}
 const win=reelLabels({id:9,kind:'normal',result:'JACKPOT_DIRECT',elapsed:9,applied:true});assert.deepEqual(win,['JP','JP','JP']);
});
