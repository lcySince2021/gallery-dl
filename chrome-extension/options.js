const serverEl = document.getElementById('serverUrl');
const chatEl   = document.getElementById('chatId');
const saveBtn  = document.getElementById('save');
const savedEl  = document.getElementById('saved');
const modeEls  = document.querySelectorAll('input[name="mode"]');
const descEl   = document.getElementById('modeDesc');
const botCfgEl = document.getElementById('botConfig');

const MODE_DESC = {
  bot:   '点击下载按钮后发送给 Bot，由服务器下载',
  local: '直接保存到浏览器下载目录，无需 Bot（下方配置会保留）',
  ask:   '每次点击下载按钮时弹出菜单选择方式'
};

function renderMode(mode) {
  modeEls.forEach(el => { el.checked = el.value === mode; });
  descEl.textContent = MODE_DESC[mode];
  botCfgEl.classList.toggle('disabled', mode === 'local');
}

chrome.storage.local.get(['serverUrl', 'chatId', 'downloadMode', 'localMode'], ({ serverUrl, chatId, downloadMode, localMode }) => {
  if (serverUrl) serverEl.value = serverUrl;
  if (chatId)    chatEl.value   = chatId;
  renderMode(downloadMode || (localMode ? 'local' : 'bot'));
});

// 只切换模式，不改动已保存的 Bot 配置
modeEls.forEach(el => el.addEventListener('change', () => {
  chrome.storage.local.set({ downloadMode: el.value });
  renderMode(el.value);
}));

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    serverUrl: serverEl.value.trim(),
    chatId:    chatEl.value.trim()
  }, () => {
    savedEl.textContent = '已保存 ✓';
    setTimeout(() => savedEl.textContent = '', 2000);
  });
});
