import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type Ticket } from '../src/game.ts';
import { NORMAL, JPC } from '../src/config.ts';

test('probability tables cover exactly 100 percent',()=>{
  assert.equal(NORMAL.reduce((n,r)=>n+r[1],0),100);
  assert.equal(JPC.reduce((n,r)=>n+r[1],0),100);
});
test('large simultaneous collections issue every ticket and preserve remainder',()=>{
  const g=new Game(undefined,12);g.state.gauge=24;g.collectCoins(71);
  assert.equal(g.state.queue.length,3);assert.equal(g.state.gauge,5);
  assert.equal(g.state.wallet,171);assert.equal(g.state.won,71);
});
test('direct credit is idempotent and never advances collection progress',()=>{
  const g=new Game(undefined,12);
  const ticket:Ticket={id:1,kind:'normal',result:'CREDIT_10',elapsed:1,applied:false};
  g.apply(ticket);g.apply(ticket);
  assert.equal(g.state.wallet,110);assert.equal(g.state.direct,10);
  assert.equal(g.state.gauge,0);assert.equal(g.state.won,0);
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
  Reflect.deleteProperty(saved,'bgm');Reflect.deleteProperty(saved,'refilled');
  const restored=new Game(saved);
  assert.equal(restored.state.wallet,0);assert.equal(restored.state.muted,true);
  assert.equal(restored.state.bgm,true);assert.equal(restored.state.refilled,0);
  assert.equal(restored.refillWallet(),true);
});
