# ROUGE · 诸省之争

基于 React 与 Three.js 的省级领土征服策略游戏。

## 在线试玩

**[打开游戏：https://rivers0ft.github.io/rouge/](https://rivers0ft.github.io/rouge/)**

当前发布游戏版本：**v0.4.2**，源代码提交：`c5c60e6f1bcbab7b39a0ee3775bcf987bc2c0b44`（`feat/fullscreen-hud`）。

网页提供单人战役、自动造兵、行军战斗与占领、单位升级、领袖天赋、浏览器多存档、中英界面、裁剪米勒世界地图，以及左上国旗、左下领袖像、右上设置和悬浮单位升级。

### 网页版限制

GitHub Pages 只提供静态网页，不运行本项目的 Node.js 联机服务器。当前局域网入口仍在界面中，但不能通过 Pages 网站创建或加入联机房间；局域网对局请运行本地服务。Steam / Epic 原生联机、海运和最终写实资源尚未实现。

存档保存在当前浏览器，不是云存档。`localhost` 和 `github.io` 的存档互不共享，需要通过 JSON 导出/导入转移。清除网站数据可能删除本机存档，重要战役请导出备份。

## 本地运行

```bash
git clone --branch feat/fullscreen-hud https://github.com/RIVERS0FT/rouge.git
cd rouge
npm ci
npm run dev
```

需要 Node.js 22.16 或以上版本。局域网主机执行 `npm run build && npm run lan`，所有玩家使用主机 8787 端口访问。

## 发布与验证

发布工作流：`.github/workflows/pages.yml`。

- 修改该工作流并推送至 `main` 时自动发布默认固定版本。
- 发布其他版本：在 Actions → Publish ROUGE to GitHub Pages → Run workflow 中填写游戏分支、标签或提交 SHA。不会自动合并已有功能 PR。
- 工作流运行核心测试、完整类型检查和生产构建，按 Pages 实际子路径生成资源地址，再通过官方 Pages Actions 发布。
- 发布后使用 Chromium 访问实际 HTTPS 网站，检查主菜单、WebGL 地图、Worker 模拟、派兵、升级、保存和刷新读档，并归档截图与验证报告。
- `build-info.json` 标记网页的实际游戏版本和源代码提交；`THIRD_PARTY_NOTICES.txt` 包含所用库的许可声明。

`main` 目前存放部署入口及项目说明。游戏实现保留在功能分支，原有 PR 未自动合并。
