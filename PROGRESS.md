# PROGRESS

## 开工回执（任务 0，2026-09-28）
- 核对：空项目判卷 4/24 PASS 退出码 1；accept.mjs SHA256 7cc714ec…0ce4 —— 与任务书一致。
- 目标：Villa Lab——从地基学盖房 + 网格积木式 3D 设计两层泳池别墅 + 用量与比索参考价，上线 GitHub Pages；规格＝tools/accept.mjs 开头三段注释。
- 顺序：数据 → 设计器与造价 → 首页/课程/出处/双语/手机 → 上线 → --url 与 --prove。
- 最大风险：①原网页能找到原文的比索价格凑不够 16 个；②课程每个数字都要有能打开的出处；③浮动玻璃面板挡住判卷要点的画布位置。

## 进度
- [x] 任务 0 核对
- [x] 任务 1 数据 —— `--only data,sources` 10/10 PASS（2026-09-28）
  - 材料 25 种、有价 22（88%）；价格全部来自 aedoconstruction.com 2026 文章（PSA 403/DTI 超时用不了）。区间价一律取上限（偏保守）。
  - 屋面、屋架、防水的来源价是「供货+安装」，不是纯材料价：materials.json 里 basis:"installed"，清单页单独标注（原板是只算材料费，因为找不到纯材料的屋面价，这几项只能如实标）。
  - 用量系数全部有原文：CHB 12.5 块/m² + 5% 损耗、砂浆 0.5 包水泥 + 0.035 m³ 砂/m²（chb-quantity-estimator）；AAC 8.33 块/m²；钢筋 110 kg/m³（80–110 的上限，两层框架偏上限）、屋面坡度系数 1.15（bill-of-materials-house）；泳池壳 150 mm 平均厚（swimming-pool 页）；柱最小边 300 mm（NSCP 418.7.2.1）。
  - 基础、梁、板厚度是示意假设（清单页写明以结构工程师设计为准）。
  - 课程 10 章、30 题、stage 10、material 4、inspect 5，出处全是能打开的 aedoconstruction 文章。
- [x] 任务 2 设计器与造价 —— `--only home,design` 29/29、`--only boq,timeline,lessons` 14/14（2026-09-28）
- [x] 任务 3 首页、课程、出处、双语、手机 —— `--only layout` 8/8；接着做观感打磨
  - 代码：index.html + css/app.css + js/{app,scene,boq,i18n}.js；three r186 放 vendor/three（含 OrbitControls、RoomEnvironment 两个 addon，MIT）
  - 空心砖贴图：Poly Haven 的 concrete_block_wall 系列原图偏黑，4 寸改用 concrete_brick_wall_001（浅灰砌块），6 寸保留 concrete_block_wall，渲染时材质颜色 ×1.7 提亮（文件本身未改）
  - 本地预览：`node tools/serve.mjs 4480` → http://127.0.0.1:4480/villa-lab/ ；调试截图 `MSYS_NO_PATHCONV=1 node tools/shot.mjs '#/design'`（Git Bash 会把 #/ 改写成路径）
- [x] 任务 4 上线与反向验证（2026-09-28）
  - 本地 `node tools/accept.mjs`：52/52 PASS，退出码 0
  - 线上 https://jyb635050-ai.github.io/villa-lab/ `--url`：53/53 PASS（data/*.json 与本地逐字节相同）
  - `--prove`：12 种破坏全部被抓到，退出码 1
  - accept.mjs SHA256 仍是 7cc714ec…0ce4
  - 仓库 jyb635050-ai/villa-lab（公开），Pages 从 main 根目录构建；建仓用 GitHub API + git credential fill 取 token
  - 观感打磨已做：远景雾化、玻璃面板提亮、首页镜头对准房子、基础阶段改成「挖开的土坑」剖切、清单按施工顺序排
  - 待裁决见 BLOCKED.md（屋面等价格含安装；来源集中在一个网站）

## 追加：第一人称参观（2026-10-06，领导新需求）
- 新页面 `#/walk`（顶栏「参观」、设计器左栏「参观」、首页按钮进入）：WASD 走、空格跳、F 开关门、鼠标看（点画面锁定）、Shift 跑、Esc 放开鼠标；手机有摇杆和跳/开门按钮
- js/walk.js：轴对齐盒碰撞（《我的世界》式），矮于 0.4 m 的台阶自动迈上、门关着是实心、栏杆挡人、泳池能掉进去并按空格游上来
- js/interior.js：家具/院子摆设（46 件写在 sample.json 的 furniture 字段），装修阶段室内墙面刷白、加天花、二楼露台和楼梯洞栏杆、门扇可转/推拉门可滑
- 示范别墅调整：楼梯挪到门厅（x14.3, z7, 往北上楼，原位置堵住一楼卧室门）、二楼楼板开楼梯洞（清单扣除洞口面积）、o14 改成通往露台的 1.8 m 推拉门
- 自测 `node tools/walk_test.mjs`：14/14（撞门停住、F 开门、进屋、跳、撞墙、上楼、栏杆、掉进泳池再游出、关门、走动帧 p95 17.4ms）
- 原判卷 `node tools/accept.mjs`：仍 52/52；指纹未动
