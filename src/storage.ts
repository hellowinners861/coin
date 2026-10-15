import { ENGINE_VERSION, SAVE_VERSION } from './config';
import type { GameState } from './game';
import type { PhysicsSave } from './physics';

export type SavedGame = { version:number; engine:string; savedAt:number; game:GameState; physics:PhysicsSave };
export class SaveStore {
  private db: IDBDatabase | null=null;
  async open() {
    return new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('coin-medal-pusher',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('saves');
      request.onsuccess=()=>{this.db=request.result;resolve();};
      request.onerror=()=>reject(request.error);
    });
  }
  async load():Promise<SavedGame|null> {
    if(!this.db)return null;
    return new Promise((resolve,reject)=>{
      const request=this.db!.transaction('saves').objectStore('saves').get('current');
      request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);
    });
  }
  save(value:SavedGame) {
    if(!this.db)return Promise.reject(new Error('保存領域を利用できません'));
    return new Promise<void>((resolve,reject)=>{
      const tx=this.db!.transaction('saves','readwrite');tx.objectStore('saves').put(value,'current');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }
  compatible(save:SavedGame) {
    if(!save||save.version!==SAVE_VERSION||save.engine!==ENGINE_VERSION||!save.game||!save.physics)return false;
    const {game,physics}=save;
    const vector=(value:{x:number;y:number;z:number}|undefined)=>!!value&&Number.isFinite(value.x+value.y+value.z);
    const counters=[game.wallet,game.won,game.paid,game.direct,game.gauge,game.balls,game.ballJobs,game.towerJobs,game.nextId];
    return counters.every(n=>Number.isSafeInteger(n)&&n>=0)&&game.gauge<30&&game.balls<3&&
      physics.world instanceof Uint8Array&&physics.world.length>0&&
      Array.isArray(physics.actors)&&physics.actors.every(a=>Number.isFinite(a.handle)&&vector(a.previous)&&vector(a.previousQ)&&Number.isFinite(a.previousQ.w))&&
      Array.isArray(game.random)&&game.random.length===4&&game.random.every(Number.isFinite)&&
      Array.isArray(game.queue)&&game.queue.every(t=>Number.isSafeInteger(t.id)&&['normal','jpc'].includes(t.kind))&&
      Array.isArray(game.payouts)&&game.payouts.every(p=>Number.isSafeInteger(p.remaining)&&p.remaining>0&&p.remaining<=p.total)&&
      Number.isFinite(physics.time+physics.angle+physics.targetAngle);
  }
}
