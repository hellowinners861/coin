import RAPIER from '@dimforge/rapier3d-compat';
import { D, DT, ENGINE_VERSION, LIMIT, SAVE_VERSION } from './config';
import { Game } from './game';
import { MedalFeed } from './feed';
import { Simulation } from './physics';
import { BoardView } from './view';
import { SaveStore, type SavedGame } from './storage';
import { MachineAudio } from './audio';
import './styles.css';
import { Theater } from './events/theater';

const app=document.getElementById('app')!;
app.innerHTML=`
  <header class="topbar">
    <div class="identity"><span class="wordmark">coin</span><small>メダルプッシャー</small></div>
    <div class="wallet" aria-label="手持ちメダル"><span>手持ち</span><strong id="wallet">100</strong><small>枚</small></div>
    <button type="button" class="quiet-button" id="settings-open">設定</button>
  </header>
  <main class="stage">
    <div class="render-layer" id="render-layer" aria-hidden="true"></div>
    <section class="event-dock" id="event-dock" aria-label="イベント専用モニター"></section>
    <div class="scene" id="scene">
    <div class="progress-bar">
      <div class="progress-item">次の抽選まで <strong id="event-remaining">30枚</strong></div>
      <div class="progress-item">ボール <strong id="ball-count">0 / 3</strong><span class="ball-dots" aria-hidden="true"><i class="ball-dot"></i><i class="ball-dot"></i><i class="ball-dot"></i></span></div>
    </div>
    <div class="win-pop" id="win-pop" aria-hidden="true"></div>
    </div>
    <div class="cover" id="cover">
      <div class="cover-content">
        <p class="eyebrow">coin</p><h1 id="cover-title">盤面を準備しています</h1>
        <p id="cover-copy">メダルの位置を整えています。</p>
        <div id="loading" class="loading-line"></div>
        <label class="start-sound"><input id="start-sound" type="checkbox" disabled /> BGM・効果音をつける</label>
        <button type="button" class="primary" id="start" hidden>はじめる</button>
        <button type="button" class="secondary" id="start-new" hidden>はじめから</button>
        <p class="notice" id="boot-notice" hidden></p>
      </div>
    </div>
    <div id="diagnostics" class="diagnostics" hidden></div>
  </main>
  <footer class="controls">
    <button type="button" id="refill-open" class="help-link refill-link" hidden>メダルを100枚追加</button>
    <div class="supply-status" id="supply">手前から奥へ。狙いを決めて、メダルを投入。</div>
    <div class="control-row">
      <div class="feed-controls" role="group" aria-label="メダル投入モード">
        <button type="button" id="batch-mode" class="mode-button" aria-pressed="false" disabled><span>1プッシュ</span><strong id="batch-label">1枚</strong></button>
        <button type="button" id="auto-mode" class="mode-button" aria-pressed="false" disabled><span>自動投入</span><strong id="auto-label">OFF</strong></button>
      </div>
      <button type="button" id="insert" class="insert" disabled>メダル投入<small>長押しで連続</small></button>
    </div>
    <div class="bottom-note"><button type="button" class="help-link" id="help-open">遊び方</button><span>盤面をドラッグで向きを調整 <span id="angle-output">正面</span></span><span id="save-state" class="save-state">自動保存</span></div>
  </footer>
  <dialog id="settings">
    <div class="dialog-header"><h2>設定</h2><button type="button" data-close>閉じる</button></div>
    <label class="setting">サウンド<input id="sound" type="checkbox" /></label>
    <label class="setting">BGM<input id="bgm" type="checkbox" checked /></label>
    <label class="setting">獲得時の振動<input id="vibration" type="checkbox" checked /></label>
    <label class="setting">描画品質<select id="quality"><option value="high">標準</option><option value="low">軽量</option></select></label>
    <div class="stats"><span>獲得メダル<strong id="stat-won">0</strong></span><span>投入メダル<strong id="stat-paid">0</strong></span><span>JP回数<strong id="stat-jp">0</strong></span></div>
    <p id="storage-note" class="notice">盤面と抽選結果はこのブラウザに保存されます。</p>
    <div id="diary-list" class="diary-list"></div><button type="button" class="secondary" id="reset-open">はじめから遊ぶ</button>
    <div id="reset-prompt" class="reset-prompt" hidden><p>現在の盤面を終了し、手持ち100枚から始めます。</p><div class="reset-actions"><button type="button" class="secondary" id="reset-cancel">キャンセル</button><button type="button" class="primary" id="reset-confirm">はじめから</button></div></div>
    <button type="button" class="primary resume" data-close>盤面へ戻る</button>
  </dialog>
  <dialog id="refill" aria-labelledby="refill-title" aria-describedby="refill-copy">
    <div class="dialog-header"><h2 id="refill-title">メダルを追加しますか？</h2></div>
    <p id="refill-copy">手持ちが0枚になりました。100枚を無料で追加して、この盤面の続きを遊べます。</p>
    <div class="reset-actions"><button type="button" class="secondary" id="refill-cancel">落下を待つ</button><button type="button" class="primary" id="refill-confirm">はい、100枚追加</button></div>
  </dialog>
  <dialog id="help">
    <div class="dialog-header"><h2>遊び方</h2><button type="button" data-close>閉じる</button></div>
    <ul><li>左下の「1プッシュ」で1枚／3枚を切り替えます。3枚は間隔をあけて順に投入し、手持ちも1枚ずつ使います。長押しで連続投入できます。</li><li>盤面を左右にドラッグして投入口の向きを調整します。</li><li>「自動投入」をONにすると、レールを進む時間を見込んで上段が一番手前へ出る頃を狙います。1枚／3枚の設定に従い、1往復につき1回投入します。獲得枚数を保証するものではありません。</li><li>自動投入はOFFボタンで停止。手持ち0枚で自動停止し、追加後はONにし直してください。再読込時もOFFで始まります。</li><li>手前へ落ちたメダルを獲得。横落ちはありません。</li><li>30枚獲得するごとにイベント。ボール3個の回収でジャックポット抽選です。</li><li>タワーは右奥の搬入口に空きができると登場します。土台のメダルを押して崩しましょう。</li><li>手持ちが0枚になると100枚を無料で追加できます。「落下を待つ」を選んだ後も、画面下の追加ボタンから受け取れます。</li></ul>
    <h3>イベント画面</h3><p>港の郵便局の会話が上のモニターに流れます。イベント画面は盤面の上の専用エリアに表示します。上へスワイプ、または「小さく」で縮小できます。「大きく」で戻せます。JP抽選では10個の穴へ球を転がし、入った穴で報酬が決まります。10枚の穴が7個、30枚が2個、JPが1個。配置は投球前に決まり、球が転がり出してから当たり穴を変更しません。抽選を上へ送った後は「盤面を再開」でプレイを続けられます。JPで配達日誌が開き、設定から読み返せます。</p><h3>報酬の受け取り方</h3><p>5枚・10枚・30枚・JP300枚の報酬は、上段が一番手前に来た時に左横の射出口から奥側へ払い出します。手前へ落とすと手持ちに加わります。水色のミニボールを落とすと10枚を払い出し、大きいボールのJP進行とは別です。</p>
    <details><summary>抽選の確率とボール追加</summary><p>通常イベント：報酬なし20%、5枚20%、10枚35%、ボール18%、タワー4%、JP抽選2%、JP直撃1%。JP抽選：10枚70%、盤面へ30枚20%、JP10%。メダル報酬はすべて盤面への払出しです。</p><p>手持ちから5枚投入するごとに20%で大きいボール追加。盤面の大きいボールは最大3個で、当選済みの追加報酬は空きができるまで保留されます。水色のミニボールは初期3個、投入10枚ごとに1個追加（盤面と追加待ち合わせて最大6個）。下段に供給され、1個落とすと10枚払出し。JP用の大きいボール3個には含めません。無料補充は続けるための手持ちとして追加します。</p></details>
    <p>PCでは左右キーで向きを調整し、スペースキーで投入できます。</p>
    <button type="button" class="primary resume" data-close>盤面へ戻る</button>
  </dialog>`;

