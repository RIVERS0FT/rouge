# ROUGE · 诸省之争

基于 React 与 Three.js 的领土地块征服策略游戏。

## 在线试玩

**[打开游戏：https://rivers0ft.github.io/rouge/](https://rivers0ft.github.io/rouge/)**

当前默认发布版本：**v0.5.0**，源码提交 `174af4617f49af8a46c07c3f3e7f11d267548c3a`（`feat/state-regions-routing`）。网站实际发布版本以 `build-info.json` 和 Pages 工作流验收结果为准。

- 全球 675 个陆地管理地块，不显示现实国家、国旗或独立国界图层。
- 可以向非相邻地块下令，沿连续陆路逐段推进，遇敌先战斗、占领。
- 每地块每阵营最多 12 个兵团；没有玩家总量或全场兵团总量上限。
- 保留领袖、升级、肉鸽天赋、多存档、中英文界面、米勒地图和全屏 HUD。

### 网页版限制与存档

GitHub Pages 不包含 Node.js 联机服务器；局域网入口不能直接在此站建房。Steam / Epic、海运及最终写实资源尚未实现。

v0.5.0 使用新地图和 GameState v5，需要新建战役。旧 v0.4.x 浏览器存档保留，不覆盖、不自动迁移。存档只在当前浏览器中保存，不是云存档；重要战役请导出 JSON 备份。localhost 与 github.io 的存档互不共享。

### 地图来源说明

地图采用固定 Victoria 3 1.13.7 州区域参考的转换边界，非 Natural Earth 的公共领域行政区数据。独立游戏再发行授权尚未核实；本次部署不代表已获得相应授权。见游戏分支的 `docs/STATE_REGIONS.md`、线上 `MAP_DATA_SOURCE.md` 和 `THIRD_PARTY_NOTICES.txt`。

## 发布与验证

`.github/workflows/pages.yml` 固定发布经过测试的源码 SHA；不会因开发分支后来删除而改为发布其他版本。修改工作流或验收脚本推送至 main 时自动运行，也支持 Actions → Publish ROUGE to GitHub Pages → Run workflow 指定其他源码 ref。

每次发布先测试、类型检查、构建，再通过官方 Pages Actions 上线；之后使用 Chromium 访问实际 HTTPS 网站，验证地块图层、Worker、非相邻调兵、升级、保存和刷新读档，归档截图及报告。

## 自动清理已合并分支

`.github/workflows/cleanup-merged-branches.yml` 通过 **GitHub Actions** 实现；没有修改仓库原生 `delete_branch_on_merge` 设置。

合并 PR 后自动检查，并每天补查；也可手动运行（默认仅预览）。只处理本仓库已经实际合并的 PR 源分支。以下分支不会删除：默认/长期/受保护分支，未合并分支，仍被开放 PR 用作源或目标的分支，以及合并后有新提交的分支。

删除前确认合并结果仍在目标或默认分支中，并用 Git 精确 SHA lease 删除，避免并发推送造成误删。没有未核实的批量删除，也不会自动合并任何 PR。执行报告位于 Actions 附件 `merged-branch-cleanup-report`。

## 本地运行

```bash
git clone --branch feat/state-regions-routing https://github.com/RIVERS0FT/rouge.git
cd rouge
npm ci
npm run dev
```

需要 Node.js 22.16 或以上。局域网主机执行 `npm run build && npm run lan`。

`main` 当前存放部署和维护入口；游戏功能 PR 保持未合并。
