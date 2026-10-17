import { shuffledPlan,type DrawPlan,type DrawSnapshot } from './draw';
import type { Character } from './scripts';

export type RouteEffect='LIGHTHOUSE'|'SEA'|'WORKSHOP';
export const routeInfo:Record<RouteEffect,{route:number;short:string;color:string;benefit:string}>={
 LIGHTHOUSE:{route:0,short:'灯台',color:'#f5cf79',benefit:'JPマス＋1'},
 SEA:{route:1,short:'海路',color:'#92d5eb',benefit:'改装の上限＋1球'},
 WORKSHOP:{route:2,short:'工房',color:'#a5d5b5',benefit:'補強1個・所持済みなら10枚'},
};
export function makeRoutePlan(next:()=>number):DrawPlan<RouteEffect>{
 // Rotate the tenth hole across routes, then shuffle independently of launch.
 const labels:RouteEffect[]=['LIGHTHOUSE','SEA','WORKSHOP'];
 return shuffledPlan([...labels,...labels,...labels,labels[Math.floor(next()*3)]],next);
}

export type UpgradeEffect='LIGHT'|'BEACON'|'WIND'|'SHIELD'|'CARGO'|'DEPART';
export const upgradeInfo:Record<UpgradeEffect,{label:string;symbol:string;color:string;who:Character}>={
 LIGHT:{label:'灯りがともる · JP＋1',symbol:'JP+1',color:'#efd38a',who:'nagi'},
 BEACON:{label:'大灯台が点灯 · JP＋2',symbol:'JP+2',color:'#ffd867',who:'nagi'},
 WIND:{label:'突風 · JP−1',symbol:'−1',color:'#a7b7d9',who:'mina'},
 SHIELD:{label:'ガロの補強 · 減少を1回防ぐ',symbol:'盾',color:'#a4ccb4',who:'garo'},
 CARGO:{label:'積荷発見 · 盤面へ10枚',symbol:'10',color:'#b6d8df',who:'mina'},
 DEPART:{label:'出航 · 最終抽選へ',symbol:'出航',color:'#f1b59d',who:'mina'},
};
export type JPItems={lights:number;charts:number;shields:number};
export type UpgradeAttempt={plan:DrawPlan<UpgradeEffect>;drawSave?:DrawSnapshot;pocket?:number;resolvedAt?:number};
export type JPRefit={
 slots:number;shield:boolean;maxBalls:number;attempts:UpgradeAttempt[];
 phase:'refit'|'choice'|'final';decisionAt?:number;finalAt?:number;
 message:string;who:Character;
};
export function makeUpgradePlan(next:()=>number):DrawPlan<UpgradeEffect>{
 return shuffledPlan<UpgradeEffect>(['LIGHT','LIGHT','LIGHT','BEACON','WIND','WIND','SHIELD','CARGO','CARGO','DEPART'],next);
}
export const REFIT_CHOICE_SECONDS=8;
export const REFIT_BRIDGE_SECONDS=2.4;
