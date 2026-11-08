# ROUGE · 诸省之争

React + Three.js 即时领土征服原型。当前开发版 **v0.5.0**，分支 `feat/state-regions-routing`。

## 本次变化

全球切换为参考《维多利亚3》1.13.7 的 **675 个陆地州区域**；不导入国家归属，移除国界图层、国家配色和国旗，仅显示管理地块与玩家势力。

支持向非相邻地块下令，沿连续陆路逐块推进、战斗与占领。只限制每地块每方最多 **12 个兵团**，不限制玩家总兵力。满员停产；增援预留名额；途中地块满员时等待。

## 运行

```bash
git fetch origin
git switch feat/state-regions-routing
npm ci
npm run dev
```

Node.js >=22.16.0。数据离线随仓库提供，首次启动不下载游戏素材。局域网：`npm run build && npm run lan`，通过主机 8787 端口访问。Pages 仍只是静态单人试玩，不提供联机后端。

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
