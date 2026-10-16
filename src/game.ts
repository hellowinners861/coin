import { revealTime, stops } from './events/challenge';
import { makePlan, type DrawPlan, type DrawSnapshot } from './events/draw';
import { JPC, MINI_BALL_LIMIT, NORMAL, RESULT_LABELS, type Result } from './config';
import { makeUpgradePlan,REFIT_CHOICE_SECONDS,REFIT_BRIDGE_SECONDS,type JPItems,type JPRefit,upgradeInfo } from './events/jp';

export class Random {
  constructor(public value: number) { this.value >>>= 0; }
  next() {
    let n = this.value += 0x6D2B79F5;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    this.value >>>= 0;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  }
}
export function draw(rng: Random, table: readonly [Result, number][]): Result {
  let roll = rng.next() * 100;
  for (const [value, weight] of table) { roll -= weight; if (roll < 0) return value; }
  throw new Error('Invalid probability table');
}
export type Ticket = { id: number; kind: 'normal' | 'jpc' | 'mini' | 'station'; result?: Result; elapsed: number; applied: boolean; physical?: boolean; plan?: DrawPlan; drawSave?: DrawSnapshot; refit?:JPRefit; resolvedAt?: number; route?:number; stampApplied?:boolean; routeCompleted?:boolean; kitGranted?:boolean; qualifier?: {plan:DrawPlan; drawSave?:DrawSnapshot; pocket?:number; resolvedAt?:number} };
export type Payout = { id: number; remaining: number; total: number };
export type FeedQueue = { remaining: number; nextAt: number; automatic: boolean; deadline: number | null };
export type GameState = {
  deliveryStamps?:number[]; deliveryCompleted?:number[];
  jpItems?:JPItems; jpFailures?:number;
  diaryUnlocked?: number; diaryRead?: number; theater?: { ticket: number; position: 'center'|'upper'; drawUpper?: boolean; boardResumed?:boolean; journal: number|null; journalTime: number };
  wallet: number; won: number; paid: number; direct: number; gauge: number; balls: number;
  inputRemainder: number; ballJobs: number; towerJobs: number; jackpots: number;
  miniBallJobs: number; miniBallsCollected: number;
  queue: Ticket[]; active: Ticket | null; payouts: Payout[]; nextId: number;
  random: number[]; muted: boolean; bgm: boolean; refilled: number; vibration: boolean; quality: 'high' | 'low';
  batchSize: 1 | 3; feedQueue: FeedQueue | null; feedReadyAt: number;
};
export class Game {
  cinematic=false;
  state: GameState;
  random: Random[];
  onChange: () => void = () => {};
  onSound: (type: string) => void = () => {};
  onDurableChange: () => void = () => {};
  constructor(saved?: GameState, seed = Date.now()) {
    this.state = saved ? { ...saved, bgm: saved.bgm ?? true, refilled: saved.refilled ?? 0,
      miniBallJobs: saved.miniBallJobs ?? 0, miniBallsCollected: saved.miniBallsCollected ?? 0,
      batchSize: saved.batchSize === 3 ? 3 : 1, feedQueue: saved.feedQueue ?? null, feedReadyAt: saved.feedReadyAt ?? 0 } : {
      wallet: 100, won: 0, paid: 0, direct: 0, gauge: 0, balls: 0,
      inputRemainder: 0, ballJobs: 0, towerJobs: 0, jackpots: 0,
      miniBallJobs: 0, miniBallsCollected: 0,
      queue: [], active: null, payouts: [], nextId: 1,
      random: [seed >>> 0, (seed ^ 0x1825) >>> 0, (seed ^ 0x9e3779b9) >>> 0, (seed ^ 0xaf5c) >>> 0],
      muted: true, bgm: true, refilled: 0, vibration: true, quality: 'high',
      batchSize: 1, feedQueue: null, feedReadyAt: 0,
    };
    this.random = this.state.random.map(n => new Random(n));
  }
  export(): GameState {
    this.state.random = this.random.map(r => r.value);
    return structuredClone(this.state);
  }
  enqueue(kind: Ticket['kind'],route?:number) {
    this.state.queue.push({ id: this.state.nextId++, kind, elapsed: 0, applied: false,...(route===undefined?{}:{route}) });
  }
  spend(liveBalls: number, liveMiniBalls = 0): boolean {
    const s = this.state;
    if (s.wallet < 1) return false;
    s.wallet--; s.paid++; s.inputRemainder++;
    if (s.paid % 10 === 0 && liveMiniBalls + s.miniBallJobs < MINI_BALL_LIMIT) s.miniBallJobs++;
    if (s.inputRemainder === 5) {
      s.inputRemainder = 0;
      if (liveBalls + s.ballJobs < 3 && this.random[1].next() < 0.2) s.ballJobs++;
    }
    this.onSound('insert'); this.onChange();
    return true;
  }
  collectCoin() { this.collectCoins(1); }
  refillWallet() {
    if (this.state.wallet !== 0) return false;
    this.state.wallet += 100;
    this.state.refilled += 100;
    this.onChange(); this.onDurableChange();
    return true;
  }
  collectCoins(count: number) {
    const s = this.state;
    s.wallet += count; s.won += count; s.gauge += count;
    while (s.gauge >= 30) { s.gauge -= 30; this.enqueue('normal'); }
    this.onSound('win'); this.onChange();
  }
  collectBall() {
    const s = this.state; s.balls++;
    if (s.balls >= 3) { s.balls -= 3; this.enqueue('jpc'); }
    this.onSound('ball'); this.onChange(); this.onDurableChange();
  }
  collectMiniBall() {
    this.state.miniBallsCollected++;
    this.payout(10);
    this.state.queue.push({id:this.state.nextId++,kind:'mini',result:'CREDIT_10',elapsed:0,applied:true});
    this.onSound('ball'); this.onChange(); this.onDurableChange();
  }
  chooseMiniRoute(id:number,route:number){
    const a=this.state.active;if(!a||a.id!==id||a.kind!=='mini'||a.stampApplied||!Number.isInteger(route)||route<0||route>2)return false;
    const stamps=this.state.deliveryStamps??=[0,0,0],completed=this.state.deliveryCompleted??=[0,0,0];
    a.route=route;a.stampApplied=true;a.resolvedAt=a.elapsed;stamps[route]++;
    if(stamps[route]>=3){
      stamps[route]-=3;completed[route]++;a.routeCompleted=true;this.enqueue('station',route);
      const kit=this.state.jpItems??={lights:0,charts:0,shields:0};
      a.kitGranted=route===0?kit.lights<2:route===1?kit.charts<1:kit.shields<1;
      if(route===0)kit.lights=Math.min(2,kit.lights+1);
      else if(route===1)kit.charts=1;else kit.shields=1;
    }
    this.onSound('event');this.onDurableChange();this.onChange();return true;
  }
  private defaultMiniRoute(){const stamps=this.state.deliveryStamps??[0,0,0];return stamps.indexOf(Math.max(...stamps));}
  advancePresentation(id:number){
    const a=this.state.active;if(!a||a.id!==id||a.physical||a.kind==='mini'||a.applied)return;
    const next=stops(a).find(t=>t>a.elapsed+.01);if(next!==undefined){a.elapsed=next;this.onSound('event');}this.onDurableChange();
  }
  completeQualifier(id:number,pocket:number){
    const a=this.state.active;if(!a?.qualifier||a.id!==id||a.qualifier.pocket!==undefined||!Number.isInteger(pocket)||pocket<0||pocket>9)return false;
    a.qualifier.pocket=pocket;a.qualifier.resolvedAt=a.elapsed;a.route=pocket%3;this.onSound('event');
    this.onDurableChange();this.onChange();return true;
  }
  private beginUpgrade(a:Ticket){
    const r=a.refit!;r.attempts.push({plan:makeUpgradePlan(()=>this.random[2].next())});r.phase='refit';
    delete r.decisionAt;
  }
  resolveUpgrade(id:number,pocket:number){
    const a=this.state.active,r=a?.refit,attempt=r?.attempts.at(-1);
    if(!a||a.id!==id||a.applied||!r||r.phase!=='refit'||!attempt||attempt.pocket!==undefined||!Number.isInteger(pocket)||pocket<0||pocket>9)return false;
    attempt.pocket=pocket;attempt.resolvedAt=a.elapsed;
    const effect=attempt.plan.labels[pocket];r.who=upgradeInfo[effect].who;
    if(effect==='LIGHT'||effect==='BEACON'){
      const before=r.slots;r.slots=Math.min(5,r.slots+(effect==='LIGHT'?1:2));
      r.message=r.slots===before?'灯台は全灯！ JPは5マスのままだよ。':`灯りがついた！ JP ${before} → ${r.slots}マス！`;
    }else if(effect==='WIND'){
      if(r.shield){r.shield=false;r.who='garo';r.message='補強が効いた。JPマスは守ったぞ。';}
      else{const before=r.slots;r.slots=Math.max(1,r.slots-1);r.message=before===1?'強い風！ でも最後のJPマスは消えないよ。':`突風だ！ JP ${before} → ${r.slots}マス。`;}
    }else if(effect==='SHIELD'){r.message=r.shield?'補強は万全。盾は1個まで持てるぞ。':'補強した。次の突風を1回防ぐぞ。';r.shield=true;}
    else if(effect==='CARGO'){this.payout(10);r.message='積荷を発見！ 10枚を左から払い出すよ。';}
    else r.message='準備完了！ この灯りで出航しよう。';
    r.phase='choice';r.decisionAt=a.elapsed;
    if(effect==='DEPART'||r.attempts.length>=r.maxBalls)this.depart(a);
    this.onSound('event');this.onDurableChange();this.onChange();return true;
  }
  chooseRefit(id:number,keepGoing:boolean){
    const a=this.state.active,r=a?.refit;
    if(!a||a.id!==id||a.applied||!r||r.phase!=='choice')return false;
    if(keepGoing&&r.attempts.length<r.maxBalls)this.beginUpgrade(a);else this.depart(a);
    this.onDurableChange();this.onChange();return true;
  }
  private depart(a:Ticket){
    const r=a.refit!;r.phase='final';r.finalAt=a.elapsed+REFIT_BRIDGE_SECONDS;
    // Mint and freeze the final labels before launching the final ball.
    a.plan=makePlan(()=>this.random[2].next(),r.slots);delete a.drawSave;
  }
  apply(ticket: Ticket) {
    if (ticket.applied || !ticket.result) return;
    const s = this.state;
    ticket.applied = true;
    switch (ticket.result) {
      case 'FIELD_5': this.payout(5); break;
      case 'CREDIT_10': this.payout(10); break;
      case 'BALL_1': s.ballJobs++; break;
      case 'TOWER_STANDARD': s.towerJobs++; break;
      case 'JPC_ENTRY': this.enqueue('jpc'); break;
      case 'FIELD_30': this.payout(30); break;
      case 'JACKPOT': case 'JACKPOT_DIRECT': s.jackpots++; s.jpFailures=0;s.diaryUnlocked=Math.min(3,(s.diaryUnlocked??0)+1); this.payout(300); break;
    }
    this.onSound(ticket.result.includes('JACKPOT') ? 'jackpot' : 'event');
  }
  payout(count: number) {
    this.state.payouts.push({ id: this.state.nextId++, remaining: count, total: count });
  }
  tick(dt: number) {
    const s = this.state;
    if(this.cinematic&&s.theater?.journal!==null&&s.theater?.journal!==undefined)return;
    if (!s.active && s.queue.length) {
      const ticket = s.queue.shift()!;
      if(this.cinematic&&ticket.kind==='jpc'){
        ticket.physical=true;ticket.plan=makePlan(()=>this.random[2].next());ticket.qualifier={plan:makePlan(()=>this.random[2].next())};
        const kit=s.jpItems??{lights:0,charts:0,shields:0},rescue=(s.jpFailures??0)>=3;
        ticket.refit={slots:1+kit.lights+(rescue?1:0),shield:kit.shields>0,maxBalls:3+kit.charts,attempts:[],phase:'refit',message:'灯台をともして、特別便の準備をしよう。',who:'nagi'};
        s.jpItems={lights:0,charts:0,shields:0};if(rescue)s.jpFailures=0;
      }
      else if(ticket.kind!=='mini')ticket.result = draw(this.random[ticket.kind === 'jpc' ? 2 : 0], ticket.kind === 'jpc' ? JPC : NORMAL);
      s.active = ticket;
      this.onDurableChange(); this.onChange();
    }
    const a = s.active;
    if (!a) return;
    a.elapsed += dt;
    if(a.kind==='mini'){
      if(!a.stampApplied&&a.elapsed>=(this.cinematic?5:.5))this.chooseMiniRoute(a.id,this.defaultMiniRoute());
      if(a.stampApplied&&a.elapsed>(a.resolvedAt??a.elapsed)+(this.cinematic?2.4:.5)){s.active=null;this.onDurableChange();}
      return;
    }
    if(a.physical){
      const r=a.refit;
      if(!a.applied&&r){
        if(r.phase==='refit'&&!r.attempts.length&&a.qualifier?.pocket!==undefined&&a.elapsed>=(a.qualifier.resolvedAt??a.elapsed)+REFIT_BRIDGE_SECONDS){this.beginUpgrade(a);this.onDurableChange();}
        if(r.phase==='choice'&&a.elapsed>=(r.decisionAt??a.elapsed)+REFIT_CHOICE_SECONDS)this.chooseRefit(a.id,false);
      }
      if(a.applied&&a.elapsed>(a.resolvedAt??a.elapsed)+5){s.active=null;this.onDurableChange();}return;
    }
    const reveal = this.cinematic ? revealTime(a) : a.kind === 'normal' ? 1.0 : 2.0;
    if (a.elapsed >= reveal && !a.applied) {
      this.apply(a); this.onDurableChange(); this.onChange();
    }
    if (a.elapsed > reveal + (this.cinematic ? 4.8 : 2.4)) { s.active = null; this.onDurableChange(); this.onChange(); }
  }
  resolveDraw(id:number,result:Result){
    const a=this.state.active;
    if(!a||a.id!==id||!a.physical||a.applied||(a.qualifier&&(a.qualifier.pocket===undefined||a.elapsed<(a.qualifier.resolvedAt??a.elapsed)+2.4))||(a.refit&&(a.refit.phase!=='final'||a.elapsed<(a.refit.finalAt??Infinity)))||!['CREDIT_10','FIELD_30','JACKPOT'].includes(result))return false;
    if(a.refit)this.state.jpFailures=result==='JACKPOT'?0:Math.min(3,(this.state.jpFailures??0)+1);
    a.result=result;a.resolvedAt=a.elapsed;this.apply(a);this.onDurableChange();this.onChange();return true;
  }
  skip() {
    if (!this.state.active) return;
    if(this.state.active.kind==='mini'){if(!this.state.active.stampApplied)this.chooseMiniRoute(this.state.active.id,this.defaultMiniRoute());this.state.active=null;this.onDurableChange();this.onChange();return;}
    if(this.state.active.physical&&!this.state.active.applied){this.state.active.elapsed=Math.max(5.4,this.state.active.elapsed);return;}
    this.apply(this.state.active);
    this.state.active = null;
    this.onDurableChange(); this.onChange();
  }
  activeLabel() {
    const a = this.state.active;
    if (!a) return null;
    if (!a.applied) return { title: a.kind === 'mini'?'小包開封':a.kind==='station'?'航路チャレンジ':a.kind === 'normal' ? 'チャンス抽選' : 'ジャックポット抽選', detail: '結果を待っています…', revealing: true };
    return { ...RESULT_LABELS[a.result!], revealing: false };
  }
}
