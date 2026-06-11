import os
import subprocess
import requests
import time
import logging
import threading
import json
from urllib.parse import urlparse
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
log = logging.getLogger(__name__)

BOT_TOKEN = os.environ['TG_BOT_TOKEN']
ALLOWED_IDS = set(filter(None, os.environ.get('TG_ALLOWED_CHAT_IDS', '').split(',')))
HTTP_PROXY = os.environ.get('HTTP_PROXY', '')
HTTPS_PROXY = os.environ.get('HTTPS_PROXY', HTTP_PROXY)
CONFIG_FILE = '/config/gallery-dl.conf'
HTTP_PORT = int(os.environ.get('HTTP_PORT', 8080))

API = f'https://api.telegram.org/bot{BOT_TOKEN}'
TG_PROXIES = {'http': HTTP_PROXY, 'https': HTTPS_PROXY} if HTTP_PROXY else None

SITE_ALIASES = {'x': 'twitter', 'tw': 'twitter', 'ig': 'instagram'}

HELP_TEXT = (
    "发送任意支持的网址即可自动下载。\n\n"
    "支持 Twitter/X、Instagram、Pixiv、Danbooru、\n"
    "Reddit、YouTube 等数百个站点。\n\n"
    "/setcookie <站点> <Cookie字符串>\n"
    "  直接粘贴浏览器复制的整串 Cookie 即可更新登录态。\n"
    "  站点：twitter（或 x）、instagram（或 ig）\n\n"
    "/help - 显示此帮助"
)


def send(chat_id, text, retries=5):
    for i in range(retries):
        try:
            r = requests.post(f'{API}/sendMessage',
                              json={'chat_id': chat_id, 'text': text},
                              proxies=TG_PROXIES, timeout=30)
            data = r.json()
            if data.get('ok'):
                return data
            log.warning('send failed (attempt %d): %s', i + 1, data)
        except Exception as e:
            log.warning('send error (attempt %d): %s', i + 1, e)
        time.sleep(2 ** i)
    log.error('send gave up after %d attempts: chat=%s', retries, chat_id)
    return {}


def parse_cookie_string(cookie_str):
    cookies = {}
    for part in cookie_str.split(';'):
        part = part.strip()
        if '=' in part:
            key, _, val = part.partition('=')
            cookies[key.strip()] = val.strip()
    return cookies


def cmd_setcookie(chat_id, args):
    parts = args.split(None, 1)
    if len(parts) < 2:
        send(chat_id,
             '用法：/setcookie <站点> <Cookie字符串>\n'
             '示例：/setcookie instagram datr=xxx; sessionid=yyy\n\n'
             '站点支持：twitter（或 x）、instagram（或 ig）')
        return

    site = SITE_ALIASES.get(parts[0].lower(), parts[0].lower())
    cookies = parse_cookie_string(parts[1])
    if not cookies:
        send(chat_id, '❌ 无法解析 Cookie，请确认格式为 key=value; key2=value2')
        return

    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            conf = json.load(f)
        conf.setdefault('extractor', {}).setdefault(site, {})['cookies'] = cookies
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(conf, f, indent=4, ensure_ascii=False)
        log.info('Cookie updated: site=%s fields=%d', site, len(cookies))
        send(chat_id, f'✅ {site} Cookie 已更新，共解析 {len(cookies)} 个字段。')
    except Exception as e:
        log.error('setcookie error: %s', e)
        send(chat_id, f'❌ 写入配置失败：{e}')


def is_url(text):
    try:
        r = urlparse(text.strip())
        return r.scheme in ('http', 'https') and bool(r.netloc)
    except Exception:
        return False


def run_download(url, chat_id):
    log.info('Download start: %s  chat=%s', url, chat_id)
    send(chat_id, f'⏳ 开始下载:\n{url}')
    env = os.environ.copy()
    try:
        result = subprocess.run(
            ['gallery-dl', '-c', CONFIG_FILE, url],
            capture_output=True, text=True, env=env,
            timeout=3600
        )
        if result.returncode == 0:
            log.info('Download done: %s', url)
            send(chat_id, f'✅ 下载完成:\n{url}')
        else:
            err = (result.stderr or result.stdout or '未知错误').strip()[-400:]
            log.warning('Download failed: %s\n%s', url, err)
            send(chat_id, f'❌ 下载失败:\n{url}\n\n{err}')
    except subprocess.TimeoutExpired:
        log.error('Download timeout: %s', url)
        send(chat_id, f'⏰ 下载超时（已超过1小时）:\n{url}')
    except Exception as e:
        log.error('Download exception: %s  %s', url, e)
        send(chat_id, f'❌ 发生错误:\n{e}')


def handle(message):
    chat_id = str(message.get('chat', {}).get('id', ''))
    text = (message.get('text') or '').strip()
    if not chat_id or not text:
        return
    if ALLOWED_IDS and chat_id not in ALLOWED_IDS:
        send(chat_id, '⛔ 无权限使用此 Bot。')
        log.warning('Unauthorized access: chat_id=%s', chat_id)
        return
    if text in ('/start', '/help'):
        send(chat_id, HELP_TEXT)
        return
    if text.startswith('/setcookie'):
        cmd_setcookie(chat_id, text[len('/setcookie'):].strip())
        return
    if is_url(text):
        threading.Thread(target=run_download, args=(text, chat_id), daemon=True).start()
    else:
        send(chat_id, '请发送有效的 URL 链接。\n\n/help 查看帮助。')


# ── 本地 HTTP 接口（供 Chrome 插件调用）──────────────────────────
class DownloadHandler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != '/download':
            self.send_response(404)
            self.end_headers()
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            url = body.get('url', '').strip()
            chat_id = body.get('chat_id', '')
            if not chat_id and ALLOWED_IDS:
                chat_id = next(iter(ALLOWED_IDS))
            if not is_url(url):
                raise ValueError('invalid url')
            threading.Thread(target=run_download, args=(url, chat_id), daemon=True).start()
            self.send_response(200)
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            log.info('HTTP trigger: %s  chat=%s', url, chat_id)
        except Exception as e:
            self.send_response(400)
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())

    def log_message(self, *args):
        pass  # 不打印 HTTP 访问日志


def start_http_server():
    server = HTTPServer(('0.0.0.0', HTTP_PORT), DownloadHandler)
    log.info('HTTP server listening on :%d', HTTP_PORT)
    server.serve_forever()


# ── Telegram 长轮询 ───────────────────────────────────────────
def main():
    log.info('Bot starting...')
    threading.Thread(target=start_http_server, daemon=True).start()

    offset = None
    retry_delay = 5

    while True:
        try:
            params = {'timeout': 30, 'offset': offset}
            r = requests.get(f'{API}/getUpdates', params=params,
                             proxies=TG_PROXIES, timeout=40)
            data = r.json()

            if not data.get('ok'):
                log.error('getUpdates error: %s', data)
                time.sleep(retry_delay)
                continue

            retry_delay = 5
            for update in data.get('result', []):
                offset = update['update_id'] + 1
                msg = update.get('message') or update.get('channel_post')
                if msg:
                    handle(msg)

        except requests.exceptions.RequestException as e:
            log.error('Network error: %s, retry in %ds', e, retry_delay)
            time.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)
        except Exception as e:
            log.error('Unexpected error: %s', e)
            time.sleep(5)


if __name__ == '__main__':
    main()
