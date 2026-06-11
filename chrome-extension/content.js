const HOST = location.hostname;

async function sendToBot(url) {
  const { serverUrl, chatId } = await chrome.storage.local.get(['serverUrl', 'chatId']);
  if (!serverUrl || !chatId) {
    alert('请先在插件设置中填写服务器地址和 Chat ID（点击插件图标 → ⚙ 设置）');
    return false;
  }
  try {
    const res = await fetch(`${serverUrl}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, chat_id: chatId })
    });
    return (await res.json()).ok;
  } catch {
    return false;
  }
}

function makeDlBtn(onClick) {
  const btn = document.createElement('button');
  btn.className = 'gdl-dl-btn';
  btn.title = '发送到 Gallery-DL 下载';
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 15.5l-6-6h4V4h4v5.5h4l-6 6zM5 18h14v2H5v-2z"/>
  </svg>`;
  btn.style.cssText = [
    'background:none', 'border:none', 'cursor:pointer',
    'color:rgb(83,100,113)', 'padding:8px', 'border-radius:50%',
    'display:flex', 'align-items:center', 'justify-content:center',
    'transition:color .15s,background .15s', 'flex-shrink:0'
  ].join(';');

  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#1d9bf0';
    btn.style.background = 'rgba(29,155,240,0.1)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = 'rgb(83,100,113)';
    btn.style.background = 'none';
  });
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.style.color = '#fbbf24';
    const ok = await onClick();
    btn.style.color = ok ? '#34d399' : '#f87171';
    setTimeout(() => { btn.style.color = 'rgb(83,100,113)'; }, 2000);
  });
  return btn;
}

// ── Twitter / X ───────────────────────────────────────────────
function addTwitterButton(article) {
  if (article.querySelector('.gdl-dl-btn')) return;

  const actionBar = article.querySelector('[role="group"]');
  if (!actionBar) return;

  const timeLink = article.querySelector('time')?.closest('a');
  if (!timeLink) return;
  const tweetUrl = 'https://x.com' + timeLink.getAttribute('href');

  const btn = makeDlBtn(() => sendToBot(tweetUrl));
  // wrap to match Twitter's button layout
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;align-items:center;margin-left:4px;';
  wrap.appendChild(btn);
  actionBar.appendChild(wrap);
}

function scanTwitter() {
  document.querySelectorAll('article[data-testid="tweet"]').forEach(addTwitterButton);
}

// ── Instagram ─────────────────────────────────────────────────
function getIgPostUrl(article) {
  // single post page
  if (/\/(p|reel)\//.test(location.pathname)) return location.href;
  // feed / explore: find link inside article
  const a = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
  return a ? 'https://www.instagram.com' + new URL(a.href).pathname : null;
}

function addInstagramButton(article) {
  if (article.querySelector('.gdl-dl-btn')) return;

  const postUrl = getIgPostUrl(article);
  if (!postUrl) return;

  // Instagram action section (like / comment / share / save row)
  const section = article.querySelector('section');
  if (!section) return;

  const btn = makeDlBtn(() => sendToBot(postUrl));
  btn.style.color = 'rgb(38,38,38)';
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#e1306c';
    btn.style.background = 'rgba(225,48,108,0.08)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = 'rgb(38,38,38)';
    btn.style.background = 'none';
  });

  section.appendChild(btn);
}

function scanInstagram() {
  document.querySelectorAll('article').forEach(addInstagramButton);
}

// ── Init ──────────────────────────────────────────────────────
let scan;
if (HOST.includes('twitter.com') || HOST.includes('x.com')) {
  scan = scanTwitter;
} else if (HOST.includes('instagram.com')) {
  scan = scanInstagram;
}

if (scan) {
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}
