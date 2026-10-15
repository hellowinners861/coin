import { JPC, NORMAL, RESULT_LABELS, type Result } from './config';

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
export type Ticket = { id: number; kind: 'normal' | 'jpc'; result?: Result; elapsed: number; applied: boolean };
export type Payout = { id: number; remaining: number; total: number };
export type GameState = {
  wallet: number; won: number; paid: number; direct: number; gauge: number; balls: number;
  inputRemainder: number; ballJobs: number; towerJobs: number; jackpots: number;
  queue: Ticket[]; active: Ticket | null; payouts: Payout[]; nextId: number;
  random: number[]; muted: boolean; vibration: boolean; quality: 'high' | 'low';
};
export class Game {
  state: GameState;
  random: Random[];
  onChange: () => void = () => {};
  onSound: (type: string) => void = () => {};
  onDurableChange: () => void = () => {};
  constructor(saved?: GameState, seed = Date.now()) {
    this.state = saved ?? {
      wallet: 100, won: 0, paid: 0, direct: 0, gauge: 0, balls: 0,
      inputRemainder: 0, ballJobs: 0, towerJobs: 0, jackpots: 0,
      queue: [], active: null, payouts: [], nextId: 1,
      random: [seed >>> 0, (seed ^ 0x1825) >>> 0, (seed ^ 0x9e3779b9) >>> 0, (seed ^ 0xaf5c) >>> 0],
      muted: true, vibration: true, quality: 'high',
    };
    this.random = this.state.random.map(n => new Random(n));
  }
  export(): GameState {
    this.state.random = this.random.map(r => r.value);
    return structuredClone(this.state);
  }
  enqueue(kind: Ticket['kind']) {
    this.state.queue.push({ id: this.state.nextId++, kind, elapsed: 0, applied: false });
  }
  spend(liveBalls: number): boolean {
    const s = this.state;
    if (s.wallet < 1) return false;
    s.wallet--; s.paid++; s.inputRemainder++;
    if (s.inputRemainder === 5) {
      s.inputRemainder = 0;
      if (liveBalls + s.ballJobs < 3 && this.random[1].next() < 0.2) s.ballJobs++;
    }
    this.onSound('insert'); this.onChange();
    return true;
  }
  collectCoin() { this.collectCoins(1); }
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
  apply(ticket: Ticket) {
    if (ticket.applied || !ticket.result) return;
    const s = this.state;
    ticket.applied = true;
    switch (ticket.result) {
      case 'CREDIT_10': s.wallet += 10; s.direct += 10; break;
      case 'BALL_1': s.ballJobs++; break;
      case 'TOWER_STANDARD': s.towerJobs++; break;
      case 'JPC_ENTRY': this.enqueue('jpc'); break;
      case 'FIELD_30': this.payout(30); break;
      case 'JACKPOT': case 'JACKPOT_DIRECT': s.jackpots++; this.payout(300); break;
    }
    this.onSound(ticket.result.includes('JACKPOT') ? 'jackpot' : 'event');
  }
  payout(count: number) {
    this.state.payouts.push({ id: this.state.nextId++, remaining: count, total: count });
  }
  tick(dt: number) {
    const s = this.state;
    if (!s.active && s.queue.length) {
      const ticket = s.queue.shift()!;
      ticket.result = draw(this.random[ticket.kind === 'normal' ? 0 : 2], ticket.kind === 'normal' ? NORMAL : JPC);
      s.active = ticket;
      this.onDurableChange(); this.onChange();
    }
    const a = s.active;
    if (!a) return;
    a.elapsed += dt;
    const reveal = a.kind === 'normal' ? 1.0 : 2.0;
    if (a.elapsed >= reveal && !a.applied) {
      this.apply(a); this.onDurableChange(); this.onChange();
    }
    if (a.elapsed > reveal + 2.4) { s.active = null; this.onDurableChange(); this.onChange(); }
  }
  skip() {
    if (!this.state.active) return;
    this.apply(this.state.active);
    this.state.active = null;
    this.onDurableChange(); this.onChange();
  }
  activeLabel() {
    const a = this.state.active;
    if (!a) return null;
    if (!a.applied) return { title: a.kind === 'normal' ? 'チャンス抽選' : 'ジャックポット抽選', detail: '結果を待っています…', revealing: true };
    return { ...RESULT_LABELS[a.result!], revealing: false };
  }
}
