# 自动部署指南

服务器: `121.43.103.72`

## 一、服务器准备（只需一次）

### 1. 创建部署目录并拉取代码

```bash
ssh root@121.43.103.72

mkdir -p /opt/mediaProcessor
cd /opt/mediaProcessor
git clone git@github.com:wendazhi/mediaProcessor.git .
```

### 2. 安装依赖并配置环境

```bash
cd /opt/mediaProcessor
npm install
npm run build

# 复制环境变量配置
cp .env.example .env
vim .env  # 填写真实配置

# 安装 PM2（如未安装）
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 3. 确保 Node.js 版本 >= 20

```bash
node -v
```

### 4. 确保 PostgreSQL 已运行并创建数据库

```bash
# 创建数据库
createdb media_processor

# 推送表结构
cd /opt/mediaProcessor
npm run db:push
```

---

## 二、GitHub Secrets 配置

在仓库页面: **Settings → Secrets and variables → Actions → New repository secret**

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `SSH_PRIVATE_KEY` | 服务器的 SSH 私钥（完整内容） | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `SSH_HOST` | 服务器 IP | `121.43.103.72` |
| `SSH_USER` | SSH 用户名 | `root` |
| `DEPLOY_PATH` | 服务器上的代码目录 | `/opt/mediaProcessor` |

### 如何获取 SSH 私钥

在服务器上执行：

```bash
cat ~/.ssh/id_rsa
# 或
cat ~/.ssh/id_ed25519
```

把完整内容（包括 `BEGIN` 和 `END` 行）复制到 GitHub Secret 中。

> 如果服务器没有 SSH key，先生成一对：`ssh-keygen -t ed25519 -C "deploy"`

---

## 三、触发部署

本地推送代码到 main 分支即可自动触发：

```bash
git push origin main
```

GitHub Actions 会自动：
1. SSH 连接到服务器
2. 执行 `git pull`
3. 执行 `npm ci`（生产环境推荐用 ci 代替 install）
4. 执行 `npm run build`
5. 执行 `pm2 restart`

---

## 四、查看部署日志

### GitHub Actions 日志
仓库页面 → Actions → 选择最新的 workflow run → 查看日志

### 服务器实时日志
```bash
ssh root@121.43.103.72
cd /opt/mediaProcessor
pm2 logs
```

---

## 五、手动部署（备用）

如果 GitHub Actions 出问题，手动执行：

```bash
ssh root@121.43.103.72
cd /opt/mediaProcessor
git pull origin main
npm ci
npm run build
pm2 restart ecosystem.config.cjs
```