const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const scene=$('scene'),cover=$('cover'),insert=$<HTMLButtonElement>('insert');
const settings=$<HTMLDialogElement>('settings'),help=$<HTMLDialogElement>('help'),refill=$<HTMLDialogElement>('refill');
const audio=new MachineAudio(),store=new SaveStore();
let game:Game,sim:Simulation,view:BoardView,feed:MedalFeed,theater:Theater;
let ready=false,paused=true,storageAvailable=false,saveWanted=false,saving=false;
let lastSave=0,lastSaveClock=0,holding=false,lastInput=-10,drag:number|null=null,dragX=0,dragAngle=0;
let lastFrame=0,accumulator=0,lastDraw=0,lastUI=0,lastWon=0,winUntil=0,winBatch=0;
let hasOldSave=false,saveIssue='',refillAsked=false;
const debug=new URLSearchParams(location.search).has('debug');
let fpsFrames=0,fpsTime=0,fps=0,physicsMs=0;

function release() {holding=false;insert.classList.remove('pressed');}
function requestInput() {
  if(!ready||paused||theater.boardBlocked||feed.automatic)return;
  audio.unlock();if(feed.requestManual()){lastInput=sim.time;saveWanted=true;}
}
function vibrate(pattern:number|number[]) {if(game?.state.vibration&&navigator.vibrate)navigator.vibrate(pattern);}
function bindGame() {
  game.onSound=type=>{audio.play(type);if(type==='ball'||type==='jackpot'||type==='tower')vibrate(type==='jackpot'?[35,60,35]:15);};
  game.onDurableChange=()=>{saveWanted=true;};
  sim.onImpact=force=>audio.impact(force);
  audio.muted=game.state.muted;audio.bgm=game.state.bgm;
  $<HTMLInputElement>('bgm').checked=game.state.bgm;
  $<HTMLInputElement>('start-sound').checked=!game.state.muted;
  $('sound') instanceof HTMLInputElement && ($<HTMLInputElement>('sound').checked=!game.state.muted);
  $<HTMLInputElement>('vibration').checked=game.state.vibration;
  $<HTMLSelectElement>('quality').value=game.state.quality;
  view?.quality(game.state.quality==='low');
}
async function save(force=false) {
  if(!ready||!storageAvailable||saving||hasOldSave||sim.anomaly)return;
  if(!force&&!saveWanted&&sim.time-lastSave<4&&performance.now()-lastSaveClock<4000)return;
  saving=true;saveWanted=false;
  theater.capture();
  const value:SavedGame={version:SAVE_VERSION,engine:ENGINE_VERSION,savedAt:Date.now(),game:game.export(),physics:sim.export()};
  try {await store.save(value);lastSave=sim.time;lastSaveClock=performance.now();saveIssue='';}
  catch {saveIssue='保存できません';$('storage-note').textContent='このブラウザに保存できませんでした。空き容量や保存の設定を確認してください。';}
  finally {saving=false;}
}
function pause() {
  if(!ready)return;paused=true;audio.setPlaying(false);release();accumulator=0;saveWanted=true;void save(true);
}
function resume() {
  if(!ready||sim.anomaly)return;
  audio.unlock();audio.setPlaying(true);paused=false;cover.hidden=true;accumulator=0;lastFrame=performance.now();
  hasOldSave=false;saveWanted=true;
}
function openDialog(dialog:HTMLDialogElement) {if(!ready)return;pause();dialog.showModal();}
async function reset() {
  pause();
  const preferences={bgm:game.state.bgm,muted:game.state.muted,vibration:game.state.vibration,quality:game.state.quality,batchSize:game.state.batchSize};
  sim.dispose();game=new Game();Object.assign(game.state,preferences);sim=new Simulation(game);
  view.simulation=sim;feed=new MedalFeed(game,sim);theater.bind(game);bindGame();refillAsked=false;lastWon=winBatch=0;lastInput=-10;
  hasOldSave=false;sim.anomaly='';$('reset-prompt').hidden=true;
  if(settings.open)settings.close();
  cover.hidden=true;audio.unlock();audio.setPlaying(true);paused=false;lastFrame=performance.now();saveWanted=true;await save(true);updateUI();
}
function updateUI() {
  if(!ready)return;
  const s=game.state;
  if(s.wallet>0)refillAsked=false;
  if(s.wallet===0&&!refillAsked&&!paused&&cover.hidden&&!document.hidden) {
    refillAsked=true;openDialog(refill);
  }
  $('refill-open').hidden=s.wallet!==0;
  $('wallet').textContent=s.wallet.toLocaleString('ja-JP');
  $('event-remaining').textContent=`${30-s.gauge}枚`;
  $('ball-count').textContent=`${s.balls} / 3`;
  document.querySelectorAll('.ball-dot').forEach((el,i)=>el.classList.toggle('on',i<s.balls));
  const angle=Math.round(sim.targetAngle*180/Math.PI);
  $('angle-output').textContent=angle===0?'正面':`${angle<0?'左':'右'} ${Math.abs(angle)}°`;
  $('batch-label').textContent=`${s.batchSize}枚`;
  $('batch-mode').setAttribute('aria-pressed',String(s.batchSize===3));
  $('auto-mode').setAttribute('aria-pressed',String(feed.automatic));
  $('auto-label').textContent=feed.automatic?'ON':'OFF';
  $<HTMLButtonElement>('batch-mode').disabled=paused||theater.boardBlocked;
  $<HTMLButtonElement>('auto-mode').disabled=paused||theater.boardBlocked||s.wallet===0;
  insert.innerHTML=feed.automatic?'自動投入中<small>左のボタンでOFF</small>':`メダル投入<small>1プッシュ ${s.batchSize}枚</small>`;
  insert.disabled=paused||theater.boardBlocked||s.wallet===0||feed.automatic;
  if(s.wallet===0)release();
  const payout=s.payouts.reduce((n,p)=>n+p.remaining,0);
  const supply:string[]=[];
  if(theater.boardBlocked)supply.push('イベント表示中・盤面停止');
  if(feed.automatic)supply.push(s.feedQueue?.automatic?'タイミング投入中':'押し台のタイミングを待っています');
  else if(s.feedQueue)supply.push(`連続投入 残り${s.feedQueue.remaining}枚`);
  if(payout)supply.push(`盤面へ払出し 残り${payout}枚`);
  if(sim.towerPhase!=='idle'&&sim.towerPhase!=='standing')supply.push('タワー搬入中');
  else if(s.towerJobs)supply.push(`タワー待ち ${s.towerJobs}基`);
  if(s.ballJobs)supply.push(`ボール待ち ${s.ballJobs}個`);
  if(s.miniBallJobs)supply.push(`ミニボール待ち ${s.miniBallJobs}個`);
  if(sim.rewardHolding)supply.push('上段を前進位置で保持・左から射出中');
  if(s.queue.length)supply.push(`抽選保留 ${s.queue.length}件`);
  if(!sim.hasCapacity())supply.push('落下を待っています');
  $('supply').textContent=supply.join(' ／ ')||(s.wallet===0?'落下を待つか、100枚追加して続けられます。':'手前へ落ちたメダルを獲得。ボール3個でJP抽選。');
  $('stat-won').textContent=s.won.toLocaleString('ja-JP');$('stat-paid').textContent=s.paid.toLocaleString('ja-JP');$('stat-jp').textContent=String(s.jackpots);
  $('save-state').textContent=saveIssue||(saving?'保存中…':storageAvailable?'自動保存':'保存を利用できません');
  const diary=$('diary-list');
  if(diary.childElementCount!==(s.diaryUnlocked??0)){
    diary.replaceChildren();
    for(let i=0;i<(s.diaryUnlocked??0);i++){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=`配達日誌 ${i+1} を読む`;button.addEventListener('click',()=>{settings.close();theater.replay(i);});diary.append(button);}
  }
  diary.querySelectorAll('button').forEach(button=>button.disabled=!!s.active);
  if(s.won>lastWon) {winBatch+=s.won-lastWon;winUntil=performance.now()+1100;lastWon=s.won;$('win-pop').textContent=`+${winBatch}`;}
  if(performance.now()>winUntil)winBatch=0;
  $('win-pop').classList.toggle('visible',performance.now()<winUntil);
  if(debug) {
    $('diagnostics').hidden=false;
    $('diagnostics').textContent=`${fps.toFixed(0)} fps · physics ${physicsMs.toFixed(2)} ms\n${sim.coins()} coins / ${sim.balls()} balls · ${sim.towerPhase}\n${sim.collisions} contacts · t=${sim.time.toFixed(1)}s`;
  }
}

