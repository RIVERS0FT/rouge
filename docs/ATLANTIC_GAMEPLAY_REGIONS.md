# 大西洋历史州区

Rouge 的原始海岸和行政面仍采用仓库内固定的 Natural Earth 5.1.1（1:10m Admin 1）数据。《维多利亚 3》的州区代码与显示名称仅用于核对归组；不发布其地图几何、历史归属或路线。构建验证依据仓库已有的 [1.13.7 州区审计](../data/state-regions-audit.json)，再以 [1.15.1 州区目录](https://vic3tabula.com/en/states) 和[原版简中州区本地化镜像](https://github.com/tjysdsg/Victoria-3-files/blob/0e8b62590c36bc9fdd2c8cba3cb5dda255092656/game/localization/simp_chinese/map/states_l_simp_chinese.yml)核对名称与范围。

[归组清单](../data/atlantic-gameplay-regions.json)将本批 54 个既有游戏地块合并或统一名称为 19 个州区。全球 830 → 795，791 个可玩；全部 4596 个原始行政要素保留。

| 州区 | Victoria 3 参考代码 | 旧地块 → 新州区 | 原始行政要素 |
|---|---|---:|---:|
| 西印度群岛 / West Indies | `STATE_WEST_INDIES` | 21 → 1 | 116 |
| 巴哈马 / Bahamas | `STATE_BAHAMAS` | 2 → 1 | 36 |
| 牙买加 / Jamaica | `STATE_JAMAICA` | 3 → 1 | 15 |
| 古巴西部 / Western Cuba | `STATE_WESTERN_CUBA` | 2 → 1 | 6 |
| 古巴中部 / Central Cuba | `STATE_CENTRAL_CUBA` | 1 → 1 | 5 |
| 古巴东部 / Eastern Cuba | `STATE_EASTERN_CUBA` | 1 → 1 | 5 |
| 海地 / Haiti | `STATE_HAITI` | 2 → 1 | 10 |
| 圣多明各 / Santo Domingo | `STATE_SANTO_DOMINGO` | 2 → 1 | 32 |
| 波多黎各 / Puerto Rico | `STATE_PUERTO_RICO` | 1 → 1 | 1 |
| 百慕大 / Bermuda | `STATE_BERMUDA` | 1 → 1 | 11 |
| 格陵兰 / Greenland | `STATE_GREENLAND` | 1 → 1 | 5 |
| 冰岛 / Iceland | `STATE_ICELAND` | 2 → 1 | 10 |
| 纽芬兰 / Newfoundland | `STATE_NEWFOUNDLAND` | 2 → 1 | 3 |
| 亚速尔 / Azores | `STATE_AZORES` | 1 → 1 | 1 |
| 马德拉 / Madeira | `STATE_MADEIRA` | 1 → 1 | 1 |
| 加那利群岛 / Canary Islands | `STATE_CANARY_ISLANDS` | 2 → 1 | 2 |
| 佛得角 / Cape Verde | `STATE_CAPE_VERDE` | 1 → 1 | 22 |
| 南喀麦隆 / South Cameroon | `STATE_SOUTH_CAMEROON` | 4 → 1 | 7 |
| 南大西洋群岛 / South Atlantic Islands | `STATE_SOUTH_ATLANTIC_ISLANDS` | 4 → 1 | 4 |

## 细节与取舍

- 西印度群岛整合小安的列斯群岛多个现有游戏地块，含特立尼达和多巴哥及玛格丽塔岛；保留原国别标签。圣巴泰勒米未在参考图单独画出，作为相邻小岛保留在该组；不挪动跨岛的委内瑞拉联邦属地。特克斯和凯科斯并入巴哈马；开曼并入牙买加。海地与圣多明各、古巴东中西仍分别管理。
- 法罗群岛并入「冰岛」，圣皮埃尔和密克隆并入「纽芬兰」，圣多美、普林西比和比奥科归入「南喀麦隆」。归组只改变 Rouge 的游戏管理边界，不表示现实中相关地区的主权或隶属。
- 南大西洋群岛纳入福克兰（马尔维纳斯）群岛、南乔治亚和南桑威奇群岛、圣赫勒拿及阿森松；参考未明确包含特里斯坦-达库尼亚，后者独立。
- 沿用固定参考州区名「Puerto Rico」，同时支持 1.15.1 目录写法「Porto Rico」检索；皮图菲克留作独立不可玩项，不并入格陵兰。未用海峡填陆，也未增加物理陆路。

本版采用 v22 地图、v23 存档命名空间和 v36 联机规则。旧存档保留，不迁移也不删除。
