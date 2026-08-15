// Content Script genérico para detecção de vídeos HTML5
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }

let detectedVideos = new Map(); // Usando Map para evitar URLs duplicadas
let currentMode = 'auto';

try {
  chrome.storage.local.get(['aster_detection_mode'], (result) => {
    if (result.aster_detection_mode) currentMode = result.aster_detection_mode;
    scanForVideos();
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.aster_detection_mode) {
      currentMode = changes.aster_detection_mode.newValue;
    }
  });
} catch(e) {
  scanForVideos();
}
function extractSmartTitle(element) {
  try {
    // 1. Atributo title ou aria-label do elemento
    if (element) {
      const elTitle = element.getAttribute('title') || element.getAttribute('aria-label');
      if (elTitle && elTitle.trim().length > 2) return elTitle.trim();

      // 2. Post / Artigo ao redor (Twitter, Reddit, Instagram, Facebook)
      const article = element.closest('article, shreddit-post, .Post, [role="article"]');
      if (article) {
        const heading = article.querySelector('h1, h2, h3, [data-testid="tweetText"], p');
        if (heading && heading.textContent && heading.textContent.trim().length > 2) {
          let txt = heading.textContent.trim().replace(/\s+/g, ' ');
          return txt.length > 80 ? txt.substring(0, 80) + '…' : txt;
        }
      }
    }

    // 3. OpenGraph / Twitter Card meta tags
    const ogTitle = document.querySelector('meta[property="og:title"], meta[name="twitter:title"]');
    if (ogTitle && ogTitle.content && ogTitle.content.trim().length > 0) {
      let t = ogTitle.content.trim();
      if (t.length > 2) return t;
    }

    // 4. document.title (removendo sufixos comuns de sites)
    if (document.title && document.title.trim().length > 0) {
      let cleanTitle = document.title
        .replace(/\s*-\s*YouTube$/i, '')
        .replace(/\s*\/\s*X$/i, '')
        .replace(/\s*\|\s*Twitter$/i, '')
        .replace(/\s*•\s*Instagram.*$/i, '')
        .replace(/\s*\|\s*Facebook$/i, '')
        .replace(/\s*:\s*Reddit$/i, '')
        .replace(/\s*\|\s*TikTok$/i, '')
        .trim();
      if (cleanTitle.length > 2 && !['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok'].includes(cleanTitle.toLowerCase())) {
        return cleanTitle;
      }
    }

    // 5. Fallback: Nome do site / hostname (ex: "kiwify.com.br", "vimeo.com")
    const hostname = window.location.hostname.replace(/^www\./, '');
    if (hostname) return `Vídeo de ${hostname}`;
  } catch (e) {}

  return 'Vídeo Web';
}

function injectManualButton(v) {
  if (!v.element) return;
  const videoEl = v.element;

  if (videoEl.parentElement && videoEl.parentElement.querySelector('.aster-manual-btn')) {
    return;
  }

  let parent = videoEl.parentElement;
  if (!parent) return;

  if (window.location.hostname.includes('youtube.com')) {
    const player = videoEl.closest('.html5-video-player');
    if (player) parent = player;
  }
  
  const parentPos = window.getComputedStyle(parent).position;
  if (parentPos === 'static') {
    parent.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.className = 'aster-manual-btn';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
  btn.title = 'Adicionar ao Aster';
  
  Object.assign(btn.style, {
    position: 'absolute',
    top: '12px',
    right: '65px',
    zIndex: '999999',
    background: '#7b61ff',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s, background 0.2s'
  });

  btn.onmouseover = () => btn.style.transform = 'scale(1.1)';
  btn.onmouseout = () => btn.style.transform = 'scale(1)';

  const clickHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    v.addedToList = true;
    
    btn.style.background = '#10b981';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    
    try {
      chrome.runtime.sendMessage({
        action: 'video_detected',
        video: {
          url: v.url,
          type: v.type,
          title: v.title || null,
          thumbnail: v.thumbnail
        }
      }).catch(() => {});
    } catch(err) {}
    
    updateBadge();

    setTimeout(() => {
      btn.style.background = '#7b61ff';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    }, 2000);
  };

  btn.addEventListener('pointerdown', clickHandler);
  btn.addEventListener('click', clickHandler);

  parent.appendChild(btn);
}

