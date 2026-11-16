# 印度洋历史州区

以仓库固定的《维多利亚 3》1.13.7 州区为地理参照，核对 [Vic3 Tabula 现行州区目录](https://vic3tabula.com/en/states) 和[原版简体中文本地化镜像](https://github.com/tjysdsg/Victoria-3-files/blob/0e8b62590c36bc9fdd2c8cba3cb5dda255092656/game/localization/simp_chinese/map/states_l_simp_chinese.yml)。当前目录用于核对名称，不替换历史几何参照；固定版本和来源见[参照审计](../data/state-regions-audit.json)。运行时地块仍全由 Natural Earth 5.1.1、1:10m Admin 1 完整源要素组成；不使用《维多利亚 3》的像素地图、历史政权、陆海数据或几何。

[合并清单](../data/indian-ocean-gameplay-regions.json) 将 13 个现有游戏地块归为 6 个州区，全球游戏地块 837 → 830，826 个可玩。之前的岛名和原始行政代码仍可检索。

| 州区 | 引用 ID | 原游戏地块 → 州区 | 原始行政要素 |
|---|---|---:|---:|
| 北马达加斯加 / North Madagascar | `STATE_NORTH_MADAGASCAR` | 1 → 1 | 12 |
| 南马达加斯加 / South Madagascar | `STATE_SOUTH_MADAGASCAR` | 3 → 1 | 14 |
| 印度洋领地 / Indian Ocean Territory | `STATE_INDIAN_OCEAN_TERRITORY` | 2 → 1 | 17 |
| 锡兰 / Ceylon | `STATE_CEYLON` | 3 → 1 | 47 |
| 桑给巴尔 / Zanzibar | `STATE_ZANZIBAR` | 2 → 1 | 5 |
| 勃固 / Pegu | `STATE_PEGU` | 2 → 1 | 5 |

## 归并范围与边界取舍

- 马达加斯加仍以既有北部和南部游戏地块为基础。科摩罗（包括原有科摩罗地块内的岛屿）与马约特归南马达加斯加；不为重合率较低的现代行政区切割或重画南北边界。
- 毛里求斯与留尼汪归印度洋领地。罗德里格斯、阿加莱加在 Natural Earth 中不是本次可以独立迁移的游戏地块，保留既有毛里求斯要素。
- 斯里兰卡、马尔代夫与查戈斯群岛归锡兰；原有马尔代夫 21 个原始行政要素和环礁检索词保留。安达曼和尼科巴群岛归勃固，但与大陆之间仍必须走水路。
- 桑给巴尔与奔巴岛整合为桑给巴尔州区。马菲亚岛的原始行政要素与非洲大陆属同一完整现代行政区，本次不切开。
- 塞舌尔现有一块锁定游戏地块保留：外围岛屿与参照不能可靠地逐一归于同一州区，不能用单一归并覆盖。索科特拉仍在也门现有游戏地块。科科斯群岛、圣诞岛和缺少可靠对应的南印度洋离岛维持原状。

地图分组只改变一个玩家可管理和占领的地块边界，不改变原始行政要素的地理标签、海岸或陆海寻路，不会产生陆桥。版本 v0.25.38 使用 v21 地图、v22 存档、v35 局域网规则，旧档留在原命名空间中。