insert.addEventListener('pointerdown',event=>{
  if(paused||insert.disabled)return;event.preventDefault();audio.unlock();
  insert.setPointerCapture(event.pointerId);holding=true;requestInput();insert.classList.add('pressed');
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])insert.addEventListener(type,release);
window.addEventListener('pointerup',release);window.addEventListener('blur',release);
insert.addEventListener('contextmenu',e=>e.preventDefault());
// Assistive technology and keyboard-generated button clicks have no pointerdown.
insert.addEventListener('click',e=>{if(e.detail===0)requestInput();});
$('batch-mode').addEventListener('click',()=>{
  if(!ready||paused||theater.boardBlocked)return;release();game.state.batchSize=game.state.batchSize===1?3:1;
  saveWanted=true;void save(true);updateUI();
});
$('auto-mode').addEventListener('click',()=>{
  if(!ready||paused||theater.boardBlocked)return;release();audio.unlock();feed.setAutomatic(!feed.automatic);updateUI();
});
scene.addEventListener('pointerdown',e=>{if(!ready||paused||theater.boardBlocked)return;scene.setPointerCapture(e.pointerId);drag=e.pointerId;dragX=e.clientX;dragAngle=sim.targetAngle;});
scene.addEventListener('pointermove',e=>{if(e.pointerId!==drag)return;sim.setAngle(dragAngle+(e.clientX-dragX)/scene.clientWidth*LIMIT*2.5);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])scene.addEventListener(type,()=>{drag=null;});
window.addEventListener('keydown',e=>{
  if(!ready||paused||theater.boardBlocked||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLButtonElement)return;
  if(e.code==='Space'){e.preventDefault();if(!e.repeat){holding=true;requestInput();insert.classList.add('pressed');}}
  else if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();sim.setAngle(sim.targetAngle+(e.code==='ArrowRight'?1:-1)*Math.PI/180);}
  else if(e.code==='Escape')openDialog(settings);
});
window.addEventListener('keyup',e=>{if(e.code==='Space')release();});
$('settings-open').addEventListener('click',()=>openDialog(settings));$('help-open').addEventListener('click',()=>openDialog(help));
document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog')!.close()));
for(const dialog of [settings,help,refill])dialog.addEventListener('close',()=>{if(!cover.hidden||sim.anomaly)return;resume();});
function setSound(enabled:boolean) {
  audio.unlock();game.state.muted=!enabled;audio.muted=!enabled;
  $<HTMLInputElement>('sound').checked=enabled;$<HTMLInputElement>('start-sound').checked=enabled;
  saveWanted=true;void save(true);
}
$('sound').addEventListener('change',()=>setSound($<HTMLInputElement>('sound').checked));
$('start-sound').addEventListener('change',()=>setSound($<HTMLInputElement>('start-sound').checked));
$('bgm').addEventListener('change',()=>{audio.unlock();game.state.bgm=$<HTMLInputElement>('bgm').checked;audio.bgm=game.state.bgm;saveWanted=true;void save(true);});
$('refill-open').addEventListener('click',()=>{refillAsked=true;openDialog(refill);});
$('refill-cancel').addEventListener('click',()=>refill.close());
$('refill-confirm').addEventListener('click',()=>{game.refillWallet();refill.close();void save(true);updateUI();});
$('vibration').addEventListener('change',()=>{game.state.vibration=$<HTMLInputElement>('vibration').checked;saveWanted=true;void save(true);});
$('quality').addEventListener('change',()=>{game.state.quality=$<HTMLSelectElement>('quality').value as 'high'|'low';view.quality(game.state.quality==='low');saveWanted=true;void save(true);});
$('reset-open').addEventListener('click',()=>{$('reset-prompt').hidden=false;});
$('reset-cancel').addEventListener('click',()=>{$('reset-prompt').hidden=true;});
$('reset-confirm').addEventListener('click',()=>{void reset();});
$('start').addEventListener('click',resume);
$('start-new').addEventListener('click',()=>openDialog(settings));
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {pause();void audio.context?.suspend();if(ready&&cover.hidden&&!settings.open&&!help.open&&!refill.open){cover.hidden=false;$('cover-title').textContent='一時停止';$('cover-copy').textContent='盤面の動きを止めています。続きから遊べます。';$('start').hidden=false;$('start').textContent='つづける';}}
});
window.addEventListener('pagehide',()=>{pause();});

