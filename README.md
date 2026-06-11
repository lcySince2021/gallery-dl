# Gallery-DL Telegram Bot

通过 Telegram Bot 一键下载 Twitter/X、Instagram 等社交媒体内容，支持 Chrome 扩展触发下载。

## 功能

- 发送 URL 给 Bot 自动下载图片/视频
- 支持 `/setcookie` 命令在线更新登录 Cookie，无需重启容器
- 内置 HTTP 接口，配合 Chrome 扩展一键下载当前页面
- 支持代理配置
- Docker 部署，资源限制（256m 内存，0.5 CPU）

## 支持站点

Twitter/X、Instagram，以及 gallery-dl 支持的[数百个站点](https://github.com/mikf/gallery-dl/blob/master/docs/supportedsites.md)。

---

## 快速开始

### 第一步：创建 Telegram Bot

1. 在 Telegram 搜索 **@BotFather**，发送 `/newbot`
2. 按提示设置 Bot 名称，完成后 BotFather 会给你一个 Token，格式类似：
   ```
   1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. 搜索 **@userinfobot**，发送任意消息，它会回复你的 Chat ID（一串数字）

### 第二步：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入上一步获取的信息：

```env
# 必填：Bot Token
TG_BOT_TOKEN=1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 必填：允许使用 Bot 的 Chat ID，多个用逗号分隔，留空则所有人可用（不推荐）
TG_ALLOWED_CHAT_IDS=123456789

# 可选：如果服务器需要代理才能访问 Telegram
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

### 第三步：启动容器

```bash
docker compose up -d
```

查看启动日志确认正常运行：

```bash
docker logs -f gallery-dl-bot
```

正常输出类似：
```
2024-01-01 12:00:00 INFO HTTP server listening on :8080
2024-01-01 12:00:00 INFO Bot starting...
```

### 第四步：配置 Cookie（下载需登录的内容时必须）

Cookie 用于让 gallery-dl 以你的身份登录，可下载仅登录可见的内容。

**获取 Cookie 的方法：**

1. 在电脑浏览器登录 Twitter 或 Instagram
2. 按 `F12` 打开开发者工具 → 切换到 **Application**（Chrome）或 **Storage**（Firefox）标签
3. 左侧展开 **Cookies** → 点击对应网站
4. 将所有 Cookie 按 `key=value; key2=value2` 的格式拼接

**通过 Bot 命令更新 Cookie（推荐）：**

直接把浏览器复制的整串 Cookie 发给 Bot：

```
/setcookie twitter auth_token=abc123; ct0=def456; twid=u%3D123456789
```

```
/setcookie instagram sessionid=xxx; csrftoken=yyy; ds_user_id=zzz; datr=aaa
```

站点名称支持缩写：`twitter` = `tw` = `x`，`instagram` = `ig`

Cookie 更新后立即生效，无需重启容器。

---

## 日常使用

### 通过 Telegram Bot 下载

直接向 Bot 发送链接即可：

```
https://x.com/username/status/1234567890
```

```
https://www.instagram.com/p/XXXXXXXXXX/
```

Bot 会回复下载进度，完成后发送确认消息。下载的文件保存在服务器的 `./downloads/` 目录。

**支持的链接类型（示例）：**

| 链接 | 下载内容 |
|------|---------|
| `https://x.com/user/status/xxx` | 单条推文的图片/视频 |
| `https://x.com/user/media` | 该用户所有媒体 |
| `https://www.instagram.com/p/xxx/` | 单条帖子 |
| `https://www.instagram.com/username/` | 该用户所有帖子 |

### Bot 命令

| 命令 | 说明 |
|------|------|
| 直接发送 URL | 下载对应链接的内容 |
| `/setcookie twitter <Cookie>` | 更新 Twitter 登录 Cookie |
| `/setcookie instagram <Cookie>` | 更新 Instagram 登录 Cookie |
| `/help` | 显示帮助信息 |
| `/start` | 同 `/help` |

---

## Chrome 扩展

在浏览器上安装扩展后，可以在 Twitter/X 或 Instagram 页面点击按钮一键发送当前链接到 Bot 下载，无需手动复制粘贴。

### 安装

1. 编辑 `chrome-extension/manifest.json`，将 `host_permissions` 中的 `YOUR_SERVER_IP` 替换为你运行 Bot 的服务器 IP：
   ```json
   "host_permissions": [
     "http://192.168.1.100:8088/*"
   ]
   ```

2. Chrome 地址栏输入 `chrome://extensions/` → 右上角开启**开发者模式**

3. 点击**加载已解压的扩展程序** → 选择项目中的 `chrome-extension/` 目录

4. 扩展栏出现图标即安装成功

### 首次配置

1. 点击扩展图标 → 点击右下角 **⚙ 设置**
2. 填写：
   - **服务器地址**：`http://你的服务器IP:8088`（注意是 8088，不是 8080）
   - **Chat ID**：你的 Telegram Chat ID（从 @userinfobot 获取）
3. 点击**保存**

### 使用

打开 Twitter/X 或 Instagram 任意页面 → 点击扩展图标 → 点击**发送下载** → Bot 收到链接并开始下载。

---

## 目录结构

```
.
├── bot.py                  # Telegram Bot + HTTP 服务主程序
├── Dockerfile
├── docker-compose.yml
├── .env                    # 环境变量（不提交到 Git）
├── .env.example            # 环境变量模板
├── config/
│   └── gallery-dl.conf     # gallery-dl 配置（Cookie 存储于此）
├── chrome-extension/       # Chrome 扩展源码
│   ├── manifest.json
│   ├── popup.html/js       # 扩展弹窗
│   ├── options.html/js     # 设置页面
│   └── content.js
└── downloads/              # 下载目录（自动创建，不提交到 Git）
```

## 常见问题

**Bot 没有响应？**
- 检查 `TG_BOT_TOKEN` 是否正确
- 确认服务器能访问 `api.telegram.org`（可能需要配置代理）
- 查看日志：`docker logs gallery-dl-bot`

**下载失败提示未授权？**
- 需要更新 Cookie，使用 `/setcookie` 命令重新设置

**Chrome 扩展点击后无反应？**
- 确认 `manifest.json` 中的 IP 已修改为实际服务器 IP
- 确认容器正在运行且 8088 端口可访问
- 检查扩展设置中的服务器地址和 Chat ID 是否正确填写
