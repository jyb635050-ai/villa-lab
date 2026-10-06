# Villa Lab

从地基开始系统学盖房，在 3D 里用网格积木方式设计两层泳池别墅（菲律宾 Batangas），实时算出用量与参考材料造价。

线上：https://jyb635050-ai.github.io/villa-lab/

- 纯静态网站：`index.html` + `css/` + `js/`（three.js r186 在 `vendor/three`，MIT）
- 数据：`data/materials.json`（每个比索价格带原网页原文 quote 与出处）、`data/lessons.json`（10 章，每章有出处）、`data/stages.json`、`data/sample.json`
- 贴图：Poly Haven（CC0），`node tools/fetch_textures.mjs <id>` 下载并按 md5 校验
- 第一人称参观：`#/walk`（WASD/空格/F/鼠标），自测 `node tools/walk_test.mjs`
- 本地预览：`node tools/serve.mjs` → http://127.0.0.1:4480/villa-lab/
- 验收：`node tools/accept.mjs`（`--url` 验线上、`--prove` 反向验证）。该文件是冻结的判卷标准，不要改。

价格是 2026 年公开网页整理的参考价，不是报价；结构尺寸是示意，以结构工程师的设计为准。
