import { Game, type Ticket } from '../game';
import { RESULT_LABELS } from '../config';
import { PhysicalDraw,type DrawPlan,type DrawSnapshot } from './draw';
import { DrawView } from './draw-view';
import { at,diaries,idle,intro,jpIntro,names,outcome,type Cut,type Character } from './scripts';
import './theater.css';
import {routes,progressPhase,reelLabels,revealTime,stops} from './challenge';
import { REFIT_CHOICE_SECONDS } from './jp';
const asset=(name:string)=>new URL(`events/${name}.webp`,document.baseURI).href;
const positions={normal:'0% 0%',surprise:'100% 0%',joy:'0% 100%',sad:'100% 100%'};
export class Theater {
 root:HTMLElement;story:HTMLElement;drawWindow:HTMLElement;surface:HTMLElement;
 private actors:Record<Character,HTMLElement>;private lastCut='';private time=0;private lastTicket=0;private draw?:PhysicalDraw<string>;private drawView?:DrawView;private drawKey='';
 private currentCut?:Cut;
 private flip?:{who:Character;time:number;cut:Cut;swapped:boolean};private previousMini=0;private showStoryDuringDraw=false;
 private get ui(){return this.game.state.theater!;}
 constructor(public host:HTMLElement,public game:Game){
  this.root=document.createElement('div');this.root.className='theater';this.root.innerHTML=`
   <div class="dispatch-ledger" aria-label="配達スタンプ" title="同じ航路のスタンプ3個で追加チャレンジ"></div>
   <section class="story-window upper" aria-label="港の郵便局の物語">
    <header class="movie-bar"><span class="movie-title">港の郵便局</span><div><button type="button" data-action="watch-draw" hidden>抽選へ</button><button type="button" data-action="move">大きく ↓</button><button type="button" data-action="skip" hidden>演出を閉じる</button></div></header>
    <div class="jp-inventory" aria-label="次のJPへの準備"></div><div class="event-stage" role="status"></div>
    <div class="story-picture"><div class="story-backdrop"></div><div class="cast" aria-hidden="true">${(['nagi','mina','garo'] as Character[]).map(w=>`<div class="paper-actor ${w}" data-who="${w}"><div class="paper-art"></div></div>`).join('')}</div><div class="speech" aria-live="polite"><b></b><span></span></div><div class="event-machine" hidden><div class="reel-strip" aria-label="抽選リール"><span></span><span></span><span></span></div><button type="button" data-action="advance" title="演出を早めます。当選率は変わりません。">停止・次へ</button></div><div class="mini-choice" hidden>${routes.map((r,i)=>`<button type="button" data-route="${i}">${r.name}</button>`).join('')}</div><div class="result-stamp" role="status"></div></div>
    <div class="story-note">上にスワイプで縮小・下にスワイプで拡大</div>
   </section>
   <section class="draw-window" aria-label="特別便のボール抽選" hidden><header class="movie-bar"><span>特別便のドック</span><div><button type="button" data-action="watch-story">物語へ</button><button type="button" data-action="draw-move">小さく ↑</button></div></header><div class="jp-meter"><span></span><div class="jp-pockets" aria-hidden="true">${Array(10).fill('<i></i>').join('')}</div></div><div class="draw-surface" role="img" aria-label="10個の穴と白い抽選球。球が入った穴の報酬を獲得"></div><div class="draw-note" aria-live="polite"></div><div class="refit-actions" hidden><button type="button" data-refit="depart">この状態で出航</button><button type="button" data-refit="continue">もう1球</button></div><button type="button" class="retry-draw" hidden>球を入れ直す</button></section>
   <div class="mini-letter" role="status" hidden>ミナ：小さな便、到着！<br>10枚を左から払い出します</div>`;
  host.append(this.root);this.story=this.root.querySelector('.story-window')!;this.drawWindow=this.root.querySelector('.draw-window')!;this.surface=this.root.querySelector('.draw-surface')!;
  // Controls get their own row, rather than covering the characters' faces.
  this.story.append(this.story.querySelector('.event-machine')!,this.story.querySelector('.mini-choice')!);
  this.actors={} as Record<Character,HTMLElement>;
  for(const who of ['nagi','mina','garo'] as Character[]){const el=this.root.querySelector<HTMLElement>(`[data-who=${who}]`)!;this.actors[who]=el;el.querySelector<HTMLElement>('.paper-art')!.style.backgroundImage=`url("${asset(who)}")`;}
  this.bind(game);
  this.root.querySelector('[data-action=move]')!.addEventListener('click',()=>this.move(this.ui.position==='center'?'upper':'center'));
  this.root.querySelector('[data-action=draw-move]')!.addEventListener('click',()=>{this.drawWindow.classList.toggle('upper');this.ui.position='upper';this.changed();});
  this.root.querySelector('[data-action=skip]')!.addEventListener('click',()=>{
   if(this.ui.journal!==null)this.finishJournal();else this.game.skip();this.changed();
  });
  for(const [action,story] of [['watch-story',true],['watch-draw',false]] as const)this.root.querySelector(`[data-action=${action}]`)!.addEventListener('click',()=>{this.showStoryDuringDraw=story;this.layout();});
  this.root.querySelector('[data-action=advance]')!.addEventListener('click',()=>{if(this.game.state.active)this.game.advancePresentation(this.game.state.active.id);});
  this.root.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(button=>button.addEventListener('click',()=>{const a=this.game.state.active;if(a)this.game.chooseMiniRoute(a.id,Number(button.dataset.route));}));
  this.root.querySelector('.retry-draw')!.addEventListener('click',()=>this.retry());
  this.root.querySelectorAll<HTMLButtonElement>('[data-refit]').forEach(button=>button.addEventListener('click',()=>{const a=this.game.state.active;if(a)this.game.chooseRefit(a.id,button.dataset.refit==='continue');}));
  for(const win of [this.story,this.drawWindow]){
   let y=0,x=0,swiping=false;win.addEventListener('pointerdown',e=>{e.stopPropagation();swiping=false;if((e.target as HTMLElement).closest('button'))return;swiping=true;x=e.clientX;y=e.clientY;win.setPointerCapture(e.pointerId);});
   win.addEventListener('pointerup',e=>{e.stopPropagation();if(!swiping)return;swiping=false;const dy=e.clientY-y;if(Math.abs(dy)<48||Math.abs(dy)<Math.abs(e.clientX-x)*1.35)return;if(win===this.story)this.move(dy<0?'upper':'center');else{this.drawWindow.classList.toggle('upper',dy<0);this.ui.position='upper';this.changed();}});
   win.addEventListener('pointercancel',()=>{swiping=false;});
  }
  new ResizeObserver(()=>this.layout()).observe(host);
  for(const id of ['bg01','bg02','nagi','mina','garo']){const img=new Image();img.src=asset(id);}
 }
 bind(game:Game){this.drawView?.dispose();this.draw?.dispose();this.draw=undefined;this.drawView=undefined;this.game=game;this.drawKey='';this.showStoryDuringDraw=false;game.cinematic=true;game.state.theater??={ticket:0,position:'upper',journal:null,journalTime:0};this.lastTicket=this.ui.ticket;this.previousMini=game.state.miniBallsCollected;this.lastCut='';this.drawWindow.classList.toggle('upper',!!this.ui.drawUpper);}
 private changed(){this.ui.drawUpper=this.drawWindow.classList.contains('upper');delete this.ui.boardResumed;this.game.onDurableChange();this.layout();}
 private move(position:'center'|'upper'){this.ui.position=position;if(position==='center')this.drawWindow.classList.add('upper');this.changed();}
 private layout(){
  const physical=!!this.drawView;this.story.classList.toggle('upper',this.ui.position==='upper');
  this.story.hidden=physical&&!this.showStoryDuringDraw;this.drawWindow.hidden=!physical||this.showStoryDuringDraw;
  this.root.querySelector<HTMLElement>('[data-action=watch-draw]')!.hidden=!physical;
  this.root.querySelector('[data-action=move]')!.textContent=this.ui.position==='center'?'小さく ↑':'大きく ↓';
  // Both windows live in a dedicated grid row above the board, in every mode.
  this.host.closest('.stage')!.classList.toggle('event-expanded',this.ui.position==='center'||(physical&&!this.drawWindow.classList.contains('upper')));
  this.root.querySelector('[data-action=draw-move]')!.textContent=this.drawWindow.classList.contains('upper')?'大きく ↓':'小さく ↑';
  this.root.querySelector<HTMLButtonElement>('[data-action=skip]')!.hidden=!this.game.state.active&&this.ui.journal===null;
  this.root.querySelector('[data-action=skip]')!.textContent=this.game.state.active?.physical&&!this.game.state.active.applied?'導入を省略':'演出を閉じる';
  this.root.querySelector<HTMLButtonElement>('[data-action=skip]')!.disabled=!!this.game.state.active?.physical&&!this.game.state.active.applied&&this.game.state.active.elapsed>=5.4;
  this.positionSpeech();
 }
 private show(cut:Cut){
  const key=JSON.stringify(cut);if(key===this.lastCut)return;this.lastCut=key;this.currentCut=cut;
  this.story.querySelector<HTMLElement>('.story-backdrop')!.style.backgroundImage=`url("${asset(cut.bg)}")`;
  this.story.querySelector('.speech b')!.textContent=names[cut.who];this.story.querySelector('.speech span')!.textContent=cut.text;
  for(const who of ['nagi','mina','garo'] as Character[])this.actors[who].classList.toggle('speaking',who===cut.who);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.actors[cut.who].querySelector<HTMLElement>('.paper-art')!.style.backgroundPosition=positions[cut.pose];return;}
  if(this.flip){const old=this.actors[this.flip.who];old.style.transform='';old.querySelector<HTMLElement>('.paper-art')!.style.transform='';}
  this.flip={who:cut.who,time:0,cut,swapped:false};
 }
 private positionSpeech(){
  if(!this.currentCut||this.story.hidden)return;
  const picture=this.story.querySelector<HTMLElement>('.story-picture')!,speech=this.story.querySelector<HTMLElement>('.speech')!;
  const actor=this.actors[this.currentCut.who],w=picture.clientWidth;
  if(!w||!picture.clientHeight)return;
  // Layout coordinates do not rotate with the paper actor; its bubble stays still.
  const head={nagi:{normal:.08,surprise:.05,joy:.07,sad:.16},mina:{normal:.07,surprise:.06,joy:.12,sad:.13},garo:{normal:.07,surprise:.05,joy:.06,sad:.12}}[this.currentCut.who][this.currentCut.pose];
  const cast=actor.parentElement!;
  const x=cast.offsetLeft+actor.offsetLeft+actor.offsetWidth/2,y=cast.offsetTop+actor.offsetTop+actor.offsetHeight*head;
  speech.style.width=`${Math.min(260,w*.67)}px`;
  const left=Math.max(8,Math.min(w-speech.offsetWidth-8,x-speech.offsetWidth/2));
  speech.style.left=`${left}px`;speech.style.top=`${Math.max(4,y-speech.offsetHeight-10)}px`;
  speech.style.setProperty('--tail-x',`${Math.max(12,Math.min(speech.offsetWidth-12,x-left))}px`);
  speech.dataset.speaker=this.currentCut.who;
 }
 private finishJournal(){const chapter=this.ui.journal;if(chapter!==null)this.game.state.diaryRead=Math.max(this.game.state.diaryRead??0,chapter+1);this.ui.journal=null;this.ui.journalTime=0;this.ui.position='upper';this.changed();}
 replay(chapter:number){if(this.game.state.active||chapter>=(this.game.state.diaryUnlocked??0))return;this.ui.journal=chapter;this.ui.journalTime=0;this.ui.position='center';this.changed();}
 private clearDraw(){this.drawView?.dispose();this.draw?.dispose();this.drawView=undefined;this.draw=undefined;this.drawKey='';this.showStoryDuringDraw=false;}
 capture(){
  const a=this.game.state.active;if(!this.draw||!a||!this.drawKey.startsWith(`${a.id}:`))return;
  const snapshot=this.draw.export();
  if(this.drawKey.endsWith(':route')&&a.qualifier)a.qualifier.drawSave=snapshot;
  else if(this.drawKey.includes(':refit:')){const attempt=a.refit?.attempts[Number(this.drawKey.split(':')[2])];if(attempt)attempt.drawSave=snapshot;}
  else a.drawSave=snapshot;
 }
 private target(a:Ticket):{key:string;mode:'route'|'refit'|'prize';plan:DrawPlan<string>;saved?:DrawSnapshot}{
  const q=a.qualifier,r=a.refit;
  if(q&&(q.pocket===undefined||a.elapsed<(q.resolvedAt??a.elapsed)+2.4))return {key:`${a.id}:route`,mode:'route',plan:q.plan,saved:q.drawSave};
  if(r&&r.attempts.length&&(r.phase!=='final'||a.elapsed<(r.finalAt??Infinity))){const i=r.attempts.length-1,attempt=r.attempts[i];return {key:`${a.id}:refit:${i}`,mode:'refit',plan:attempt.plan,saved:attempt.drawSave};}
  return {key:`${a.id}:prize`,mode:'prize',plan:{...a.plan!,seed:(a.plan!.seed+Math.imul(a.route??0,2654435761))>>>0},saved:a.drawSave};
 }
 private retry(){
  const a=this.game.state.active;if(!a||a.applied||!this.draw||this.draw.pocket!==null||this.draw.elapsed<24)return;
  const target=this.target(a);if(target.key!==this.drawKey)return;
  const retry=this.draw.retry+1;this.clearDraw();this.drawKey=target.key;
  this.draw=new PhysicalDraw({...target.plan,seed:(target.plan.seed+Math.imul(retry,2654435761))>>>0});this.draw.retry=retry;this.drawView=new DrawView(this.draw,target.mode);this.changed();
 }
 private tickDraw(a:Ticket,dt:number){
   if(!a.plan)return;
   const target=this.target(a),q=a.qualifier,r=a.refit;
   if(this.drawKey!==target.key){const previous=!!this.draw;this.clearDraw();this.drawKey=target.key;
     this.draw=new PhysicalDraw(target.plan,target.saved);this.drawView=new DrawView(this.draw,target.mode);
     if(!previous&&!target.saved){this.ui.position='upper';this.drawWindow.classList.remove('upper');}this.changed();
   }
   const pending=target.mode==='route'?q!.pocket===undefined:target.mode==='refit'?r!.phase==='refit'&&r!.attempts.at(-1)!.pocket===undefined:!r||r.phase==='final'&&a.elapsed>=(r.finalAt??Infinity);
   if(!a.applied&&pending){
     this.draw!.step(dt);if(this.draw!.pocket!==null){
       if(target.mode==='route')this.game.completeQualifier(a.id,this.draw!.pocket);
       else if(target.mode==='refit')this.game.resolveUpgrade(a.id,this.draw!.pocket);
       else {const result=this.draw!.result;if(result==='CREDIT_10'||result==='FIELD_30'||result==='JACKPOT')this.game.resolveDraw(a.id,result);}
     }
   }
   this.drawView!.update();
   this.drawWindow.setAttribute('aria-label',target.mode==='route'?'第1球・航路抽選':target.mode==='refit'?'改装チャレンジ':r?'第3段階・最終抽選':'第2球・最終抽選');
   const note=this.root.querySelector<HTMLElement>('.draw-note')!;
   const slots=r?.slots??1;
   note.textContent=a.applied?`${RESULT_LABELS[a.result!].title}${a.refit&&a.result!=='JACKPOT'?` · 再出航 ${this.game.state.jpFailures??0}/3`:''}`:target.mode==='route'?(q!.pocket!==undefined?`${routes[a.route!].name}航路へ！ 次は${r?'改装チャレンジ':'最終抽選'}。`:'第1球：1 灯台／2 海路／3 工房'):target.mode==='refit'?(r!.phase==='refit'?'改装：JP＋1×3／＋2×1／突風×2／補強×1／10枚×2／出航×1':`${r!.message}${r!.phase==='choice'?` あと${Math.max(0,Math.ceil(REFIT_CHOICE_SECONDS-a.elapsed+r!.decisionAt!))}秒で自動出航。`:' 最終ゲートへ。'}`):`最終抽選 · 10枚×${8-slots}／30枚×2／JP×${slots}`;
   if(this.draw!.elapsed>=24&&this.draw!.pocket===null&&!a.applied)note.textContent='球が止まりました。同じ配置で入れ直せます。';
   this.root.querySelector<HTMLElement>('.retry-draw')!.hidden=this.draw!.elapsed<24||this.draw!.pocket!==null||a.applied;
   this.root.querySelector<HTMLElement>('.refit-actions')!.hidden=!r||r.phase!=='choice'||a.applied;
   this.root.querySelector('[data-refit=continue]')!.textContent=`もう1球（残り${r?Math.max(0,r.maxBalls-r.attempts.length):0}）`;
   this.root.querySelector('.jp-meter>span')!.textContent=`JP ${slots}/10マス${r?` · 補強${r.shield?'あり':'なし'} · 改装${r.attempts.length}/${r.maxBalls}球`:''}`;
   this.root.querySelectorAll('.jp-pockets i').forEach((el,i)=>el.classList.toggle('lit',i<slots));
 }
 tick(dt:number){
  this.time+=dt;const a=this.game.state.active;
  if(a&&a.id!==this.lastTicket){this.clearDraw();this.lastTicket=this.ui.ticket=a.id;this.ui.position='center';this.story.classList.remove('arriving');void this.story.offsetWidth;this.story.classList.add('arriving');this.drawWindow.classList.remove('upper');this.lastCut='';this.changed();}
  if(!a&&this.lastTicket&&this.ui.journal===null){this.ui.position='upper';this.lastTicket=this.ui.ticket=0;}
  if(!a&&this.draw){this.clearDraw();this.drawWindow.hidden=true;this.drawWindow.classList.remove('upper');}
  if(!a&&this.ui.journal===null&&(this.game.state.diaryUnlocked??0)>(this.game.state.diaryRead??0)){this.ui.journal=this.game.state.diaryRead??0;this.ui.journalTime=0;this.ui.position='center';this.changed();}
  let cut:Cut;const stamp=this.story.querySelector<HTMLElement>('.result-stamp')!;stamp.hidden=true;
  if(this.ui.journal!==null){
   const chapter=diaries[this.ui.journal];this.ui.journalTime+=dt;cut=at(chapter.cuts,this.ui.journalTime,3.6);
   this.story.querySelector('.movie-title')!.textContent=`配達日誌 · ${chapter.title}`;
   if(this.ui.journalTime>chapter.cuts.length*3.6)this.finishJournal();
  }else if(a){
   this.story.querySelector('.movie-title')!.textContent=a.kind==='mini'?'小包開封':a.kind==='station'?'航路チャレンジ':a.kind==='normal'?'港のチャンス便':'特別便';
   if(a.physical&&a.elapsed>=5.4)this.tickDraw(a,dt);
   if(a.kind==='mini'){
     cut=a.stampApplied?{bg:routes[a.route!].bg,who:routes[a.route!].who,pose:'joy',text:a.routeCompleted?(a.kitGranted===false?'準備枠は満杯！ 航路チャレンジへ進もう。':['灯台の光を用意したよ！ 次のJPは当たりマス＋1。','予備の航海図！ 次のJPは改装の球数＋1。','補強材を用意した。次のJPで突風を防ぐぞ。'][a.route!]):`${routes[a.route!].name}のスタンプ、記録したよ。`}:{bg:'bg02',who:'mina',pose:'joy',text:'小さな便、到着！ 10枚を払い出すよ。配達先を選んでね。'};
     stamp.hidden=false;stamp.textContent='10枚払出し＋配達スタンプ';
   }else if(a.applied&&a.result){cut=at(outcome[a.result],a.elapsed-(a.resolvedAt??revealTime(a)),2.4);stamp.hidden=false;stamp.textContent=RESULT_LABELS[a.result].title;}
   else if(a.physical){const q=a.qualifier,r=a.refit;cut=a.elapsed<5.4?at(jpIntro,a.elapsed,1.8):r&&r.attempts.length?{bg:'bg05',who:r.who,pose:r.phase==='refit'?'normal':'surprise',text:r.phase==='refit'?'灯りを増やそう。突風には気をつけて。':r.phase==='final'&&a.elapsed>=(r.finalAt??Infinity)?`出航！ JPは${r.slots}マス。球の行方を見届けよう！`:r.message}:q&&q.pocket!==undefined?{bg:'bg05',who:routes[a.route!].who,pose:'surprise',text:`${routes[a.route!].name}のゲートが開いた！ ${r?'灯台の準備をしよう。':'次の球で決まるよ。'}`}:{bg:'bg05',who:'nagi',pose:'normal',text:'まずは航路を決めよう。いってこい！'};}
   else{const route=routes[a.route??a.id%3],step=Math.min(2,stops(a).filter(t=>a.elapsed>=t).length);cut=a.elapsed<1.8?at(intro,a.elapsed,1.8):{bg:route.bg,who:route.who,pose:step===2?'surprise':'normal',text:route.lines[step]};}
  }else{
   const cycle=Math.floor(this.time/20)%idle.length;cut=at(idle[cycle],this.time%20,3.4);this.story.querySelector('.movie-title')!.textContent='港の郵便局';
  }
  const machine=this.root.querySelector<HTMLElement>('.event-machine')!,choices=this.root.querySelector<HTMLElement>('.mini-choice')!;
  machine.hidden=!a||!['normal','station'].includes(a.kind)||a.applied;
  if(a&&!machine.hidden){machine.classList.toggle('reach',a.elapsed>=stops(a)[1]);const labels=reelLabels(a);machine.querySelectorAll<HTMLElement>('.reel-strip span').forEach((el,i)=>{el.textContent=labels[i];el.classList.toggle('stopped',a.elapsed>=stops(a)[i]);});}
  if(a?.kind==='mini'&&!a.stampApplied)stamp.hidden=true;
  choices.hidden=a?.kind!=='mini'||!!a.stampApplied;
  choices.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((button,i)=>button.textContent=`${routes[i].name} ${this.game.state.deliveryStamps?.[i]??0}/3`);
  this.root.querySelector('.event-stage')!.textContent=a?progressPhase(a):this.ui.journal!==null?'配達日誌':'港の郵便局 · 待機中';
  const ledger=this.root.querySelector('.dispatch-ledger')!;ledger.textContent=routes.map((r,i)=>`${r.name} ${'●'.repeat(this.game.state.deliveryStamps?.[i]??0)}${'○'.repeat(3-(this.game.state.deliveryStamps?.[i]??0))}`).join('　');
  const kit=this.game.state.jpItems??{lights:0,charts:0,shields:0};
  this.root.querySelector('.jp-inventory')!.textContent=`次回準備 · 灯り ${kit.lights}/2 · 航海図 ${kit.charts}/1 · 補強 ${kit.shields}/1 · 再出航 ${this.game.state.jpFailures??0}/3`;
  this.show(cut);
  if(this.flip){const f=this.flip;f.time+=dt;const t=Math.min(1,f.time/.55),angle=t*360;const actor=this.actors[f.who],art=actor.querySelector<HTMLElement>('.paper-art')!;
   actor.style.transform=`rotateY(${angle}deg)`;art.style.transform=Math.cos(t*Math.PI*2)<0?'rotateY(180deg)':'';
   if(!f.swapped&&t>=.25){art.style.backgroundPosition=positions[f.cut.pose];f.swapped=true;}
   if(t===1){actor.style.transform='';art.style.transform='';this.flip=undefined;}
  }
  if(this.previousMini!==this.game.state.miniBallsCollected){this.previousMini=this.game.state.miniBallsCollected;const notice=this.root.querySelector<HTMLElement>('.mini-letter')!;notice.hidden=false;notice.dataset.until=String(this.time+4);}
  const notice=this.root.querySelector<HTMLElement>('.mini-letter')!;notice.hidden=a?.kind==='mini'||this.time>Number(notice.dataset.until??0);
  ledger.setAttribute('style',`visibility:${notice.hidden?'visible':'hidden'}`);
  this.layout();
 }
 get overlay(){if(!this.drawView||this.drawWindow.hidden)return undefined;return {scene:this.drawView.scene,camera:this.drawView.camera,element:this.surface};}
}
