const urlEl  = document.getElementById('url');
const btn    = document.getElementById('btn');
const status = document.getElementById('status');
const optEl  = document.getElementById('opt');

let currentUrl = '';

optEl.addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentUrl = tab?.url || '';
  urlEl.textContent = currentUrl || '无法获取 URL';
  if (!currentUrl) btn.disabled = true;
});

btn.addEventListener('click', async () => {
  const { serverUrl, chatId } = await chrome.storage.local.get(['serverUrl', 'chatId']);

  if (!serverUrl || !chatId) {
    status.className = 'status err';
    status.textContent = '请先在设置中填写服务器地址和 Chat ID';
    return;
  }

  btn.disabled = true;
  status.className = 'status';
  status.textContent = '发送中...';

  try {
    const res = await fetch(`${serverUrl}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentUrl, chat_id: chatId })
    });
    const data = await res.json();
    if (data.ok) {
      status.className = 'status ok';
      status.textContent = '✅ 已发送，Bot 开始下载';
    } else {
      throw new Error(data.error || '未知错误');
    }
  } catch (e) {
    status.className = 'status err';
    status.textContent = '❌ 发送失败：' + e.message;
  } finally {
    btn.disabled = false;
  }
});
