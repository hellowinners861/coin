import test from 'node:test';
import assert from 'node:assert/strict';
import { draw, Game, type Ticket } from '../src/game.ts';
import { NORMAL, JPC } from '../src/config.ts';

test('probability tables cover exactly 100 percent',()=>{
  assert.equal(NORMAL.reduce((n,r)=>n+r[1],0),100);
  assert.equal(JPC.reduce((n,r)=>n+r[1],0),100);
});
test('all 100 equal-width draws match the requested normal and JP percentages',()=>{
  const g=new Game(undefined,12);
  const counts=(table:typeof NORMAL)=>{
    const tally:Record<string,number>={};
    for(let i=0;i<100;i++){
      g.random[0].next=()=>(i+.5)/100;
      const result=draw(g.random[0],table);tally[result]=(tally[result]??0)+1;
    }
    return tally;
  };
  assert.deepEqual(counts(NORMAL),{NONE:20,FIELD_5:20,CREDIT_10:35,BALL_1:18,TOWER_STANDARD:4,JPC_ENTRY:2,JACKPOT_DIRECT:1});
  assert.deepEqual(counts(JPC),{CREDIT_10:70,FIELD_30:20,JACKPOT:10});
});
test('a five-medal prize survives save and skip without rerolling or double payout',()=>{
  const g=new Game(undefined,12);
  g.state.active={id:1,kind:'normal',result:'FIELD_5',elapsed:.5,applied:false};
  const copy=new Game(g.export());copy.skip();copy.skip();
  assert.equal(copy.state.payouts.length,1);assert.equal(copy.state.payouts[0].remaining,5);
  assert.equal(copy.state.wallet,100);assert.equal(copy.state.won,0);assert.equal(copy.state.gauge,0);
  const resumed=new Game(copy.export());resumed.skip();
  assert.equal(resumed.state.payouts[0].remaining,5);
});
test('large simultaneous collections issue every ticket and preserve remainder',()=>{
  const g=new Game(undefined,12);g.state.gauge=24;g.collectCoins(71);
  assert.equal(g.state.queue.length,3);assert.equal(g.state.gauge,5);
  assert.equal(g.state.wallet,171);assert.equal(g.state.won,71);
});
test('10-medal prizes create one physical entitlement without direct credit',()=>{
  const g=new Game(undefined,12);
  const ticket:Ticket={id:1,kind:'normal',result:'CREDIT_10',elapsed:1,applied:false};
  g.apply(ticket);g.apply(ticket);
  assert.equal(g.state.wallet,100);assert.equal(g.state.direct,0);
  assert.equal(g.state.payouts.length,1);assert.equal(g.state.payouts[0].remaining,10);
  assert.equal(g.state.gauge,0);assert.equal(g.state.won,0);
});
test('mini balls pay ten onto the board without advancing normal balls or wins',()=>{
  const g=new Game(undefined,12);g.state.balls=2;
  g.collectMiniBall();
  assert.equal(g.state.wallet,100);assert.equal(g.state.won,0);assert.equal(g.state.gauge,0);
  assert.equal(g.state.balls,2);assert.equal(g.state.queue.length,1);assert.equal(g.state.queue[0].kind,'mini');
  assert.equal(g.state.payouts[0].remaining,10);assert.equal(g.state.miniBallsCollected,1);
  const copy=new Game(g.export());assert.equal(copy.state.payouts[0].remaining,10);
  assert.equal(copy.state.miniBallsCollected,1);
});
test('paid input replenishes mini balls independently and respects their cap',()=>{
  const g=new Game(undefined,12);
  for(let i=0;i<10;i++)g.spend(3,3);
  assert.equal(g.state.miniBallJobs,1);
  for(let i=0;i<10;i++)g.spend(3,6);
  assert.equal(g.state.miniBallJobs,1);
  g.collectCoins(30);g.refillWallet();assert.equal(g.state.miniBallJobs,1);
});
test('JP creates a physical payout entitlement, not wallet credit',()=>{
  const g=new Game(undefined,12);
  g.apply({id:1,kind:'jpc',result:'JACKPOT',elapsed:3,applied:false});
  assert.equal(g.state.wallet,100);assert.equal(g.state.payouts[0].remaining,300);
  assert.equal(g.state.jackpots,1);
});
test('ball collection preserves progress across direct JPC entries',()=>{
  const g=new Game(undefined,12);g.state.balls=2;g.collectBall();g.collectBall();
  g.apply({id:1,kind:'normal',result:'JPC_ENTRY',elapsed:3,applied:false});
  assert.equal(g.state.balls,1);assert.equal(g.state.queue.length,2);
  assert.ok(g.state.queue.every(t=>t.kind==='jpc'));
});
test('only paid insertions generate random-ball opportunities and cap suppresses draws',()=>{
  const g=new Game(undefined,12);let draws=0;g.random[1].next=()=>{draws++;return 0;};
  for(let i=0;i<10;i++)g.spend(0);
  assert.equal(draws,2);assert.equal(g.state.ballJobs,2);
  g.collectCoins(10);g.payout(10);assert.equal(draws,2);
  for(let i=0;i<5;i++)g.spend(1);
  assert.equal(draws,2);assert.equal(g.state.inputRemainder,0);
});
test('saving a resolved event does not reroll or award twice',()=>{
  const g=new Game(undefined,87);g.enqueue('normal');g.tick(.1);
  const result=g.state.active!.result;
  const restored=new Game(g.export());
  assert.equal(restored.state.active!.result,result);
  restored.skip();const state=restored.export();
  const resumed=new Game(state);const wallet=resumed.state.wallet;
  resumed.skip();assert.equal(resumed.state.wallet,wallet);
  assert.equal(resumed.state.active,null);
});
test('cosmetic/launch randomness cannot affect event outcomes',()=>{
  const a=new Game(undefined,99),b=new Game(undefined,99);
  for(let i=0;i<100;i++)a.random[3].next();
  a.enqueue('normal');b.enqueue('normal');a.tick(.01);b.tick(.01);
  assert.equal(a.state.active!.result,b.state.active!.result);
});


