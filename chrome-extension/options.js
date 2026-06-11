const serverEl = document.getElementById('serverUrl');
const chatEl   = document.getElementById('chatId');
const saveBtn  = document.getElementById('save');
const savedEl  = document.getElementById('saved');

chrome.storage.local.get(['serverUrl', 'chatId'], ({ serverUrl, chatId }) => {
  if (serverUrl) serverEl.value = serverUrl;
  if (chatId)    chatEl.value   = chatId;
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({
    serverUrl: serverEl.value.trim(),
    chatId:    chatEl.value.trim()
  }, () => {
    savedEl.textContent = '已保存 ✓';
    setTimeout(() => savedEl.textContent = '', 2000);
  });
});
