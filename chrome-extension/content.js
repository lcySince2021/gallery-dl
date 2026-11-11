const HOST = location.hostname;

async function sendToBot(url) {
  const { serverUrl, chatId } = await chrome.storage.local.get(['serverUrl', 'chatId']);
  if (!serverUrl || !chatId) {
    alert('请先在插件设置中填写服务器地址和 Chat ID（点击插件图标 → ⚙ 设置），或在设置中改用「下载到本地」');
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

// ── 本地下载模式 ──────────────────────────────────────────────
const TW_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const TW_FEATURES = {
  rweb_video_screen_enabled: false, payments_enabled: false, rweb_xchat_enabled: false,
  profile_label_improvements_pcf_label_in_post_enabled: true, rweb_tipjar_consumption_enabled: true,
  verified_phone_label_enabled: false, creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false, communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true, responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true, articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false, responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true, standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: false,
  responsive_web_enhance_cards_enabled: false
};

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

// 未登录也可用，但不支持敏感/受保护推文
async function twSyndication(id) {
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
  const res = await chrome.runtime.sendMessage({
    type: 'fetchJson',
    url: `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`
  });
  if (!res?.ok || !res.data?.mediaDetails?.length) return null;
  return { user: res.data.user?.screen_name, media: res.data.mediaDetails };
}

// 使用当前登录态调用网页版 API
async function twGraphql(id) {
  const params = new URLSearchParams({
    variables: JSON.stringify({ tweetId: id, withCommunity: false, includePromotedContent: false, withVoice: false }),
    features: JSON.stringify(TW_FEATURES),
    fieldToggles: JSON.stringify({ withArticleRichContentState: true, withArticlePlainText: false, withGrokAnalyze: false, withDisallowedReplyControls: false })
  });
  const res = await fetch(`${location.origin}/i/api/graphql/qxWQxcMLiTPcavz9Qy5hwQ/TweetResultByRestId?${params}`, {
    credentials: 'include',
    headers: {
      authorization: 'Bearer ' + TW_BEARER,
      'x-csrf-token': getCookie('ct0'),
      'x-twitter-auth-type': getCookie('ct0') ? 'OAuth2Session' : '',
      'x-twitter-active-user': 'yes'
    }
  });
  if (!res.ok) throw new Error('Twitter API HTTP ' + res.status);
  let tweet = (await res.json())?.data?.tweetResult?.result;
  if (tweet?.tweet) tweet = tweet.tweet;
  if (!tweet?.legacy) throw new Error('推文不可用' + (tweet?.reason ? `（${tweet.reason}）` : ''));
  return {
    user: tweet.core?.user_results?.result?.core?.screen_name
       || tweet.core?.user_results?.result?.legacy?.screen_name,
    media: tweet.legacy.extended_entities?.media || []
  };
}

async function extractTwitter(url) {
  const id = url.match(/status\/(\d+)/)?.[1];
  if (!id) throw new Error('不是推文链接');
  let info = null;
  try { info = await twSyndication(id); } catch {}
  if (!info) info = await twGraphql(id);
  const user = info.user || 'twitter';

  return info.media.map((m, i) => {
    const n = i + 1;
    if (m.type === 'photo') {
      const ext = m.media_url_https.match(/\.(\w+)$/)?.[1] || 'jpg';
      const base = m.media_url_https.replace(/\.\w+$/, '');
      return { url: `${base}?format=${ext}&name=orig`, filename: `gallery-dl/twitter/${user}_${id}_${n}.${ext}` };
    }
    const best = (m.video_info?.variants || [])
      .filter(v => v.content_type === 'video/mp4')
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    return best && { url: best.url, filename: `gallery-dl/twitter/${user}_${id}_${n}.mp4` };
  }).filter(Boolean);
}

function igShortcodeToId(code) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let id = 0n;
  for (const c of code) id = id * 64n + BigInt(alphabet.indexOf(c));
  return id.toString();
}

async function extractInstagram(url) {
  const code = new URL(url).pathname.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1];
  if (!code) throw new Error('不是 Instagram 帖子链接');
  const res = await fetch(`https://www.instagram.com/api/v1/media/${igShortcodeToId(code)}/info/`, {
    credentials: 'include',
    headers: { 'X-IG-App-ID': '936619743392459', 'X-CSRFToken': getCookie('csrftoken') }
  });
  if (!res.ok) throw new Error('Instagram API HTTP ' + res.status + '（请确认已登录）');
  const item = (await res.json())?.items?.[0];
  if (!item) throw new Error('未找到帖子内容');
  const user = item.user?.username || 'instagram';

  return (item.carousel_media || [item]).map((m, i) => {
    const n = i + 1;
    if (m.video_versions?.length) {
      return { url: m.video_versions[0].url, filename: `gallery-dl/instagram/${user}_${code}_${n}.mp4` };
    }
    const img = m.image_versions2?.candidates?.[0];
    return img && { url: img.url, filename: `gallery-dl/instagram/${user}_${code}_${n}.jpg` };
  }).filter(Boolean);
}

