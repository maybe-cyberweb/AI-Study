# 农业中关村学院 · AI 智能化建设学习型知识库

这是一个可分享的学习型知识库站点（纯静态）：按“知识大类 → 章节 → 知识点”组织内容。每个大类支持 **索引视图** 与 **脑图视图（分层可点击）**，每个知识点包含解释、工程要点与自检清单。

## 目录结构
- `index.html`：站点入口
- `assets/`：前端样式与脚本（离线可用，不依赖外部 CDN）
- `content/catalog.json`：内容索引（大类/章节/知识点关系）
- `content/points/*.md`：知识点正文
- `404.html`：用于“直达链接”的重定向（把 `/category/...` 变成 `/#/category/...`）

## 方式 B：Git 自动部署到 Vercel（推荐）
目标：每次 push 到 Git 仓库后，Vercel 自动构建/发布站点。

### 1) 初始化 Git 仓库并推送到远端
在本目录（`d:\\a\\AI  study`）执行：
```bash
git init
git add .
git commit -m "init learning hub"
```
然后在 GitHub/Gitee 创建一个新的空仓库，把远端地址填进来：
```bash
git remote add origin <你的仓库地址>
git branch -M main
git push -u origin main
```

### 2) 在 Vercel 导入该仓库
1. Vercel Dashboard → New Project → Import Git Repository
2. 选择该仓库
3. Project Settings：
   - Framework Preset：Other
   - Build Command：None
   - Output Directory：`.`（项目根目录）

### 3) 为什么“直达链接”不会 404
本项目使用 hash 路由（`/#/...`）保证静态托管下的路由稳定。
- 分享链接使用：`https://<domain>/#/category/ai-foundations/map`
- 若用户误访问了：`https://<domain>/category/ai-foundations/map`
  - Vercel 会返回 `404.html`
  - `404.html` 会自动跳转到：`/#/category/ai-foundations/map`

对应规则：不要在 `vercel.json` 写全量 rewrite 到 `index.html`，否则直达链接会被吞掉，hash 路由无法恢复路径。

## 内容维护
- 新增知识点：在 `content/points/` 新建 `*.md`
- 把知识点挂到站点：编辑 `content/catalog.json`，在对应大类/章节下添加一条 point（id/title/summary/md/related）

