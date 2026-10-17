// Exact finite-state expectation for the published refit strategy.
// This is an ex-ante probability, not a claim of equal physical pocket frequency.
const memo=new Map<string,number>();
function chance(slots:number,shield:boolean,balls:number,continuePlay=true):number{
 if(balls===0||slots===5)return slots/10;
 const key=[slots,shield,balls,continuePlay].join(':');if(memo.has(key))return memo.get(key)!;
 const left=continuePlay?balls-1:0;
 const value=.3*chance(Math.min(5,slots+1),shield,left)+.1*chance(Math.min(5,slots+2),shield,left)+
 .2*chance(shield?slots:Math.max(1,slots-1),false,left)+.1*chance(slots,true,left)+
 .2*chance(slots,shield,left)+.1*slots/10;
 memo.set(key,value);return value;
}
for(const strategy of [true,false]){
 const rows=[['灯台',chance(2,false,3,strategy)],['海路',chance(1,false,4,strategy)],['工房',chance(1,true,3,strategy)]] as const;
 console.log(strategy?'5枠まで継続':'1球後に出航');
 for(const [name,p] of rows)console.log(name,(p*100).toFixed(3)+'%');
 console.log('航路決定前の平均',(rows.reduce((sum,[,p])=>sum+p,0)/3*100).toFixed(3)+'%');
}
