import { AUTO_WINDOW, FEED_INTERVAL, PUSHER_PERIOD, RAIL_TRAVEL_TIME } from './config';
import type { Game } from './game';
import type { Simulation } from './physics';

// Aim for the centre of the batch to land when the shelf is fully retracted.
// The same physical rail and launch velocity are used for every mode.
export function automaticLaunchPhase(count: 1 | 3) {
  return PUSHER_PERIOD - RAIL_TRAVEL_TIME - (count - 1) * FEED_INTERVAL / 2;
}

export class MedalFeed {
  automatic = false;
  private lastAutomaticCycle = -1;
  constructor(private game: Game, private sim: Pick<Simulation, 'time' | 'angle' | 'targetAngle' | 'insert'>) {
    // Reloading never starts spending automatically. Unlaunched automatic
    // medals are not charged; an accepted manual burst resumes normally.
    if(game.state.feedQueue?.automatic)game.state.feedQueue=null;
  }
  setAutomatic(enabled: boolean) {
    this.automatic=enabled&&this.game.state.wallet>0;
    if(!this.automatic&&this.game.state.feedQueue?.automatic) {
      this.game.state.feedQueue=null;this.game.onDurableChange();
    }
  }
  requestManual() {
    const s=this.game.state;
    if(this.automatic||s.feedQueue||s.wallet<1)return false;
    s.feedQueue={remaining:Math.min(s.batchSize,s.wallet),nextAt:this.sim.time,automatic:false,deadline:null};
    this.game.onDurableChange();return true;
  }
  tick() {
    const s=this.game.state,t=this.sim.time;
    if(s.wallet<1) {
      this.setAutomatic(false);
      if(s.feedQueue){s.feedQueue=null;this.game.onDurableChange();}
      return;
    }
    const cycle=Math.floor(t/PUSHER_PERIOD),phase=t-cycle*PUSHER_PERIOD;
    const launch=automaticLaunchPhase(s.batchSize);
    if(this.automatic&&!s.feedQueue&&cycle!==this.lastAutomaticCycle&&
      phase+1e-8>=launch&&phase<launch+AUTO_WINDOW&&Math.abs(this.sim.targetAngle-this.sim.angle)<.01) {
      this.lastAutomaticCycle=cycle;
      s.feedQueue={remaining:Math.min(s.batchSize,s.wallet),nextAt:t,automatic:true,
        deadline:cycle*PUSHER_PERIOD+launch+(s.batchSize-1)*FEED_INTERVAL+AUTO_WINDOW};
      this.game.onDurableChange();
    }
    const queue=s.feedQueue;
    if(!queue)return;
    if(queue.deadline!==null&&t>queue.deadline) {
      s.feedQueue=null;this.game.onDurableChange();return;
    }
    if(t+1e-8<Math.max(queue.nextAt,s.feedReadyAt)||!this.sim.insert())return;
    s.feedReadyAt=t+FEED_INTERVAL;
    queue.remaining--;queue.nextAt=t+FEED_INTERVAL;
    if(queue.remaining===0||s.wallet===0)s.feedQueue=null;
    if(s.wallet===0)this.setAutomatic(false);
    this.game.onDurableChange();
  }
}
