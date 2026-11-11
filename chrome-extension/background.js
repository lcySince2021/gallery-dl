// 本地模式：负责跨域请求和调用 chrome.downloads 保存文件
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'fetchJson') {
    fetch(msg.url)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'download') {
    Promise.all(msg.items.map(({ url, filename }) =>
      chrome.downloads.download({ url, filename, conflictAction: 'uniquify' })
    ))
      .then(() => sendResponse({ ok: true }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
