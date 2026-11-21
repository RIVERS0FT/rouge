/**
 * ROUGE 数值总表：调整游戏平衡只改这个文件。
 *
 * 约定
 * - 时间单位是「天」：1 天 = 20 tick（DT = 0.05）。「每天」的数值每个 tick 乘以 DT 累加。
 * - 比例写成小数：0.15 表示 15%。
 * - 「系数」是乘数：1.2 表示提高 20%，0.85 表示降低 15%。
 * - 三个元素的数组对应建筑 1 / 2 / 3 级。
 *
 * 改完之后
 * - 规则、战斗内核（WASM，加载时读取，不用重新编译）、HUD、天赋描述和提示文字都直接读这里，
 *   不需要再改界面文字。测试也按这里的数值计算预期。
 * - 局域网对局比对这份表的指纹（BALANCE_ID）：数值不同的版本进不了同一个房间。
 * - 旧存档照常读取：超出新上限的数值（例如调低最大生命后的满血部队）会在读档时压到新上限。
 */
export const BALANCE = {
  /** 兵种基础属性。
   * hp 生命 · attack 每次攻击的伤害 · defense 防御（受到的伤害 × 100/(100+防御)）
   * attackSpeed 每天攻击次数 · splash 溅射半径（0 = 单体）· range 射程
   * train 训练一支部队需要的天数（地块产能为 1 时）· speed / seaSpeed 陆地 / 海上移动速度 */
  units: {
    infantry:       {hp:100, attack:14, defense:10, attackSpeed:1,    splash:0,   range:3.1, train:14, speed:1.2, seaSpeed:1.5},
    cavalry:        {hp:120, attack:24, defense:15, attackSpeed:0.8,  splash:0,   range:1.8, train:22, speed:2, seaSpeed:1.5},
    artillery:      {hp:80,  attack:40, defense:0,  attackSpeed:0.5,  splash:1.2, range:7.2, train:28, speed:0.9, seaSpeed:1.5},
    engineer:       {hp:100, attack:12, defense:10, attackSpeed:1,    splash:0,   range:2.6, train:18, speed:1.25, seaSpeed:1.5},
    skirmisher:     {hp:75,  attack:12, defense:0,  attackSpeed:1,    splash:0,   range:4.6, train:18, speed:1.5, seaSpeed:1.5},
    grenadier:      {hp:130, attack:18, defense:20, attackSpeed:0.8,  splash:0.7, range:2.3, train:24, speed:1.1, seaSpeed:1.5},
    heavyCavalry:   {hp:155, attack:30, defense:25, attackSpeed:0.65, splash:0,   range:1.6, train:32, speed:1.7, seaSpeed:1.5},
    horseArtillery: {hp:70,  attack:28, defense:0,  attackSpeed:0.55, splash:0.8, range:5.8, train:30, speed:1.4, seaSpeed:1.5},
  },

  /** 兵种升级（火力 / 生存 / 机动三项，各自计级）。 */
  upgrades: {
    maxLevel: 8,
    /** 第 n 次升级（n 从 0 开始）的价格 = floor(costBase × (n+1)^costExponent)：30、94、183、295… */
    costBase: 30,
    costExponent: 1.65,
    attackPerLevel: 2,
    healthPerLevel: 12,
    speedPerLevel: 0.08,
  },

  economy: {
    startingFunds: 184,
    /** 每个地块每天的基础收入。 */
    incomePerRegion: 0.75,
    /** 每次占领获得的资金。 */
    captureReward: 30,
    /** 新占领地块的恢复期（天）。 */
    recoveryDays: 15,
    /** 恢复期刚开始时，产出和收入减少的比例；之后线性回到 100%。 */
    recoveryLoss: 0.5,
  },

  /** 每个地块的部队名额和产能（每天的训练进度）。 */
  regions: {
    slots: 12,
    production: 1,
  },

  /** 建筑每级的造价和效果。第 3 级需要「工业基础」天赋。 */
  buildings: {
    /** 每天额外收入。 */
    market:   {costs:[54, 78, 110], benefits:[1, 2, 3.5]},
    /** 训练速度加成。 */
    barracks: {costs:[48, 72, 100], benefits:[0.25, 0.5, 1]},
    /** 敌方占领耗时加成。 */
    fortress: {costs:[44, 66, 95],  benefits:[0.25, 0.5, 1]},
  },

  /** 领袖等级：每升一级获得一次天赋选择。 */
  leader: {
    maxLevel: 8,
    /** 从 L 级升到 L+1 级需要 xpBase + L × xpPerLevel 经验。 */
    xpBase: 60,
    xpPerLevel: 45,
    captureXp: 50,
    killXp: 12,
  },

  /** 天赋重抽价格 = base + perLevel × max(0, 等级 − freeLevels) + perUse × 本局已重抽次数。 */
  reroll: {
    base: 30,
    perLevel: 10,
    freeLevels: 2,
    perUse: 15,
  },

  capture: {
    /** 1 倍速时完成占领需要的天数（占领进度上限）。 */
    days: 8,
    /** 没有进攻方时，进度每天回退多少。 */
    decayPerDay: 2,
    /** 有工兵在场时的占领速度系数。 */
    engineerSpeed: 1.5,
  },

  /** 胜利：控制这个比例的可玩地块并保持若干天，或消灭全部对手。 */
  victory: {
    share: 0.6,
    days: 30,
  },

  /** 开局时每个可玩地块（包括中立地块）的驻军数。 */
  start: {
    garrison: 5,
  },

  combat: {
    /** 溅射副目标默认承受的伤害比例。 */
    splashDamage: 0.35,
    /** 溅射副目标的数量（战斗内核最多支持 4 个）。 */
    splashTargets: 2,
    /** 所有减伤加起来的上限。 */
    maxDamageReduction: 0.75,
    /** 「受到的伤害提高」加起来的上限（例如被包围）。 */
    maxDamageIncrease: 0.5,
    /** 一个战局连续多少天没有交火就结束。 */
    battleQuietDays: 2,
  },

  ai: {
    /** AI 国家每隔几天行动一次。 */
    intervalDays: 4,
    /** 资金超过多少才升级兵种。 */
    upgradeAbove: 160,
    /** 地块驻军至少多少支才出兵。 */
    attackWith: 4,
  },

  /** 天赋数值。minLevel：从第几级起才会出现在候选中。 */
  talents: {
    industry:        {training: 1.2},                                     // 训练速度系数
    forcedMarch:     {speed: 1.2},                                        // 陆地速度系数
    entrenchment:    {damageReduction: 0.15},                             // 己方领土内减伤
    veterans:        {attack: 1.12},                                      // 攻击系数
    conqueror:       {captureSpeed: 1.3},                                 // 占领速度系数
    protectiveGear:  {defense: 8},                                        // 防御加值
    combatDrills:    {attackSpeed: 1.12},                                 // 攻击速度系数
    rangefinding:    {range: 1.1},                                        // 射程系数
    navalLogistics:  {seaSpeed: 1.25},                                    // 海上速度系数
    warSpoils:       {captureReward: 40},                                 // 占领奖励（代替 economy.captureReward）
    taxReform:       {income: 1.15},                                      // 领地收入系数
    publicWorks:     {cost: 0.85},                                        // 建筑费用系数
    rapidRecovery:   {duration: 0.75},                                    // 恢复期时长系数
    fieldMedicine:   {healPerDay: 0.03},                                  // 每天恢复最大生命的比例
    logistics:       {speed: 1.4},                                        // 前往己方地块时的陆地速度系数
    pressGang:       {units: 2},                                          // 每次占领免费生成的部队数
    fortify:         {level: 1},                                          // 占领的空地块获得的要塞等级（1–3）
    salvage:         {refund: 0.75},                                      // 返还建筑造价的比例
    tribute:         {share: 0.1, max: 80},                               // 夺取对方资金的比例和上限
    pursuit:         {damageBonus: 0.2, damageReduction: 0.15},
    bounty:          {funds: 3},                                          // 每次击杀获得的资金
    battleHardened:  {killXp: 24},                                        // 击杀经验（代替 leader.killXp）
    martyrs:         {training: 0.5},                                     // 每阵亡一支，返还一支部队训练进度的比例
    livingOffLand:   {plunder: 2, income: 0.6, minLevel: 4},              // 击杀与占领资金系数、领地收入系数
    massedRanks:     {minUnits: 8, damageReduction: 0.2},
    grandGarrison:   {capacity: 1.5, training: 0.85},                     // 名额系数、训练速度系数
    militia:         {training: 2},                                       // 被围攻时的训练速度系数
    shockAssault:    {assaultBonus: 0.25, garrisonPenalty: 0.1},          // 进攻中增伤、驻守时减少的伤害
    supplyColumns:   {healPerDay: 0.02},                                  // 行军中每天恢复最大生命的比例
    encirclement:    {damageTaken: 0.3, captureSpeed: 1.5, minNeighbors: 2, neighborShare: 0.5, minLevel: 4},
    treasury:        {interest: 0.01, max: 5},                            // 每天利息比例和上限
    warChest:        {per: 100, bonus: 0.03, max: 0.3},                   // 每满 per 资金增伤 bonus，最多 max
    levy:            {training: 1.5, cost: 5},                            // 训练速度系数、每支部队花费
    arsenal:         {cost: 0.7},                                         // 兵种升级费用系数
    mercantilism:    {income: 1.3, attack: 0.9},
    fortressDoctrine:{damageReduction: [0.25, 0.4, 0.5], cost: 0.7},      // 要塞地块减伤、要塞造价系数
    bastionGuns:     {damagePerDay: [0.04, 0.06, 0.08]},                  // 要塞内敌军每天损失最大生命的比例
    tradeRoutes:     {fundsPerMarket: 0.25},                              // 每座相邻集市每天带来的收入
    academy:         {xpPerDay: [0.5, 1, 1.5]},                           // 每座兵营每天产生的经验
    conscription:    {slots: [3, 6, 9]},                                  // 兵营增加的地块名额
    industrialBase:  {minLevel: 4},
    shieldWall:      {trainingTime: 0.75, capacity: 4, hp: 0.9},          // 训练时间系数、名额加值、最大生命系数
    pensions:        {funds: 5},                                          // 每阵亡一支获得的资金
    forwardMarksmen: {damageBonus: 0.4},                                  // 对行军中敌军增伤
    lightInfantry:   {speed: 1.15, damageReduction: 0.15},
    stormTroops:     {damageReduction: 0.2},
    grenadeVolley:   {splashDamage: 0.7},                                 // 溅射副目标承受的伤害比例
    charge:          {damageBonus: 0.35},
    cuirass:         {defense: 10, splashTaken: 0.4},                     // 作为溅射副目标时承受的伤害比例
    breakthrough:    {splash: 1, splashDamage: 0.5},                      // 溅射半径加值、副目标承受的伤害比例
    barrage:         {damageBonus: 0.4},                                  // 对驻守敌军增伤
    wideSalvo:       {splash: 1.25, targets: 4},                          // 溅射半径系数、副目标数量（最多 4）
    flyingBattery:   {damageReduction: 0.3},
    pointBlank:      {damageBonus: 0.5, range: 3},                        // 主目标在 range 距离内时增伤
    sappers:         {intervalDays: 10},                                  // 每隔几天免费升级一次建筑
    breachDrills:    {damageBonus: 0.25},
    armoredSappers:  {damageReduction: 0.25},
  },
} as const;

/** 数值指纹（自动计算，不用改）：局域网房间用它确认双方数值一致。 */
export const BALANCE_ID = fingerprint(JSON.stringify(BALANCE));

function fingerprint(text: string): string {
 let hash = 2166136261;
 for(let i = 0; i < text.length; i++) {hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619);}
 return (hash >>> 0).toString(16).padStart(8, '0');
}
