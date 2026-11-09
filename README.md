# ROUGE · 诸省之争

基于 React 与 Three.js 的领土地块征服策略游戏。

## 在线试玩

**[打开游戏：https://rivers0ft.github.io/rouge/](https://rivers0ft.github.io/rouge/)**

当前版本：**v0.5.0**。网站随 `main` 中通过检查的压缩合并提交自动发布，实际发布源码以 `build-info.json` 和 Pages 工作流验收结果为准。

- 全球 675 个陆地管理地块，不显示现实国家、国旗或独立国界图层。
- 可以向非相邻地块下令，沿连续陆路逐段推进，遇敌先战斗、占领。
- 每地块每阵营最多 12 个兵团；没有玩家总量或全场兵团总量上限。
- 保留领袖、升级、肉鸽天赋、多存档、中英文界面、米勒地图和全屏 HUD。

### 网页版限制与存档

GitHub Pages 不包含 Node.js 联机服务器；局域网入口不能直接在此站建房。Steam / Epic 与最终写实资源尚未实现。海运现已通过合法沿海港口及保守避陆航路实现，详见 [海运规则](docs/SEA_TRANSPORT.md)。

v0.5.0 使用新地图和 GameState v5，需要新建战役。旧 v0.4.x 浏览器存档保留，不覆盖、不自动迁移。存档只在当前浏览器中保存，不是云存档；重要战役请导出 JSON 备份。localhost 与 github.io 的存档互不共享。

### 地图来源说明

地图采用固定 Victoria 3 1.13.7 州区域参考的转换边界，非 Natural Earth 的公共领域行政区数据。独立游戏再发行授权尚未核实；本次部署不代表已获得相应授权。见本仓库的 `docs/STATE_REGIONS.md`、线上 `MAP_DATA_SOURCE.md` 和 `THIRD_PARTY_NOTICES.txt`。

## 发布与验证

`.github/workflows/pages.yml` 等待 `Prototype checks` 在本仓库 `main` push 上成功结束，再发布该次检查的精确 SHA。自动发布还要求它是已合并到 `main` 的 PR 对应的单父提交（仓库仅允许 squash 合并），且仍为当前 `main` HEAD。失败、PR 检查、其他分支、未关联合并 PR 或过时的检查均不会发布。

整个发布流程使用同一 concurrency group，`cancel-in-progress: false`，不取消正在发布的任务。构建后、部署前再次确认 `main` HEAD；旧任务不会覆盖更新版本。GitHub concurrency 只保留一个 pending run，并不保证 FIFO，过时任务会跳过，最新成功检查会发布。部署前检查之后若 `main` 又前进，已开始的部署仍可完成，后续成功检查会发布新版。

手动恢复入口仍为 Actions → Publish ROUGE to GitHub Pages → Run workflow，但只允许从 `main` 运行，解析为精确 HEAD，并要求该 SHA 已通过完整的 push CI。它不接受任意旧 ref，也不会构建未合并 PR。需要回滚时通过 PR revert 到 `main` 后正常测试、压缩合并和发布。

每次发布先测试、类型检查、构建，再通过官方 Pages Actions 上线；之后使用 Chromium 访问实际 HTTPS 网站，验证地块图层、Worker、非相邻调兵、升级、保存和刷新读档，归档截图及报告。

## 自动清理已合并分支

`.github/workflows/cleanup-merged-branches.yml` 通过 **GitHub Actions** 实现；没有修改仓库原生 `delete_branch_on_merge` 设置。

合并 PR 后自动预览，并每天预览；自动触发不删除分支。也可手动运行（默认仅预览；明确关闭预览才会实际删除）。只处理本仓库已经实际合并的 PR 源分支。以下分支不会删除：默认/长期/受保护分支，未合并分支，仍被开放 PR 用作源或目标的分支，以及合并后有新提交的分支。

删除前确认合并结果仍在目标或默认分支中，并用 Git 精确 SHA lease 删除，避免并发推送造成误删。没有未核实的批量删除，也不会自动合并任何 PR。执行报告位于 Actions 附件 `merged-branch-cleanup-report`。

## 本地运行

```bash
git clone --branch main https://github.com/RIVERS0FT/rouge.git
cd rouge
npm ci
npm run dev
```

需要 Node.js 22.16 或以上。局域网主机执行 `npm run build && npm run lan`。

`main` 是游戏开发主线，已整合线上 v0.5.0 源码。Pages 自动跟随上述已测试的主线合并提交；手机横屏等后续功能尚未纳入。

左键选地块，拖动平移，滚轮缩放；选中己方地块后右键目标下令，也可在左侧搜索/选择目标。Esc 打开右上设置，保存入口在设置中；单位升级在右侧，天赋在左下领袖像中。

新地图需要新战役，旧 v0.4.x 存档不覆盖、不迁移。界面简中/英语，未提供中文地名的地区使用英文回退。肖像及地形仍为占位资源。

## 测试

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

边界来源、转换审计、容量语义、路线与存档见 **docs/STATE_REGIONS.md**。原版参考边界的独立游戏再发行授权尚未核实，不能把原版素材或其转换标记为公共领域。不要将本分支的参考地图直接当作已完成发行授权的素材。

其余 docs 中的 v0.4 及以前实现说明仅作历史记录，新地图规则以 STATE_REGIONS.md 为准。


## 九项兵种属性与海运

|兵种|生命|单次攻击|防御|攻速（次/游戏秒）|溅射半径|攻击距离|训练（游戏秒）|陆速|海速|
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|步兵|100|14|10|1|0|3.1|14|2.4|3|
|骑兵|120|24|15|0.8|0|1.8|22|4|3|
|炮兵|80|40|0|0.5|1.2|7.2|28|1.8|3|
|工兵|100|12|10|1|0|2.6|18|2.5|3|

距离为地图单位，速度为地图单位/游戏秒，0 溅射表示单体。伤害按 `单次攻击 × 100 / (100 + 目标防御)` 后再应用原有条件减伤。炮兵主目标承受100%，半径内最多两个额外敌人各35%，按距离与单位ID稳定选择，不友伤。攻击/生命/陆速升级仍分别 +2/+12/+0.16，原天赋倍率与工兵1.5倍占领保留。攻速使用模拟时间，不受界面帧率影响。

开局卡显示基础九属性，升级卡显示当前九属性。海运不受陆速升级影响。优先连续陆路，跨岛行军经合法港口自动换乘统一运输船，海上不能攻击、受到陆军攻击或占领。过窄海峡和内陆湖泊可能保守不可达，详见 [海图来源、能力范围与验证](docs/SEA_TRANSPORT.md)。

### Cosmetic commander identity

The three starting leaders now select a portrait only: Warden home defense, Vanguard movement, and Quartermaster recovery bonuses are removed. Level progression, earned talents and unit upgrades are unchanged. Existing saves retain their leader portraits but resume with the new rules.

Campaign setup includes eight real-country flag presets (China, France, Germany, Italy, Japan, United Kingdom, United States, Switzerland) and a custom three-color editor with solid, horizontal, vertical and cross patterns. Flags are cosmetic and do not select a country, start location, army or map color. They appear in the local HUD and LAN lobby and travel with saved/networked player state. Existing saves without a flag keep the neutral faction emblem. Custom flags accept only enumerated patterns and three six-digit hex colors, never uploads, URLs or executable markup. LAN rules identity changes to prevent mixed gameplay versions.

### 手机操作

手机竖屏与横屏使用适配触控的 HUD：单指拖动地图，双指捏合缩放，鼠标可用滚轮缩放，键盘可用 Home/End 和 ±。底部“地块”和“战况”按钮展开或收起对应面板，便于看图；“天赋”和升级入口仍可直接操作。地块调兵无需鼠标右键，在地块面板中选择目标并点击派遣。配置、升级和设置弹窗可上下滚动，兼容安全区域与动态视口，不禁用浏览器页面缩放。桌面鼠标操作和游戏规则保持不变。

触屏笔记本无需切换设置：输入模式跟随实际触摸/笔输入、鼠标或键盘事件切换，兼容鼠标事件不会立即覆盖触摸模式。宽屏保持原布局，触摸模式放大触控目标。聚焦地图后可用方向键平移、±缩放；弹窗/菜单打开时地图动作禁用，关闭后恢复，不保留中断的拖动。设备映射统一输出平移、缩放、选择动作，与游戏/界面输入上下文分离。

### 开局、AI与外观配置

新战役按种子确定性分配出生地：每位真人或AI得到两块不重叠、双向陆路可达且各有继续扩张出口的领地；后续出生点尽量远离已分配阵营。旗帜与领袖不影响出生、资源或能力。已有存档不会重新分布。

单人可选1–3名AI，多人由房主选择0–3名AI。真人与AI总数最多4，至少2名才能开始；AI占用预留席位，加入房间不会自动挤走AI。房主可在开始前调整，服务端验证加入、配置和开始的并发状态。

领袖选择卡与战场使用同一原创SVG形象。领袖与旗帜偏好保存在当前浏览器，只有这两项，不保存姓名或联网凭证；加载旧战役不覆盖其人物/旗帜。自定义旗帜可拖绘圆、矩形、三角、星形，支持选择删除、撤销与清空。最多24个形状，坐标/尺寸/颜色均严格校验，旧预设和条纹旗帜仍兼容。

连续升级积累多次待选天赋时，选完一项会继续显示下一组；等待权威状态确认后，最后一项完成才关闭窗口。经验与升级规则不变。

地图角落2D/3D/＋/−控件已移除。触屏仍可单指拖动、双指捏合；鼠标拖动与滚轮保持，聚焦地图可用方向键、±，Home回到全图、End聚焦选中地块。

战斗界面的地图来源文字与操作提示叠层已隐藏，地图/来源资料仍保留于说明文档和发布文件；实际输入设备识别及所有地图操作保持不变。

阵营在本帧所有占领统一结算后若领土为0，立即淘汰：残余军队（含海上运输）和未完成占领清除，后续命令被拒绝。失地和新占领同时发生不会误判。玩家看到失败后可观战或返回菜单；多人只淘汰该阵营，其他真人与AI继续，最终胜利规则不变。旧v5存档读取时会按此规则清理零领土残军，原存档文件本身不被自动重写。

选中领土保持原归属填充色，使用金色描边与有限宽度的内边缘柔光标记；柔光与真实陆地三角网求交，不越过海岸或填满孔洞，并沿用2D/3D地形和日期线副本。
