import type { Ticket } from '../game';
export const routes=[
 {name:'灯台',who:'nagi',bg:'bg01',steps:['荷札を確認','坂道を越える','灯台へ配達'],lines:['灯台の荷物だ。出発！','風が強いね。荷物をしっかり！','最後の坂、いくよ！']},
 {name:'海路',who:'mina',bg:'bg03',steps:['船を探す','航路を確認','港へ到着'],lines:['海の便は、わたしに任せて。','波が来るよ。タイミングを合わせて！','港が見えた！ あと少し！']},
 {name:'工房',who:'garo',bg:'bg04',steps:['部品を選ぶ','歯車を合わせる','エンジン始動'],lines:['次の便までに、仕上げるぞ。','二つ目、かみ合った。','さあ、エンジンをかけよう。']},
] as const;
export function revealTime(a:Ticket){return a.kind==='station'?10.8:8.4;}
export function stops(a:Ticket){return a.kind==='station'?[3,6.2,10.8]:[2.4,4.2,8.4];}
const symbols={NONE:'便',FIELD_5:'小包',CREDIT_10:'封筒',BALL_1:'球',TOWER_STANDARD:'塔',JPC_ENTRY:'挑戦',JACKPOT_DIRECT:'JP',FIELD_30:'船',JACKPOT:'JP'};
export function reelLabels(a:Ticket){const end=a.result==='NONE'?['小包','封筒','球','塔','挑戦','JP'][a.id%6]:symbols[a.result??'NONE'],times=stops(a),spins=['封筒','小包','球','塔','船'];return times.map((t,i)=>a.elapsed<t?spins[(Math.floor(a.elapsed*9)+i*2+a.id)%spins.length]:a.result==='NONE'&&i===2?'波':end);}
export function progressPhase(a:Ticket){if(a.kind==='mini')return a.stampApplied?'スタンプを記録':'配達先選択・同じ航路3個で挑戦';if(a.applied)return '配達結果';if(a.qualifier&&a.qualifier.pocket===undefined)return a.refit?'1 / 3 航路ボール抽選':'1 / 2 航路ボール抽選';if(a.refit&&a.refit.phase!=='final')return `2 / 3 改装チャレンジ · ${a.refit.attempts.length}/${a.refit.maxBalls}球`;if(a.qualifier&&a.elapsed<(a.qualifier.resolvedAt??a.elapsed)+2.4)return '航路確定・ゲートの準備';if(a.physical)return a.refit?'3 / 3 ジャックポット抽選':'2 / 2 ジャックポット抽選';const i=stops(a).filter(t=>a.elapsed>=t).length;return a.kind==='station'?`${routes[a.route??0].name}チャレンジ・${routes[a.route??0].steps[Math.min(i,2)]}`:['受付・予告','左リール停止','リーチ・配達チャレンジ','配達結果'][i];}
