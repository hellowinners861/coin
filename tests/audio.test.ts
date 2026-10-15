import test from 'node:test';
import assert from 'node:assert/strict';
import { MachineAudio } from '../src/audio.ts';

function audioHarness() {
  const oscillators:{stopped:boolean; disconnected:boolean}[]=[];
  const parameter={setValueAtTime(){},exponentialRampToValueAtTime(){}};
  const ctx={
    currentTime:0,state:'running',destination:{},
    createOscillator(){
      const oscillator={frequency:parameter,type:'sine',onended:null,
        stopped:false,disconnected:false,start(){},stop(){this.stopped=true;},
        disconnect(){this.disconnected=true;},connect(node:unknown){return node;}};
      oscillators.push(oscillator);return oscillator;
    },
    createGain(){return {gain:parameter,connect(){},disconnect(){}};},
  };
  const audio=new MachineAudio();audio.context=ctx as unknown as AudioContext;
  return {audio,ctx,oscillators};
}

test('BGM only schedules during active unmuted play and stops on pause',()=>{
  const {audio,ctx,oscillators}=audioHarness();
  audio.update();assert.equal(oscillators.length,0);
  audio.setPlaying(true);audio.update();assert.equal(oscillators.length,0);
  audio.muted=false;audio.update();assert.ok(oscillators.length>0);
  const first=oscillators.length;audio.update();assert.equal(oscillators.length,first);
  ctx.currentTime=.4;audio.update();ctx.currentTime=.7;audio.update();assert.ok(oscillators.length>first);
  audio.setPlaying(false);assert.ok(oscillators.every(o=>o.stopped&&o.disconnected));
  const paused=oscillators.length;ctx.currentTime=1;audio.update();assert.equal(oscillators.length,paused);
});

test('turning BGM off preserves effects and master mute stops scheduled music',()=>{
  const {audio,ctx,oscillators}=audioHarness();audio.muted=false;audio.setPlaying(true);audio.update();
  audio.bgm=false;assert.ok(oscillators.every(o=>o.disconnected));
  const count=oscillators.length;ctx.currentTime=.4;audio.update();assert.equal(oscillators.length,count);
  audio.play('insert');assert.ok(oscillators.length>count);
  audio.bgm=true;audio.update();const before=oscillators.length;
  audio.muted=true;ctx.currentTime=1;audio.update();audio.play('insert');assert.equal(oscillators.length,before);
  audio.setPlaying(false); // Repeated stops must be safe.
});
