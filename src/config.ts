// One simulation/render unit is one 25 mm medal diameter. Scaling gravity
// consistently avoids poorly conditioned millimetre-thick collision shapes.
export const METRES_PER_UNIT = 0.025;
export const D = 1;
export const THICKNESS = 0.072;
export const DT = 1 / 240;
export const CAPACITY = 900;
export const INITIAL_COINS = 460;
export const MINI_BALL_RADIUS = .32;
export const MINI_BALL_LIMIT = 6;
export const REWARD_SHOOTER = { x: -6.35, y: 2.35, z: 16.65, interval: .18 };
export const LIMIT = 17 * Math.PI / 180;
export const PUSHER_PERIOD = 2;
export const PUSHER_CENTER = 11.4;
export const PUSHER_HALF_STROKE = .9;
export const FEED_INTERVAL = .24;
export const RAIL_TRAVEL_TIME = .95;
export const AUTO_WINDOW = .08;
export const SAVE_VERSION = 1;
export const ENGINE_VERSION = 'rapier-0.19.3-diameter-units-240hz';
export const TOWER = { x: 4.75, z: 7.5, size: 120, half: 1.5 };
export type Result = 'NONE' | 'CREDIT_10' | 'BALL_1' | 'TOWER_STANDARD' | 'JPC_ENTRY' | 'JACKPOT_DIRECT' | 'FIELD_30' | 'JACKPOT';
export const NORMAL: readonly [Result, number][] = [
  ['NONE', 40], ['CREDIT_10', 35], ['BALL_1', 18],
  ['TOWER_STANDARD', 4], ['JPC_ENTRY', 2], ['JACKPOT_DIRECT', 1],
];
export const JPC: readonly [Result, number][] = [['CREDIT_10', 70], ['FIELD_30', 20], ['JACKPOT', 10]];
export const RESULT_LABELS: Record<Result, { title: string; detail: string }> = {
  NONE: { title: '次のチャンスへ', detail: 'メダルを落として、もう一度。' },
  CREDIT_10: { title: '10枚を払い出し', detail: '上段左横から盤面へ。手前へ落として獲得。' },
  BALL_1: { title: 'ボール追加', detail: '奥の供給口から、盤面へ。' },
  TOWER_STANDARD: { title: 'コインタワー', detail: '120枚のタワーを準備しています。' },
  JPC_ENTRY: { title: 'ジャックポットチャンス', detail: '大量のメダルを狙う抽選へ。' },
  JACKPOT_DIRECT: { title: 'JACKPOT', detail: '300枚のメダルを盤面へ払い出します。' },
  FIELD_30: { title: '30枚を払い出し', detail: '上段左横から奥側へ順番に射出します。' },
  JACKPOT: { title: 'JACKPOT', detail: '300枚のメダルを盤面へ払い出します。' },
};
