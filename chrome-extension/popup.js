const urlEl    = document.getElementById('url');
const btnBot   = document.getElementById('btnBot');
const btnLocal = document.getElementById('btnLocal');
const status   = document.getElementById('status');
const optEl    = document.getElementById('opt');
const modeEls  = document.querySelectorAll('input[name="mode"]');
const descEl   = document.getElementById('modeDesc');

const MODE_DESC = {
  bot:   '发送给 Bot，由服务器下载',
  local: '直接保存到本地，不经过 Bot',
  ask:   '每次下载时选择方式'
};

let currentUrl = '';
let currentTabId = null;

optEl.addEventListener('click', () => chrome.runtime.openOptionsPage());

function renderMode(mode) {
  modeEls.forEach(el => { el.checked = el.value === mode; });
  descEl.textContent = MODE_DESC[mode];
  btnBot.hidden   = mode === 'local';
  btnLocal.hidden = mode === 'bot';
}

chrome.storage.local.get(['downloadMode', 'localMode'], ({ downloadMode, localMode }) => {
  renderMode(downloadMode || (localMode ? 'local' : 'bot'));
});

// 只切换模式，不改动已保存的 Bot 配置
modeEls.forEach(el => el.addEventListener('change', () => {
  chrome.storage.local.set({ downloadMode: el.value });
  status.className = 'status';
  status.textContent = '';
  renderMode(el.value);
}));

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentUrl = tab?.url || '';
  currentTabId = tab?.id ?? null;
  urlEl.textContent = currentUrl || '无法获取 URL';
  if (!currentUrl) btnBot.disabled = btnLocal.disabled = true;
});

async function downloadLocal() {
  if (!/^https:\/\/(twitter\.com|x\.com|www\.instagram\.com)\//.test(currentUrl)) {
    throw new Error('本地模式仅支持 Twitter/X 和 Instagram 页面');
  }
  let res;
  try {
    res = await chrome.tabs.sendMessage(currentTabId, { type: 'localDownload', url: currentUrl });
  } catch {
    throw new Error('页面脚本未就绪，请刷新页面后重试');
  }
  if (!res?.ok) throw new Error(res?.error || '未知错误');
  return res.count;
}

async function sendToBot() {
  const { serverUrl, chatId } = await chrome.storage.local.get(['serverUrl', 'chatId']);
  if (!serverUrl || !chatId) {
    throw new Error('请先在设置中填写服务器地址和 Chat ID，或改用「下载到本地」');
  }
  const res = await fetch(`${serverUrl}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: currentUrl, chat_id: chatId })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || '未知错误');
}

async function run(local) {
  btnBot.disabled = btnLocal.disabled = true;
  status.className = 'status';
  status.textContent = local ? '解析中...' : '发送中...';

  try {
    if (local) {
      const count = await downloadLocal();
      status.className = 'status ok';
      status.textContent = `✅ 已开始下载 ${count} 个文件`;
    } else {
      await sendToBot();
      status.className = 'status ok';
      status.textContent = '✅ 已发送，Bot 开始下载';
    }
  } catch (e) {
    status.className = 'status err';
    status.textContent = '❌ ' + (local ? '下载失败：' : '发送失败：') + e.message;
  } finally {
    btnBot.disabled = btnLocal.disabled = false;
  }
}

btnBot.addEventListener('click', () => run(false));
btnLocal.addEventListener('click', () => run(true));