async function downloadLocal(url) {
  const items = HOST.includes('instagram.com') ? await extractInstagram(url) : await extractTwitter(url);
  if (!items.length) throw new Error('该内容中没有可下载的图片或视频');
  const res = await chrome.runtime.sendMessage({ type: 'download', items });
  if (!res?.ok) throw new Error(res?.error || '下载失败');
  return items.length;
}

// downloadMode: 'bot' | 'local' | 'ask'，兼容旧版的 localMode 开关
async function getMode() {
  const { downloadMode, localMode } = await chrome.storage.local.get(['downloadMode', 'localMode']);
  return downloadMode || (localMode ? 'local' : 'bot');
}

// 在按钮旁弹出选择菜单，返回 'bot' / 'local'，取消返回 null
function pickMethod(anchor) {
  document.querySelector('.gdl-pick-menu')?.remove();
  return new Promise(resolve => {
    const menu = document.createElement('div');
    menu.className = 'gdl-pick-menu';
    menu.style.cssText = [
      'position:fixed', 'z-index:2147483647', 'background:#18181b',
      'border:1px solid #3f3f46', 'border-radius:8px', 'padding:4px',
      'box-shadow:0 6px 20px rgba(0,0,0,.35)', 'display:flex', 'flex-direction:column',
      'font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    const done = (choice) => {
      menu.remove();
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      resolve(choice);
    };
    const onOutside = (e) => { if (!menu.contains(e.target)) done(null); };
    const onKey = (e) => { if (e.key === 'Escape') done(null); };
    const onScroll = () => done(null);

    [['bot', '📨 发送到 Bot'], ['local', '💾 下载到本地']].forEach(([value, text]) => {
      const item = document.createElement('button');
      item.textContent = text;
      item.style.cssText = [
        'background:none', 'border:none', 'color:#e4e4e7', 'text-align:left',
        'padding:7px 12px', 'border-radius:6px', 'cursor:pointer', 'white-space:nowrap', 'font:inherit'
      ].join(';');
      item.addEventListener('mouseenter', () => { item.style.background = '#27272a'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'none'; });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        done(value);
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const top = r.bottom + 4 + menu.offsetHeight > window.innerHeight ? r.top - 4 - menu.offsetHeight : r.bottom + 4;
    menu.style.top = Math.max(4, top) + 'px';
    menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - menu.offsetWidth - 4)) + 'px';

    document.addEventListener('mousedown', onOutside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
  });
}

// 返回 true/false 表示成功与否，返回 null 表示用户取消
async function handleDownload(url, btn) {
  const mode = await getMode();
  const method = mode === 'ask' ? await pickMethod(btn) : mode;
  if (!method) return null;
  btn.style.color = '#fbbf24';
  if (method === 'bot') return sendToBot(url);
  try {
    await downloadLocal(url);
    return true;
  } catch (e) {
    console.warn('[gallery-dl] 本地下载失败:', e);
    return false;
  }
}

// 供弹出窗口调用本地下载
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'localDownload') return;
  downloadLocal(msg.url)
    .then(count => sendResponse({ ok: true, count }))
    .catch(e => sendResponse({ ok: false, error: e.message }));
  return true;
});

function makeDlBtn(onClick) {
  const btn = document.createElement('button');
  btn.className = 'gdl-dl-btn';
  btn.title = 'Gallery-DL 下载';
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
    const ok = await onClick(btn);
    if (ok === null) return;
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

  const btn = makeDlBtn(el => handleDownload(tweetUrl, el));
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

  const btn = makeDlBtn(el => handleDownload(postUrl, el));
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
