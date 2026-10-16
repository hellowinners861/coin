import { Game } from '../game';
import { RESULT_LABELS } from '../config';
import { PhysicalDraw } from './draw';
import { DrawView } from './draw-view';
import { at,diaries,idle,intro,jpIntro,names,outcome,type Cut,type Character } from './scripts';
import './theater.css';
const asset=(name:string)=>new URL(`events/${name}.webp`,document.baseURI).href;
const positions={normal:'0% 0%',surprise:'100% 0%',joy:'0% 100%',sad:'100% 100%'};
export class Theater {
 root:HTMLElement;story:HTMLElement;drawWindow:HTMLElement;surface:HTMLElement;
 private actors:Record<Character,HTMLElement>;private lastCut='';private time=0;private lastTicket=0;private draw?:PhysicalDraw;private drawView?:DrawView;
 private flip?:{who:Character;time:number;cut:Cut;swapped:boolean};private previousMini=0;
 private get ui(){return this.game.state.theater!;}
 constructor(public host:HTMLElement,public game:Game){
  this.root=document.createElement('div');this.root.className='theater';this.root.innerHTML=`
   <section class="story-window upper" aria-label="港の郵便局の物語">
    <header class="movie-bar"><span class="movie-title">港の郵便局</span><div><button type="button" data-action="move">大きく ↓</button><button type="button" data-action="skip" hidden>演出を閉じる</button></div></header>
    <div class="story-picture"><div class="story-backdrop"></div><div class="cast" aria-hidden="true">${(['nagi','mina','garo'] as Character[]).map(w=>`<div class="paper-actor ${w}" data-who="${w}"><div class="paper-art"></div></div>`).join('')}</div><div class="speech" aria-live="polite"><b></b><span></span></div><div class="result-stamp" role="status"></div></div>
    <div class="story-note">上にスワイプで縮小・下にスワイプで拡大</div>
   </section>
   <section class="draw-window" aria-label="特別便のボール抽選" hidden><header class="movie-bar"><span>特別便のドック</span><button type="button" data-action="draw-move">小さく ↑</button></header><div class="draw-surface" role="img" aria-label="10個の穴と白い抽選球。球が入った穴の報酬を獲得"></div><div class="draw-note" aria-live="polite"></div><button type="button" class="retry-draw" hidden>球を入れ直す</button></section>
   <button type="button" class="resume-board" hidden>盤面を再開</button><div class="mini-letter" role="status" hidden>ミナ：小さな便、到着！<br>10枚を左から払い出します</div>`;
  host.append(this.root);this.story=this.root.querySelector('.story-window')!;this.drawWindow=this.root.querySelector('.draw-window')!;this.surface=this.root.querySelector('.draw-surface')!;
  this.actors={} as Record<Character,HTMLElement>;
  for(const who of ['nagi','mina','garo'] as Character[]){const el=this.root.querySelector<HTMLElement>(`[data-who=${who}]`)!;this.actors[who]=el;el.querySelector<HTMLElement>('.paper-art')!.style.backgroundImage=`url("${asset(who)}")`;}
  this.bind(game);
  this.root.querySelector('[data-action=move]')!.addEventListener('click',()=>this.move(this.ui.position==='center'?'upper':'center'));
  this.root.querySelector('[data-action=draw-move]')!.addEventListener('click',()=>{this.drawWindow.classList.toggle('upper');this.ui.position='upper';this.changed();});
  this.root.querySelector('[data-action=skip]')!.addEventListener('click',()=>{
   if(this.ui.journal!==null)this.finishJournal();else this.game.skip();this.changed();
  });
  this.root.querySelector('.resume-board')!.addEventListener('click',()=>{this.root.querySelector('.resume-board')!.setAttribute('hidden','');this.drawWindow.classList.add('resumed');this.changed();});
  this.root.querySelector('.retry-draw')!.addEventListener('click',()=>this.retry());
  for(const win of [this.story,this.drawWindow]){
   let y=0,x=0,swiping=false;win.addEventListener('pointerdown',e=>{e.stopPropagation();swiping=false;if((e.target as HTMLElement).closest('button'))return;swiping=true;x=e.clientX;y=e.clientY;win.setPointerCapture(e.pointerId);});
   win.addEventListener('pointerup',e=>{e.stopPropagation();if(!swiping)return;swiping=false;const dy=e.clientY-y;if(Math.abs(dy)<48||Math.abs(dy)<Math.abs(e.clientX-x)*1.35)return;if(win===this.story)this.move(dy<0?'upper':'center');else{this.drawWindow.classList.toggle('upper',dy<0);this.ui.position='upper';this.changed();}});
   win.addEventListener('pointercancel',()=>{swiping=false;});
  }
  new ResizeObserver(()=>this.layout()).observe(host);
  for(const id of ['bg01','bg02','nagi','mina','garo']){const img=new Image();img.src=asset(id);}
 }
 bind(game:Game){this.drawView?.dispose();this.draw?.dispose();this.draw=undefined;this.drawView=undefined;this.game=game;game.cinematic=true;game.state.theater??={ticket:0,position:'upper',journal:null,journalTime:0};this.lastTicket=this.ui.ticket;this.previousMini=game.state.miniBallsCollected;this.lastCut='';this.drawWindow.classList.toggle('upper',!!this.ui.drawUpper);this.drawWindow.classList.toggle('resumed',!!this.ui.boardResumed);}
 private changed(){this.ui.drawUpper=this.drawWindow.classList.contains('upper');this.ui.boardResumed=this.drawWindow.classList.contains('resumed');this.game.onDurableChange();this.layout();}
 private move(position:'center'|'upper'){this.ui.position=position;if(position==='center')this.drawWindow.classList.add('upper');this.changed();}
 get boardBlocked(){return (this.ui.position==='center'&&(!!this.game.state.active||this.ui.journal!==null))||(!this.drawWindow.hidden&&!this.drawWindow.classList.contains('upper'))||(!this.drawWindow.hidden&&this.drawWindow.classList.contains('upper')&&!this.drawWindow.classList.contains('resumed'));}
 private layout(){
  const physical=!!this.drawView;this.story.classList.toggle('upper',this.ui.position==='upper');
  this.story.classList.toggle('has-draw',physical);this.drawWindow.hidden=!physical;
  if(physical&&this.ui.position==='center')this.drawWindow.classList.add('upper');
  if(physical&&this.drawWindow.classList.contains('upper')&&this.ui.position==='upper')this.story.classList.add('compact');else this.story.classList.remove('compact');
  this.root.querySelector<HTMLElement>('.resume-board')!.hidden=!(physical&&this.drawWindow.classList.contains('upper')&&this.ui.position==='upper'&&!this.drawWindow.classList.contains('resumed'));
  this.root.querySelector('[data-action=move]')!.textContent=this.ui.position==='center'?'小さく ↑':'大きく ↓';
  // Both windows live in a dedicated grid row above the board, in every mode.
  this.host.closest('.stage')!.classList.toggle('event-expanded',this.ui.position==='center'||(physical&&!this.drawWindow.classList.contains('upper')));
  const height=Math.max(48,this.host.clientHeight-16),width=Math.max(1,this.host.clientWidth-16);
  const storyShare=physical?(this.ui.position==='center'?.65:this.drawWindow.classList.contains('upper')?.5:.35):1;
  const available=physical?Math.max(1,width-8):width;
  const storyWidth=Math.max(1,Math.min(available*storyShare,Math.max(1,height-44)*16/9));
  const drawExtra=(this.drawWindow.classList.contains('upper')?44:84)+(this.root.querySelector<HTMLElement>('.retry-draw')!.hidden?0:44);
  const drawWidth=Math.max(1,Math.min(available*(1-storyShare),Math.max(1,height-drawExtra)*1.45));
  this.story.style.width=`${storyWidth}px`;this.story.style.height=`${storyWidth*9/16+44}px`;
  this.drawWindow.style.width=`${drawWidth}px`;this.drawWindow.style.height=`${drawWidth/1.45+drawExtra}px`;
  this.root.querySelector('[data-action=draw-move]')!.textContent=this.drawWindow.classList.contains('upper')?'大きく ↓':'小さく ↑';
  this.root.querySelector<HTMLButtonElement>('[data-action=skip]')!.hidden=!this.game.state.active&&this.ui.journal===null;
  this.root.querySelector('[data-action=skip]')!.textContent=this.game.state.active?.physical&&!this.game.state.active.applied?'導入を省略':'演出を閉じる';
  this.root.querySelector<HTMLButtonElement>('[data-action=skip]')!.disabled=!!this.game.state.active?.physical&&!this.game.state.active.applied&&this.game.state.active.elapsed>=5.4;
 }
 private show(cut:Cut){
  const key=JSON.stringify(cut);if(key===this.lastCut)return;this.lastCut=key;
  this.story.querySelector<HTMLElement>('.story-backdrop')!.style.backgroundImage=`url("${asset(cut.bg)}")`;
  this.story.querySelector('.speech b')!.textContent=names[cut.who];this.story.querySelector('.speech span')!.textContent=cut.text;
  for(const who of ['nagi','mina','garo'] as Character[])this.actors[who].classList.toggle('speaking',who===cut.who);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.actors[cut.who].querySelector<HTMLElement>('.paper-art')!.style.backgroundPosition=positions[cut.pose];return;}
  if(this.flip){const old=this.actors[this.flip.who];old.style.transform='';old.querySelector<HTMLElement>('.paper-art')!.style.transform='';}
  this.flip={who:cut.who,time:0,cut,swapped:false};
 }
 private finishJournal(){const chapter=this.ui.journal;if(chapter!==null)this.game.state.diaryRead=Math.max(this.game.state.diaryRead??0,chapter+1);this.ui.journal=null;this.ui.journalTime=0;this.ui.position='upper';this.changed();}
 replay(chapter:number){if(this.game.state.active||chapter>=(this.game.state.diaryUnlocked??0))return;this.ui.journal=chapter;this.ui.journalTime=0;this.ui.position='center';this.changed();}
 capture(){if(this.draw&&this.game.state.active)this.game.state.active.drawSave=this.draw.export();}
 private retry(){const a=this.game.state.active;if(!a?.plan||a.applied)return;const retry=(this.draw?.retry??0)+1;this.drawView?.dispose();this.draw?.dispose();this.draw=new PhysicalDraw({...a.plan,seed:(a.plan.seed+Math.imul(retry,2654435761))>>>0});this.draw.retry=retry;this.drawView=new DrawView(this.draw);delete a.drawSave;this.changed();}
 tick(dt:number){
  this.time+=dt;const a=this.game.state.active;
  if(a&&a.id!==this.lastTicket){this.lastTicket=this.ui.ticket=a.id;this.ui.position='center';this.story.classList.remove('arriving');void this.story.offsetWidth;this.story.classList.add('arriving');this.drawWindow.classList.remove('upper','resumed');this.lastCut='';this.changed();}
  if(!a&&this.lastTicket&&this.ui.journal===null){this.ui.position='upper';this.lastTicket=this.ui.ticket=0;}
  if(!a&&this.draw){this.drawView?.dispose();this.draw.dispose();this.draw=undefined;this.drawView=undefined;this.drawWindow.hidden=true;this.drawWindow.classList.remove('upper','resumed');}
  if(!a&&this.ui.journal===null&&(this.game.state.diaryUnlocked??0)>(this.game.state.diaryRead??0)){this.ui.journal=this.game.state.diaryRead??0;this.ui.journalTime=0;this.ui.position='center';this.changed();}
  let cut:Cut;const stamp=this.story.querySelector<HTMLElement>('.result-stamp')!;stamp.hidden=true;
  if(this.ui.journal!==null){
   const chapter=diaries[this.ui.journal];this.ui.journalTime+=dt;cut=at(chapter.cuts,this.ui.journalTime,3.6);
   this.story.querySelector('.movie-title')!.textContent=`配達日誌 · ${chapter.title}`;
   if(this.ui.journalTime>chapter.cuts.length*3.6)this.finishJournal();
  }else if(a){
   this.story.querySelector('.movie-title')!.textContent=a.kind==='normal'?'港のチャンス便':'特別便';
   if(a.physical&&a.elapsed>=5.4&&a.plan){
    if(!this.draw){this.draw=new PhysicalDraw(a.plan,a.drawSave);this.drawView=new DrawView(this.draw);if(!a.drawSave){this.ui.position='upper';this.drawWindow.classList.remove('upper','resumed');}this.changed();}
    if(!a.applied){this.draw.step(dt);if(this.draw.result)this.game.resolveDraw(a.id,this.draw.result);}
    this.drawView!.update();
    const note=this.root.querySelector<HTMLElement>('.draw-note')!;
    note.textContent=a.applied?RESULT_LABELS[a.result!].title:this.draw.elapsed>=24?'球が止まりました。同じ配当配置で入れ直せます。':this.draw.elapsed<3.2?'球を送り出しています。まもなく全ゲート開放。':'球が入った穴で決定 · 10枚×7／30枚×2／JP×1';
    this.root.querySelector<HTMLElement>('.retry-draw')!.hidden=this.draw.elapsed<24||a.applied;
   }
   if(a.applied&&a.result){cut=at(outcome[a.result],a.elapsed-(a.resolvedAt??5.4),2.4);stamp.hidden=false;stamp.textContent=RESULT_LABELS[a.result].title;}
   else cut=a.elapsed<5.4?at(a.kind==='jpc'?jpIntro:intro,a.elapsed,1.8):{bg:'bg05',who:'nagi',pose:'normal',text:'いってこい！'};
  }else{
   const cycle=Math.floor(this.time/20)%idle.length;cut=at(idle[cycle],this.time%20,3.4);this.story.querySelector('.movie-title')!.textContent='港の郵便局';
  }
  if(a?.kind==='normal'&&!a.applied&&a.elapsed>=3.6){stamp.hidden=false;stamp.textContent=['封筒便','小包便','カプセル便','特別便'][Math.floor(a.elapsed*9)%4];}
  this.show(cut);
  if(this.flip){const f=this.flip;f.time+=dt;const t=Math.min(1,f.time/.55),angle=t*360;const actor=this.actors[f.who],art=actor.querySelector<HTMLElement>('.paper-art')!;
   actor.style.transform=`rotateY(${angle}deg)`;art.style.transform=Math.cos(t*Math.PI*2)<0?'rotateY(180deg)':'';
   if(!f.swapped&&t>=.25){art.style.backgroundPosition=positions[f.cut.pose];f.swapped=true;}
   if(t===1){actor.style.transform='';art.style.transform='';this.flip=undefined;}
  }
  if(this.previousMini!==this.game.state.miniBallsCollected){this.previousMini=this.game.state.miniBallsCollected;const notice=this.root.querySelector<HTMLElement>('.mini-letter')!;notice.hidden=false;notice.dataset.until=String(this.time+4);}
  const notice=this.root.querySelector<HTMLElement>('.mini-letter')!;if(this.time>Number(notice.dataset.until??0))notice.hidden=true;
  this.layout();
 }
 get overlay(){if(!this.drawView||this.drawWindow.hidden)return undefined;return {scene:this.drawView.scene,camera:this.drawView.camera,element:this.surface};}
}
