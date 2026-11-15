# Rouge 原创步兵 v7

`rouge-infantry-v7.glb` 是项目为 Rouge 绘制的原创 3D 步兵资源（7,490 三角面，含行走与射击），不依赖第三方游戏素材。

网页不会加载这个 GLB；它按需从部署站点取约 202 KiB 的共享实例资源。使用 Blender 4.3 重新生成：

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/bake-infantry.py -- data/art/rouge-infantry-v7.glb src/render/assets/infantry.bin
```

生成器保留材质颜色、建模的法线、骨骼变形与道具动画，把同一几何与骨骼采样矩阵供全部可见陆上士兵实例共用；面板/UI 的地图切换与单位的存档、联机同步和模拟规则不因这项替换而改变。
