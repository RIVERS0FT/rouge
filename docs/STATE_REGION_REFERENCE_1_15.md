# 州区参考 1.15.1：堪察加，地图 v5

《维多利亚 3》1.15.1 的参考清单包含 676 个陆地**固定州区**，不是按开局归属拆出的州，也不是 Rouge 地块数。[版本名录](https://vic3tabula.com/en/states)用于核对州区键；[Paradox 1.15 发布日志](https://store.steampowered.com/news/app/529340/view/680766201707627231)用于核对实际改区。Rouge 的地图几何仍全部来自 Natural Earth 5.1.1 的完整 Admin 1 元素，不导入该游戏的图形、坐标或边界，也不把参考清单整表加入仓库。

以稳定的 `STATE_*` 键比较历史 1.13.7 参考与 1.15.1 名录：

- 671 个键相同；5 个新见键是 `STATE_KOSTROMA`、`STATE_LITHUANIA`、`STATE_SARATOV`、`STATE_TULA`、`STATE_VOLOGDA`。
- 4 个旧键不再出现：`STATE_CHUKOTKA`、`STATE_GALICH`、`STATE_KAUNAS`、`STATE_TARTARIA`。
- 相同键中，111 项英文显示文本不同；忽略大小写、重音、空白和标点后，仍有 73 项文本差异。这是两份参考的名称对比（含旧转换名），不是 111 项官方改名，不能从键相同或名称相同推断形状不变。清单序号不作为地图 ID。

### 已落地的合并

官方日志确认楚科奇并入堪察加，现行清单保留 `STATE_KAMCHATKA`。原 Rouge 版本的楚科奇（`RUS-2321`）和堪察加（`RUS-3468`）恰好各为一个完整地区，同属俄罗斯标签且在镜头裁剪内仍共享真实陆地边。历史数值重叠审计分别把这两个完整 Admin 1 元素归于 `STATE_CHUKOTKA` 与 `STATE_KAMCHATKA`。只将这两个完整元素合成一个锁定地块，名称显示“堪察加”，两边的原 ID 仍能检索同一地区，不再独立选择。其他 v4 分组全部保留，包括拜科努尔显式合并。合并边界是自然地理范围的近似，不宣称复刻 1.15.1 原版轮廓。

图卢的旧州拆为图卢、奥廖尔，科斯特罗马从雅罗斯拉夫尔和下诺夫哥罗德旧州划出，以及北哈萨克斯坦的调整均不能用一份名称清单确定完整自然地块的归属。立陶宛等新旧键的对应也未单凭名称调整。不猜边界、不拆现代原子、不以 676 强行凑数。

### 兼容与复现

全图 1,154 → 1,153 块，可玩 1,150 → 1,149 块，原始元素仍有 4,596 个，验证过的出生点仍为 648。相同玩家及 AI 数量下，新局少五名初始中立守军；这一项合并不是帧率提升的承诺。

游戏版本 `0.8.3`，地图 ID `earth-natural-earth-admin1-511-regions-v5`，存档前缀 `rouge.save.natural-earth-admin1.regions.v5.`，联机规则 `admin1-locked-game-regions-v14`。旧存档保留但需要新建战役；联机双方需要同版。

`data/state-region-1.15.1-overrides.json` 只保存这条经过复核的合并和双语显示名。`npm run prepare:map` 先应用原 v4 决策，再验证旧参考键、确切成员、原始邻接和完整覆盖，离线生成运行地图。变更后用 `node --experimental-strip-types scripts/build-spawn-sites.mjs` 重建实际出生点。