test('refill at zero is repeat-safe and does not count as a win or event',()=>{
  const g=new Game(undefined,12);g.state.wallet=0;g.state.gauge=17;
  g.state.payouts.push({id:7,total:30,remaining:12});g.state.balls=2;
  let saves=0;g.onDurableChange=()=>saves++;
  assert.equal(g.refillWallet(),true);assert.equal(g.refillWallet(),false);
  assert.equal(g.state.wallet,100);assert.equal(g.state.refilled,100);
  assert.equal(g.state.won,0);assert.equal(g.state.direct,0);assert.equal(g.state.paid,0);
  assert.equal(g.state.gauge,17);assert.equal(g.state.balls,2);
  assert.equal(g.state.payouts[0].remaining,12);assert.equal(saves,1);
  const copy=new Game(g.export());assert.equal(copy.state.wallet,100);assert.equal(copy.state.refilled,100);
  copy.state.wallet=0;assert.equal(copy.refillWallet(),true);assert.equal(copy.state.refilled,200);
});

test('older saves keep their wallet and mute preference when adding music and refill state',()=>{
  const g=new Game(undefined,12), saved=g.export();saved.wallet=0;saved.muted=true;
  Reflect.deleteProperty(saved,'bgm');Reflect.deleteProperty(saved,'refilled');Reflect.deleteProperty(saved,'batchSize');Reflect.deleteProperty(saved,'feedQueue');Reflect.deleteProperty(saved,'feedReadyAt');
  Reflect.deleteProperty(saved,'miniBallJobs');Reflect.deleteProperty(saved,'miniBallsCollected');
  const restored=new Game(saved);
  assert.equal(restored.state.wallet,0);assert.equal(restored.state.muted,true);
  assert.equal(restored.state.bgm,true);assert.equal(restored.state.refilled,0);assert.equal(restored.state.batchSize,1);assert.equal(restored.state.feedQueue,null);assert.equal(restored.state.feedReadyAt,0);
  assert.equal(restored.refillWallet(),true);
  assert.equal(restored.state.miniBallJobs,0);assert.equal(restored.state.miniBallsCollected,0);
});
