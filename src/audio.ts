export class MachineAudio {
  context:AudioContext|null=null;
  private silent=true;
  private musicEnabled=true;
  private playing=false;
  private nextMusicTime=0;
  private musicStep=0;
  private musicVoices=new Map<OscillatorNode,GainNode>();
  get muted() {return this.silent;}
  set muted(value:boolean) {this.silent=value;if(value)this.stopMusic();}
  get bgm() {return this.musicEnabled;}
  set bgm(value:boolean) {this.musicEnabled=value;if(!value)this.stopMusic();}
  setPlaying(value:boolean) {this.playing=value;if(!value)this.stopMusic();}
  private stopMusic() {
    for(const [voice,gain] of this.musicVoices) {voice.onended=null;voice.stop();voice.disconnect();gain.disconnect();}
    this.musicVoices.clear();this.nextMusicTime=0;
  }
  // Original 8-bar loop at 100 BPM: soft keys, warm chords and a quiet bass.
  // Schedule on the audio clock, ahead of rendering, to avoid rhythmic jitter.
  update() {
    const ctx=this.context;
    if(!this.playing||this.muted||!this.bgm||!ctx||ctx.state!=='running')return;
    if(this.nextMusicTime<ctx.currentTime) this.nextMusicTime=ctx.currentTime+.04;
    const melody=[76,0,79,0,83,81,79,0, 74,0,78,0,81,79,78,0,
      72,0,76,0,79,78,76,0, 71,0,74,0,78,76,74,0,
      76,79,83,0,86,83,81,79, 74,78,81,0,83,81,79,78,
      72,76,79,0,81,79,76,74, 71,74,78,0,79,0,0,0];
    const chords=[[48,55,59,64],[50,57,60,66],[45,52,55,60],[43,50,53,59]];
    const frequency=(midi:number)=>440*2**((midi-69)/12);
    while(this.nextMusicTime<ctx.currentTime+.18) {
      const step=this.musicStep%64, beat=step%8, chord=chords[Math.floor(step/8)%4];
      if(melody[step]) this.musicNote(frequency(melody[step]),this.nextMusicTime,.48,.014,'triangle');
      if(beat===0) for(const note of chord.slice(1))this.musicNote(frequency(note),this.nextMusicTime,2.1,.005,'sine');
      if(beat===0||beat===4)this.musicNote(frequency(chord[0]-(beat===0?12:0)),this.nextMusicTime,.65,.018,'sine');
      this.musicStep++;this.nextMusicTime+=.3;
    }
  }
  private musicNote(freq:number,at:number,duration:number,volume:number,type:OscillatorType) {
    const ctx=this.context!,osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq,at);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain).connect(ctx.destination);this.musicVoices.set(osc,gain);
    osc.onended=()=>{this.musicVoices.delete(osc);osc.disconnect();gain.disconnect();};
    osc.start(at);osc.stop(at+duration+.02);
  }
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
