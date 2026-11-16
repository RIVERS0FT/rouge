# 太平洋历史州区

Rouge 的海岸、行政面和地形仍全部来自仓库内固定的 Natural Earth 5.1.1（1:10m Admin 1）。《维多利亚 3》只提供哪些岛屿共属一个州区以及州区的显示名称，不向运行时导入其地图、像素、国界、历史归属或路径。参考是仓库固定的 1.13.7 州区目录；源版本和逐文件摘要见 [州区参考审计](../data/state-regions-audit.json)。另用 [Vic3 Tabula 的 1.15.1 州区目录](https://vic3tabula.com/en/states) 核对现行州区名称，用[原版简体中文本地化文件的镜像](https://github.com/tjysdsg/Victoria-3-files/blob/0e8b62590c36bc9fdd2c8cba3cb5dda255092656/game/localization/simp_chinese/map/states_l_simp_chinese.yml)核对简中显示名称；两者都不替换仓库固定的地理参考基线。旧州区与现代行政单元边界不完全一致，本次不切割或重绘既有地块。

按 [明确列出的既有游戏地块和原始行政要素](../data/pacific-gameplay-regions.json) 应用更改：61 个既有游戏地块归为 14 个，净减 47；全球 884 → 837，833 个可玩。其余游戏地块维持原状。先前的地块别名、岛名和原始行政代码仍可定位至归并后的结果。

| 州区 | 引用 ID | 原游戏地块 → 州区 | 原始行政要素 |
|---|---|---:|---:|
| 夏威夷群岛 / Hawaiian Islands | `STATE_HAWAIIAN_ISLANDS` | 1 → 1 | 1 |
| 西密克罗尼西亚 / West Micronesia | `STATE_WEST_MICRONESIA` | 3 → 1 | 21 |
| 东密克罗尼西亚 / East Micronesia | `STATE_EAST_MICRONESIA` | 4 → 1 | 4 |
| 瑙鲁 / Nauru | `STATE_NAURU` | 1 → 1 | 14 |
| 东新几内亚 / Eastern New Guinea | `STATE_EASTERN_NEW_GUINEA` | 4 → 1 | 19 |
| 布干维尔 / Bougainville | `STATE_BOUGAINVILLE` | 1 → 1 | 1 |
| 所罗门群岛 / Solomon Islands | `STATE_SOLOMON_ISLANDS` | 8 → 1 | 9 |
| 瓦努阿图 / Vanuatu | `STATE_VANUATU` | 7 → 1 | 7 |
| 卡纳克 / Kanak | `STATE_KANAK` | 2 → 1 | 3 |
| 斐济 / Fiji | `STATE_FIJI` | 4 → 1 | 5 |
| 汤加 / Tonga | `STATE_TONGA` | 15 → 1 | 26 |
| 塔希提 / Tahiti | `STATE_TAHITI` | 6 → 1 | 6 |
| 北岛 / North Island | `STATE_NORTH_ISLAND` | 2 → 1 | 10 |
| 南岛 / South Island | `STATE_SOUTH_ISLAND` | 3 → 1 | 8 |

## 细节与取舍

- 西密克罗尼西亚整合帕劳、关岛、北马里亚纳群岛；东密克罗尼西亚整合选定的马绍尔群岛、图瓦卢和威克岛。已锁定为一块的密克罗尼西亚联邦及库克群岛横跨或不能可靠对应到单个参考州区，保留原游戏地块。基里巴斯现有地块亦不作猜测归并。
- 布干维尔与东新几内亚维持两个州区；现代所罗门群岛的泰莫图按参考归瓦努阿图。罗图马保留其在 Natural Earth 斐济原始行政区中的归属，不切分源单元。
- 萨摩亚、美属萨摩亚、纽埃、瓦利斯和富图纳、托克劳纳入汤加州区；法属波利尼西亚与皮特凯恩诸岛纳入塔希提州区。新西兰查塔姆群岛归北岛，奥克兰群岛归南岛。
- 合并后的群岛仍是多个独立自然地块，只在行政分组中共享选择、生产和占领。游戏不会因州区横跨海峡而添加陆路，原始国别标签和海陆路径亦不变。

本版使用 v20 地图、v21 存档、v34 局域网规则。旧档留在原存档命名空间内，不迁移也不删除。
