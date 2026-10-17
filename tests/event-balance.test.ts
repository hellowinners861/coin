import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,Random,draw} from '../src/game.ts';
import {NORMAL} from '../src/config.ts';
import {makeRoutePlan,routeInfo,type RouteEffect} from '../src/events/jp.ts';
import {stationTables,revealTime,resultDuration,reelLabels} from '../src/events/challenge.ts';

test('route labels are independent of pocket index and all routes are equally likely before layout',()=>{
 const rng=new Random(1011),counts=Array.from({length:10},()=>({LIGHTHOUSE:0,SEA:0,WORKSHOP:0}));
 for(let i=0;i<9000;i++){const p=makeRoutePlan(()=>rng.next());assert.equal(p.labels.length,10);p.labels.forEach((l,k)=>counts[k][l]++);}
 for(const c of counts)for(const n of Object.values(c))assert.ok(n>2750&&n<3250);
});
test('every route grants its advertised benefit once and survives reload',()=>{
 for(const label of Object.keys(routeInfo) as RouteEffect[]){
  const g=new Game(undefined,132);g.cinematic=true;g.enqueue('jpc');g.tick(5.4);const a=g.state.active!,i=a.qualifier!.plan.labels.indexOf(label);
  assert.equal(g.completeQualifier(a.id,i),true);const r=a.refit!;
  assert.equal(a.route,routeInfo[label].route);assert.equal(r.slots,label==='LIGHTHOUSE'?2:1);assert.equal(r.maxBalls,label==='SEA'?4:3);assert.equal(r.shield,label==='WORKSHOP');
  const copy=new Game(g.export());assert.equal(copy.completeQualifier(a.id,i),false);assert.deepEqual(copy.state.active!.refit,r);
 }
 const g=new Game(undefined,92);g.cinematic=true;g.state.jpItems={lights:0,charts:0,shields:1};g.enqueue('jpc');g.tick(5.4);
 const a=g.state.active!,i=a.qualifier!.plan.labels.indexOf('WORKSHOP');g.completeQualifier(a.id,i);assert.equal(g.state.payouts[0].total,10);g.completeQualifier(a.id,i);assert.equal(g.state.payouts.length,1);
});
test('station probability boundaries are exhaustive, reward-only, and vary by route',()=>{
 for(const table of stationTables){let start=0;assert.equal(table.reduce((s,[,w])=>s+w,0),100);
  for(const [result,weight] of table){assert.notEqual(result,'NONE');assert.equal(draw({next:()=>start/100} as Random,table),result);assert.equal(draw({next:()=>(start+weight-.00001)/100} as Random,table),result);start+=weight;}
 }
 assert.deepEqual(NORMAL,[['NONE',20],['FIELD_5',20],['CREDIT_10',35],['BALL_1',18],['TOWER_STANDARD',4],['JPC_ENTRY',2],['JACKPOT_DIRECT',1]]);
});
test('ordinary misses and small wins finish promptly; special outcomes get longer scenes',()=>{
 const ticket=(result:any)=>({id:1,kind:'normal' as const,result,elapsed:10,applied:true});
 assert.equal(revealTime(ticket('NONE'))+resultDuration(ticket('NONE')),4);
 assert.ok(Math.abs(revealTime(ticket('CREDIT_10'))+resultDuration(ticket('CREDIT_10'))-5.8)<1e-9);
 assert.ok(revealTime(ticket('TOWER_STANDARD'))>revealTime(ticket('CREDIT_10')));
 assert.equal(new Set(reelLabels(ticket('NONE'))).size,3);
});
