import type { Result } from '../config';
export type Character='nagi'|'mina'|'garo';
export type Pose='normal'|'surprise'|'joy'|'sad';
export type Cut={bg:string;who:Character;pose:Pose;text:string};
export const names={nagi:'ナギ',mina:'ミナ',garo:'ガロ'};
const c=(bg:string,who:Character,text:string,pose:Pose='normal'):Cut=>({bg,who,pose,text});
export const idle:Cut[][]=[
 [c('bg02','nagi','灯台まで、すぐだね。'),c('bg02','mina','地図、逆さま。'),c('bg02','nagi','……遠くなった。','surprise'),c('bg02','mina','距離は変わらないよ。')],
 [c('bg04','garo','あと一か所。'),c('bg04','nagi','直った？'),c('bg04','mina','さっきも聞いた。'),c('bg04','garo','今、終わった。','joy')],
 [c('bg02','mina','今日の食堂、何かな。'),c('bg02','nagi','まだ朝だよ。'),c('bg02','mina','配達順を考えてるの。'),c('bg02','nagi','食堂が一番だ。','surprise')],
 [c('bg01','nagi','あれ、手紙がない。','sad'),c('bg01','garo','全部、届けた。'),c('bg01','nagi','じゃあ、今日は満点だ！','joy')],
 [c('bg02','nagi','これ、何島？'),c('bg02','mina','わたしの字。'),c('bg02','nagi','……何島？'),c('bg02','mina','ちょっと待って。','surprise')],
 [c('bg03','garo','明日の便も、出せる。'),c('bg03','nagi','じゃあ、最後の一通。'),c('bg03','mina','今度は寄り道なしね。')],
];
export const intro=[c('bg02','nagi','次の伝票、届いたよ。'),c('bg02','mina','どの便に乗るかな。'),c('bg02','nagi','せーの！','surprise')];
export const jpIntro=[c('bg05','garo','ゲート、開いた。'),c('bg05','mina','どの便に乗るかな。'),c('bg05','nagi','最後まで、見てよう。')];
export const outcome:Record<Result,Cut[]>={
 NONE:[c('bg02','nagi','今回は、空便かあ。','sad'),c('bg02','mina','次の便、待とう。')],
 FIELD_5:[c('bg02','nagi','小さな便も、大事だね。','joy')],
 CREDIT_10:[c('bg03','nagi','左から来るよ。受け取ろう！','joy'),c('bg03','garo','奥へ、送るぞ。')],
 BALL_1:[c('bg03','mina','カプセル便、追加！','joy')],
 TOWER_STANDARD:[c('bg04','garo','まとめ荷、運ぶぞ。','joy'),c('bg04','nagi','搬入口が空いたら、お願い！')],
 JPC_ENTRY:[c('bg05','mina','特別便の伝票だ！','surprise'),c('bg05','garo','ドックを開ける。')],
 FIELD_30:[c('bg03','mina','通常便、出港！','joy'),c('bg03','nagi','荷物、運んでくる！','joy')],
 JACKPOT:[c('bg06','mina','特別便、出港！','joy'),c('bg06','garo','積み込み、始めるぞ。','joy')],
 JACKPOT_DIRECT:[c('bg06','nagi','えっ、特別便！？','surprise'),c('bg06','mina','特別便、出港！','joy')],
};
export const diaries: {title:string;cuts:Cut[]}[]=[
 {title:'船の名前',cuts:[c('bg04','garo','修理の仕上げだ。届けてくれ。'),c('bg04','nagi','これ、船の名前？'),c('bg07','nagi','新しい名前にするのかな。'),c('bg07','mina','同じ名前だよ。ずっと前から。'),c('bg07','garo','名前は、替えなくていい。'),c('bg07','nagi','うん。また走れるんだね。','joy')]},
 {title:'雨の日の一番乗り',cuts:[c('bg02','mina','食堂、今日からだって！','joy'),c('bg02','nagi','お祝い、濡らさず届けよう。'),c('bg08','nagi','雨、止まないね。','sad'),c('bg08','mina','でも、いい匂いはする。'),c('bg08','nagi','明かり、ついた！','joy'),c('bg08','mina','一番乗り、いただき！','joy'),c('bg08','garo','配達が先だ。')]},
 {title:'岬への手紙',cuts:[c('bg02','garo','宛先が、やっと分かった。'),c('bg02','nagi','岬の、あの家だ。'),c('bg09','mina','毎朝、港を見てたんだって。'),c('bg09','nagi','この便を、待ってたのかな。'),c('bg09','nagi','お待たせしました。'),c('bg09','mina','……届いて、よかったね。','joy'),c('bg09','garo','明日も、便を出そう。')]},
];
export function at(cuts:Cut[],time:number,seconds=2.7){return cuts[Math.min(cuts.length-1,Math.max(0,Math.floor(time/seconds)))];}