function scanForVideos() {
  try {
    if (!chrome.runtime?.id) return; // Se o contexto foi invalidado, aborta silenciosamente
    const newVideos = [];
    
    // Função recursiva para buscar <video> ignorando barreiras de Shadow DOM
    function findAllVideos(root) {
      let videos = Array.from(root.querySelectorAll('video'));
      const allElements = root.querySelectorAll('*');
      allElements.forEach(el => {
        if (el.shadowRoot) {
          videos = videos.concat(findAllVideos(el.shadowRoot));
        }
      });
      return videos;
    }
    
    // 1. Procurar por tags <video>
    const videoElements = findAllVideos(document);
    videoElements.forEach(video => {
      
      // Arquitetura Híbrida: Extrator Especialista para Twitter/X
      if (window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com')) {
        const tweetArticle = video.closest('article');
        if (tweetArticle) {
          let tweetUrl = null;
          const timeElement = tweetArticle.querySelector('time');
          if (timeElement && timeElement.parentElement && timeElement.parentElement.href) {
            tweetUrl = timeElement.parentElement.href;
          } else if (window.location.href.includes('/status/')) {
            tweetUrl = window.location.href.split('/photo/')[0].split('/video/')[0];
          }

          if (tweetUrl) {
            newVideos.push({ url: tweetUrl, type: 'twitter', title: extractSmartTitle(video), element: video });
            return;
          }
        }
      }

      // Arquitetura Híbrida: Extrator Especialista para Instagram
      if (window.location.hostname.includes('instagram.com')) {
        const article = video.closest('article');
        let instaUrl = null;
        if (article) {
          const link = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
          if (link) instaUrl = link.href;
        }
        if (!instaUrl && (window.location.href.includes('/p/') || window.location.href.includes('/reel/') || window.location.href.includes('/reels/'))) {
           instaUrl = window.location.href.split('?')[0]; // limpa query params
        }
        const instaTitle = extractSmartTitle(video);
        if (instaUrl) {
          newVideos.push({ url: instaUrl, type: 'instagram', title: instaTitle, element: video });
        } else {
          newVideos.push({ url: window.location.href, type: 'instagram', title: instaTitle, element: video });
        }
        return; // Impede fallback HTML5 genérico
      }

      // Arquitetura Híbrida: Extrator Especialista para Reddit
      if (window.location.hostname.includes('reddit.com')) {
        const post = video.closest('shreddit-post, .Post');
        let redditUrl = null;
        if (post) {
          const permalink = post.getAttribute('permalink') || post.getAttribute('data-permalink');
          if (permalink) redditUrl = permalink.startsWith('http') ? permalink : 'https://www.reddit.com' + permalink;
        }
        if (!redditUrl && window.location.href.includes('/comments/')) {
          redditUrl = window.location.href;
        }
        if (redditUrl) {
          newVideos.push({ url: redditUrl, type: 'reddit', title: extractSmartTitle(video), element: video });
          return;
        }
      }

      // Arquitetura Híbrida: Extrator Especialista para Facebook
      if (window.location.hostname.includes('facebook.com')) {
        let fbUrl = null;
        if (window.location.href.includes('/videos/') || window.location.href.includes('watch') || window.location.href.includes('/reel/')) {
          fbUrl = window.location.href;
        } else {
           const fbPost = video.closest('[data-pagelet^="FeedUnit"], [role="article"]');
           if (fbPost) {
              const link = fbPost.querySelector('a[href*="/videos/"], a[href*="/watch"]');
              if (link) fbUrl = link.href;
           }
        }
        
        // Fallback: se achou um vídeo, mas não achou link, e a URL não for a página inicial pura
        if (!fbUrl && window.location.pathname.length > 2) {
           fbUrl = window.location.href;
        }

        const fbTitle = extractSmartTitle(video);
        if (fbUrl) {
           newVideos.push({ url: fbUrl, type: 'facebook', title: fbTitle, element: video });
        } else {
           newVideos.push({ url: window.location.href, type: 'facebook', title: fbTitle, element: video });
        }
        return; // Impede fallback HTML5 genérico
      }

      // Arquitetura Híbrida: Extrator Especialista para TikTok
      if (window.location.hostname.includes('tiktok.com')) {
        let tiktokUrl = null;
        if (window.location.pathname.includes('/video/') || window.location.pathname.includes('/v/')) {
          tiktokUrl = window.location.href;
        } else {
          // Fallback para procurar link em feeds
          let container = video.closest('div');
          // No TikTok a estrutura muda muito, tenta subir algumas divs se não achar
          for (let i = 0; i < 12 && container; i++) {
            // 1. Tenta achar data-item-id (comum no feed novo)
            const itemId = container.getAttribute('data-item-id');
            if (itemId) {
              tiktokUrl = 'https://www.tiktok.com/@u/video/' + itemId;
              break;
            }
            
            // 2. Tenta achar ID numeral longo na própria div (ex: xgwrapper-0-72123...)
            if (container.id) {
               const match = container.id.match(/(\d{15,})/);
               if (match) {
                 tiktokUrl = 'https://www.tiktok.com/@u/video/' + match[1];
                 break;
               }
            }

            // 3. Tenta achar um link 'a' com /video/
            const a = container.querySelector('a[href*="/video/"], a[href*="/v/"]');
            if (a) { tiktokUrl = a.href; break; }
            
            container = container.parentElement;
          }
        }
        
        if (!tiktokUrl) {
          // Se mesmo assim não achar, usa a URL da página.
          // Para não sobrescrever vídeos no feed (mesma URL), adiciona um hash único
          let hash = video.src ? btoa(video.src.slice(-20)).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) : Math.random().toString(36).substring(2, 8);
          tiktokUrl = window.location.href.split('#')[0] + '#' + hash;
        }

        newVideos.push({ url: tiktokUrl, type: 'tiktok', title: extractSmartTitle(video), element: video });
        return; // Impede fallback HTML5 genérico
      }

      // Arquitetura Híbrida: Extrator Especialista para YouTube (captura de thumb)
      if (window.location.hostname.includes('youtube.com')) {
        const rect = video.getBoundingClientRect();
        const isVisible = rect.top >= -100 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 100;
        if (isVisible || !video.paused) {
          let ytUrl = window.location.href;
          if (ytUrl.includes('/watch') || ytUrl.includes('/shorts/')) {
             newVideos.push({ url: ytUrl, type: 'youtube', title: extractSmartTitle(video), element: video });
          }
        }
        return;
      }

      if (video.src && video.src.startsWith('http') && !video.src.startsWith('blob:')) {
        newVideos.push({
          url: video.src,
          type: 'video/mp4',
          title: extractSmartTitle(video),
          element: video
        });
      }
      
      // 2. Procurar por tags <source> dentro de <video>
      const sources = video.querySelectorAll('source');
      sources.forEach(source => {
        if (source.src && source.src.startsWith('http') && !source.src.startsWith('blob:')) {
          newVideos.push({
            url: source.src,
            type: source.type || 'video/mp4',
            title: extractSmartTitle(video),
            element: video
          });
        }
      });
      
      // Fallback para HLS (blob:): envia metadata proativamente
      if (video.src && video.src.startsWith('blob:')) {
        const sendHlsMeta = () => {
          try {
            if (video.readyState >= 2 && video.videoWidth > 0) {
              const canvas = document.createElement('canvas');
              canvas.width = 160;
              canvas.height = 90;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(video, 0, 0, 160, 90);
              chrome.runtime.sendMessage({
                action: 'set_hls_metadata',
                thumbnail: canvas.toDataURL('image/jpeg', 0.6)
              }).catch(()=>{});
            }
          } catch(e) {}
        };
        sendHlsMeta();
        if (!video.dataset.asterHlsListener) {
          video.dataset.asterHlsListener = "true";
          video.addEventListener('playing', sendHlsMeta, { once: true });
          video.addEventListener('loadeddata', sendHlsMeta, { once: true });
        }
      }
    });
    
    // Adiciona ao map para desduplicação + envia em tempo real ao Side Panel
    newVideos.forEach(v => {
      // Tentar capturar thumbnail do elemento <video> via canvas
      let thumbnail = null;
      if (v.type === 'youtube') {
         try {
           const ytUrl = new URL(v.url);
           let vidId = null;
           if (ytUrl.searchParams.has('v')) vidId = ytUrl.searchParams.get('v');
           else if (ytUrl.pathname.includes('/shorts/')) vidId = ytUrl.pathname.split('/shorts/')[1];
           if (vidId) thumbnail = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
         } catch(e) {}
      }
      
      if (!thumbnail) {
        try {
          const videoEl = v.element || document.querySelector('video');
          if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
            const canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 90;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, 160, 90);
            thumbnail = canvas.toDataURL('image/jpeg', 0.6);
          }
        } catch (e) {
          // Cross-origin ou DRM, thumbnail ficará null
        }
      }

      const isNew = !detectedVideos.has(v.url);
      const existing = detectedVideos.get(v.url);
      const needsThumbnailUpdate = !isNew && !existing.thumbnail && thumbnail;
      const isCurrentPage = v.url === window.location.href || v.url === window.location.href.split('?')[0];

      if (isNew || needsThumbnailUpdate || (isCurrentPage && window.asterLastMainUrl !== v.url)) {
        v.thumbnail = thumbnail || (existing ? existing.thumbnail : null);
        
        if (isNew) {
          v.addedToList = (currentMode === 'auto');
        } else {
          v.addedToList = existing.addedToList;
        }

        detectedVideos.delete(v.url);
        detectedVideos.set(v.url, v);
        
        if (isCurrentPage) window.asterLastMainUrl = v.url;

        log('[Aster] Novo/Atualizado vídeo detectado:', v.url);

        try {
          injectManualButton(v);
          
          if (v.addedToList) {
            chrome.runtime.sendMessage({
              action: 'video_detected',
              video: {
                url: v.url,
                type: v.type,
                title: v.title || null,
                thumbnail: v.thumbnail
              }
            }).catch(() => {});
          }
        } catch (e) {
          // Ignora erros como "Extension context invalidated"
        }
      } else {
        if (existing) {
          injectManualButton(existing);
        }
      }
    });
    
    // Atualiza o badge da extensão
    updateBadge();
  } catch (err) {
    if (err.message && err.message.includes('Extension context invalidated')) {
      if (window.asterObserver) window.asterObserver.disconnect();
    }
  }
}

