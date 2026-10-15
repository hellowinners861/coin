export class MachineAudio {
  context:AudioContext|null=null;
  muted=true;
  lastImpact=0;lastWin=0;
  unlock() { this.context??=new AudioContext();void this.context.resume(); }
  private tone(freq:number,length:number,volume:number,type:OscillatorType='sine',delay=0) {
    if(this.muted||!this.context||this.context.state!=='running')return;
    const now=this.context.currentTime+delay;
    const osc=this.context.createOscillator(),gain=this.context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,now);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(volume,now+.004);
    gain.gain.exponentialRampToValueAtTime(.0001,now+length);
    osc.connect(gain).connect(this.context.destination);osc.start(now);osc.stop(now+length+.01);
  }
  impact(force:number) {
    if(!this.context||this.context.currentTime-this.lastImpact<.08||force<.04)return;
    this.lastImpact=this.context.currentTime;
    this.tone(1800+Math.min(force,3)*600,.045,Math.min(.018,force*.008),'triangle');
  }
  play(type:string) {
    if(type==='insert') {this.tone(1350,.055,.022,'triangle');this.tone(2700,.04,.008);}
    else if(type==='win') {
      const now=this.context?.currentTime??0;if(now-this.lastWin<.07)return;this.lastWin=now;
      this.tone(1050,.10,.022);this.tone(1575,.12,.012,'sine',.025);
    } else if(type==='ball') {this.tone(660,.18,.025);this.tone(990,.24,.025,'sine',.1);}
    else if(type==='jackpot') [523,659,784,1047].forEach((f,i)=>this.tone(f,.6,.03,'sine',i*.1));
    else if(type==='tower') [392,523,659].forEach((f,i)=>this.tone(f,.35,.025,'sine',i*.09));
    else this.tone(784,.16,.02);
  }
}
