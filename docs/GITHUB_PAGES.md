# GitHub Pages 在线单人试玩

基于 v0.4.2（全屏地图版）。不改地图身份、模拟规则和存档版本。

## 构建

```sh
npm ci
npm test
npm run build:pages
npx playwright install chromium
npm run test:pages
```

`pages` 模式设置 Vite base 为 `/rouge/`，资源、动态 chunk 和模拟 Worker 随构建输出，不依赖在线地图服务。普通 `npm run dev` / `npm run build` / `npm run lan` 不受影响。

在线版显示静态托管说明、禁用局域网入口，忽略旧重连凭证。单人战役、AI、升级、天赋、多存档和 JSON 导入导出保留。GitHub Pages 无法运行 server/lan.ts；Steam/EOS 亦未接入。

## 发布

`.github/workflows/pages.yml` 在 feat/github-pages 推送时构建并在 `/rouge/` 子路径下完成真实浏览器验证，通过后才向 github-pages 环境发布。只上传 dist，不上传源文件、node_modules、测试存档或日志。使用 GitHub Actions 短期令牌，不添加个人令牌。

仓库 Settings → Pages 应使用 GitHub Actions 作为 Source；github-pages 环境需允许发布分支。已有安全审批不会被工作流绕过或关闭。

发布后再次执行同一个浏览器验证（传入 PAGES_URL），检查公开地址可进入战役、Worker 正常运行、升级和存档读回；证据保存在工作流附件。`build-info.json` 记录实际源码提交，便于核对发布版本。

## 存档

存档存储在当前浏览器的 localStorage，不上传 GitHub、不跨设备同步。localhost 与 github.io 是不同来源，不会自动共享存档。先在本地版本「设置 → 保存战役 → 导出」，再在在线版导入。清理站点数据或关闭隐私窗口可能丢失存档，请导出备份。

推荐桌面 Chrome / Edge 等具备 WebGL2 的浏览器。线上截图验证不代表真实硬件帧率验收。