function updateBadge() {
  const count = Array.from(detectedVideos.values()).filter(v => v.addedToList !== false).length;
  try {
    chrome.runtime.sendMessage({
      action: 'update_badge', // No futuro o background pode lidar com isso
      count: count
    }).catch(() => {});
  } catch (e) {
    if (e.message && e.message.includes('Extension context invalidated')) {
      if (window.asterObserver) window.asterObserver.disconnect();
    }
  }
}

// Inicializa o escaneamento já movido para dentro do get do storage

// Cria um observer para detectar vídeos adicionados dinamicamente ao DOM
window.asterObserver = new MutationObserver((mutations) => {
  try {
    let shouldScan = false;
    mutations.forEach(mutation => {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
      }
    });
    
    if (shouldScan) {
      // Debounce simples
      clearTimeout(window.scanTimeout);
      window.scanTimeout = setTimeout(scanForVideos, 1000);
    }
  } catch (err) {
    if (err.message && err.message.includes('Extension context invalidated')) {
      if (window.asterObserver) window.asterObserver.disconnect();
    }
  }
});

window.asterObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

// Escuta requisições do popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!chrome.runtime?.id) return;
  if (request.action === 'get_videos') {
    try { sendResponse({ videos: Array.from(detectedVideos.values()).filter(v => v.addedToList !== false) }); } catch(e) {}
  } else if (request.action === 'force_scan') {
    scanForVideos();
    
    Array.from(detectedVideos.values()).forEach(v => {
      if (v.addedToList === false) {
        v.addedToList = true;
        try {
          chrome.runtime.sendMessage({
            action: 'video_detected',
            video: {
              url: v.url,
              type: v.type,
              title: v.title || null,
              thumbnail: v.thumbnail
            }
          }).catch(() => {});
        } catch(err) {}
      }
    });

    try { sendResponse({ videos: Array.from(detectedVideos.values()).filter(v => v.addedToList !== false) }); } catch(e) {}
  } else if (request.action === 'get_page_metadata') {
    let thumbnail = null;
    const videoEl = document.querySelector('video');
    let title = extractSmartTitle(videoEl);
    try {
      // Pega o primeiro vídeo válido para thumbnail
      if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, 160, 90);
        thumbnail = canvas.toDataURL('image/jpeg', 0.6);
      }
    } catch (e) {}
    try { sendResponse({ title: title, thumbnail: thumbnail }); } catch(e) {}
  }
  
  if (request.action === 'get_youtube_formats') {
    const formatsMap = new Map();
    let ytTitle = null;
    try {
      const ytTitleEl = document.querySelector('h1.ytd-watch-metadata, #title h1, ytd-watch-metadata #title, #container > h1');
      if (ytTitleEl && ytTitleEl.textContent && ytTitleEl.textContent.trim()) {
        ytTitle = ytTitleEl.textContent.trim();
      }
    } catch(e) {}
    
    // Tentativa 1: Variável Global Injetada
    let formats = window.lastYoutubeFormats || [];
    
    // Tentativa 2: Extração por Regex nos scripts (mais confiável em algumas páginas e SPAs)
    if (formats.length === 0) {
      const scripts = document.querySelectorAll('script');
      for (let s of scripts) {
        if (s.textContent && s.textContent.includes('ytInitialPlayerResponse')) {
          try {
            const match = s.textContent.match(/ytInitialPlayerResponse\s*=\s*({[\s\S]+?});(?:var|meta|window|document|module|$)/);
            if (match && match[1]) {
              const data = JSON.parse(match[1]);
              if (data && data.videoDetails && data.videoDetails.title) {
                ytTitle = data.videoDetails.title;
              }
              if (data && data.streamingData) {
                formats = [
                  ...(data.streamingData.formats || []),
                  ...(data.streamingData.adaptiveFormats || [])
                ];
                break;
              }
            }
          } catch(e) {}
        }
      }
    }
    
    if (formats.length > 0) {
      formats.forEach(f => {
        // Limite máximo: 1080p (devido à restrição atual do yt-dlp sem PO Token)
        if (f.height && f.height <= 1080) {
          const h = f.height;
          const w = f.width || Math.round(h * 16 / 9);
          if (!formatsMap.has(h)) {
             formatsMap.set(h, { height: h, width: w });
          } else if (w > formatsMap.get(h).width) {
             formatsMap.set(h, { height: h, width: w });
          }
        }
      });
    }
    
    const sortedFormats = Array.from(formatsMap.values()).sort((a, b) => b.height - a.height);
    try { sendResponse({ formats: sortedFormats, title: ytTitle }); } catch(e) {}
  }
});

// Arquitetura Híbrida: Extrator do YouTube (bypass Isolated World)
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || event.data.type !== 'ASTER_YOUTUBE_DATA') return;
  window.lastYoutubeFormats = event.data.formats;
});

const ytScript = document.createElement('script');
ytScript.src = chrome.runtime.getURL('content-scripts/yt-extractor.js');
(document.head || document.documentElement).appendChild(ytScript);
ytScript.remove();
