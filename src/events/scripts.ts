import type { Result } from '../config';
export type Character='nagi'|'mina'|'garo';
export type Pose='normal'|'surprise'|'joy'|'sad';
export type Cut={bg:string;who:Character;pose:Pose;text:string};
export const names={nagi:'ナギ',mina:'ミナ',garo:'ガロ'};
const c=(bg:string,who:Character,text:string,pose:Pose='normal'):Cut=>({bg,who,pose,text});
// Keep short-lived result lines brief; voice guidance is in docs/DIALOGUE_DIRECTION.md.
export const idle:Cut[][]=[
 [c('bg02','nagi','灯台まで近道を見つけた！'),c('bg02','mina','その線をたどると海に飛び込むけど？'),c('bg02','nagi','泳げば近道にはなるよね？','surprise'),c('bg02','mina','手紙を濡らしたら配達にならないでしょ。')],
 [c('bg04','garo','この音が消えれば修理は終わりだ。'),c('bg04','nagi','さっきから鳴ってるのは僕のお腹だよ。'),c('bg04','mina','そっちは朝ごはんで直してきて。'),c('bg04','garo','なら工具はいらんな。飯にするか。','joy')],
 [c('bg02','mina','今日の配達は食堂から回るわよ。'),c('bg02','nagi','焼きたてのパンが目当てでしょ。'),c('bg02','mina','冷める前に届けるのも仕事のうち。'),c('bg02','nagi','届けるのは手紙でしょ？','surprise')],
 [c('bg01','nagi','鞄が軽い！ どこかに落とした！？','surprise'),c('bg01','garo','最後の一通まで届けた。俺も見てたぞ。'),c('bg01','nagi','そっか。帰り道ってこんなに軽いんだ！','joy')],
 [c('bg02','nagi','次は「おにぎり島」へ出発！'),c('bg02','mina','それは昼ごはんのメモ。宛先は裏よ。'),c('bg02','nagi','梅干し岬もないんだね。'),c('bg02','mina','あったら真っ先に覚えそうね。','joy')],
 [c('bg03','garo','船は直した。明日も一番に出せるぞ。'),c('bg03','nagi','じゃあ今日の最後の一通を届けてくる！'),c('bg03','mina','帰りも一番でお願い。夕飯が冷めるわよ。')],
];
export const intro=[c('bg02','nagi','僕ら宛ての便だ！ 何が届いたかな？'),c('bg02','mina','差出人より中身が気になる顔ね。'),c('bg02','nagi','それじゃ開けるよ！','surprise')];
export const jpIntro=[c('bg05','garo','よし通せ。ドックは俺が仕上げた。'),c('bg05','mina','どの航路を選ぶかは球に任せましょ。'),c('bg05','nagi','さあ行ってこい！ 最後まで見てるよ。')];
export const outcome:Record<Result,Cut[]>={
 NONE:[c('bg02','nagi','あちゃ、空っぽだ！','sad'),c('bg02','mina','次は中身も頼むわよ。')],
 FIELD_5:[c('bg02','nagi','5枚でも押す力になるぞ！','joy')],
 CREDIT_10:[c('bg03','nagi','10枚来るぞ！ 奥まで届け！','joy'),c('bg03','garo','奥へ送る役は任せとけ。')],
 BALL_1:[c('bg03','mina','ボール便を追加！ 手前まで連れてきて。','joy')],
 TOWER_STANDARD:[c('bg04','garo','積んでおいたぞ。崩しがいがあるだろ？','joy'),c('bg04','nagi','まだ上がるの！？ 押し切ってみせる！','surprise')],
 JPC_ENTRY:[c('bg05','mina','特別便に乗れるわよ！ 支度はいい？','surprise'),c('bg05','garo','待たせんな。もうドックは開けてある。')],
 FIELD_30:[c('bg03','mina','30枚を運ぶわよ！ 受け取りよろしく！','joy'),c('bg03','nagi','このひと押しで前まで届け！','joy')],
 JACKPOT:[c('bg06','mina','入った！ 港じゅうに知らせてくる！','joy'),c('bg06','garo','全部運び出すぞ。今日は忙しくなるな！','joy')],
 JACKPOT_DIRECT:[c('bg06','nagi','いきなり特別便！？ 僕らの荷物！？','surprise'),c('bg06','mina','そうよ！ ぼんやりしてる暇はないわ！','joy')],
};
export const diaries: {title:string;cuts:Cut[]}[]=[
 {title:'船の名前',cuts:[c('bg04','garo','最後にこの看板を船へ取り付けてくれ。'),c('bg04','nagi','塗り直したんだ！ 新しい名前にするの？'),c('bg07','nagi','あれ、前と同じ名前が書いてある。'),c('bg07','mina','この名前で帰ってくるのを待ってる人がいるの。'),c('bg07','garo','直したのは船だ。思い出まで替えることはない。'),c('bg07','nagi','それなら一番よく見えるところに付けよう！','joy')]},
 {title:'雨の日の一番乗り',cuts:[c('bg02','mina','食堂が今日から開くって！ お祝いを運ぶわよ。','joy'),c('bg02','nagi','花束は僕の上着で包もう。これなら濡れない。'),c('bg08','nagi','僕のほうはすっかりびしょ濡れだけどね。','sad'),c('bg08','mina','焼きたての匂いがする！ ほら急いで！'),c('bg08','nagi','僕らを見て扉を開けてくれたよ！','joy'),c('bg08','mina','一番のお客さんには大盛りをお願い！','joy'),c('bg08','garo','注文の前に花を渡してやれ。')]},
 {title:'岬への手紙',cuts:[c('bg02','garo','古い住所だったが届け先が見つかったぞ。'),c('bg02','nagi','岬の家だね。今度こそ迷わず行ける！'),c('bg09','mina','あの人は毎朝ここから郵便船を探してたんだって。'),c('bg09','nagi','じゃあ今日は船より先に僕らを見つけてもらおう。'),c('bg09','nagi','こんにちは！ あなたへのお手紙を届けに来ました！'),c('bg09','mina','あんなに振ったら手が疲れちゃうわよ。','joy'),c('bg09','garo','好きなだけ振っとけ。待ってた分があるんだ。')]},
];
export function at(cuts:Cut[],time:number,seconds=2.7){return cuts[Math.min(cuts.length-1,Math.max(0,Math.floor(time/seconds)))];}