async function boot() {
  try {
    const physicsReady=RAPIER.init();
    let old:SavedGame|null=null;
    try {await store.open();storageAvailable=true;old=await store.load();}
    catch {saveIssue='保存を利用できません';}
    await physicsReady;
    let invalidSave=false;
    if(old&&store.compatible(old)) {
      try {game=new Game(old.game);sim=new Simulation(game,old.physics);hasOldSave=true;}
      catch {invalidSave=true;game=new Game();sim=new Simulation(game);}
    } else {invalidSave=!!old;game=new Game();sim=new Simulation(game);}
    view=new BoardView($('render-layer'),sim,scene);feed=new MedalFeed(game,sim);theater=new Theater($('event-dock'),game);bindGame();theater.tick(0);ready=true;$<HTMLInputElement>('start-sound').disabled=false;lastWon=game.state.won;
    $('loading').hidden=true;$('cover-title').textContent='メダルプッシャー';
    $('cover-copy').innerHTML='投入口を左右に振って、奥へ。<br>重なったメダルを、手前へ。';
    $('start').hidden=false;$('start').textContent=hasOldSave?'つづきから':'100枚で はじめる';
    if(hasOldSave)$('start-new').hidden=false;
    if(invalidSave) {
      hasOldSave=true;$('start').hidden=true;$('start-new').hidden=false;$('start-new').textContent='新しい盤面を始める';
      $('boot-notice').hidden=false;$('boot-notice').textContent='保存データを読み込めませんでした。元の保存は残しています。設定から新しい盤面を始められます。';
    }
    if(!storageAvailable){$('boot-notice').hidden=false;$('boot-notice').textContent='このブラウザでは進行を保存できません。';}
    updateUI();requestAnimationFrame(frame);
  } catch(error) {
    console.error(error);$('loading').hidden=true;$('cover-title').textContent='盤面を開けませんでした';
    $('cover-copy').textContent='WebGL 2に対応したブラウザで開き直してください。軽量化のため、他のタブを閉じることもお試しください。';
    $('cover-copy').classList.add('error-text');
  }
}
function frame(now:number) {
  requestAnimationFrame(frame);
  const elapsed=Math.min((now-lastFrame)/1000,.10);lastFrame=now;
  if(!paused&&!document.hidden) {
    game.tick(elapsed);theater.tick(elapsed);
    if(theater.boardBlocked){accumulator=0;release();}else accumulator+=elapsed;
    let steps=0;const start=performance.now();
    while(accumulator>=DT&&steps<10) {
      if(holding&&sim.time-lastInput>=(game.state.batchSize===3?.8:1/3))requestInput();
      feed.tick();sim.step(false);accumulator-=DT;steps++;
      if(sim.anomaly){pause();cover.hidden=false;$('cover-title').textContent='盤面を一時停止しました';$('cover-copy').textContent=sim.anomaly;$('start').hidden=true;$('start-new').hidden=false;break;}
    }
    if(steps)physicsMs=(performance.now()-start)/steps;
    if(steps===10)accumulator=Math.min(accumulator,DT);
    if(saveWanted||sim.time-lastSave>=4||now-lastSaveClock>=4000)void save();
  }
  view.overlay=theater.overlay;
  audio.update();
  const interval=game.state.quality==='low'?1000/30:0;
  if(now-lastDraw>=interval) {view.render(paused?1:Math.min(accumulator/DT,1));lastDraw=now;fpsFrames++;}
  if(now-fpsTime>1000){fps=fpsFrames*1000/(now-fpsTime);fpsFrames=0;fpsTime=now;}
  if(now-lastUI>90){updateUI();lastUI=now;}
}
void boot();
