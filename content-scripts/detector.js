 // Content Script genérico para detecção de vídeos HTML5
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }

let detectedVideos = new Map(); // Usando Map para evitar URLs duplicadas
window.asterThumbListeners = window.asterThumbListeners || new WeakMap();
let currentMode = 'auto';
let showHoverButton = true;
let currentLanguage = 'pt-BR';

function t(key, ...args) {
  let str = (window.i18n && window.i18n[currentLanguage] && window.i18n[currentLanguage][key]) ? window.i18n[currentLanguage][key] : (key === 'btn_add_to_aster' ? 'Adicionar ao Aster' : key);
  args.forEach((arg, i) => {
    str = str.replace(`{${i}}`, arg);
  });
  return str;
}

try {
  chrome.storage.sync.get(['aster_language'], (data) => {
    let savedLang = data.aster_language || 'system';
    if (savedLang === 'system') {
      const sysLang = navigator.language;
      currentLanguage = (window.i18n && window.i18n[sysLang]) ? sysLang : (sysLang.startsWith('pt') ? 'pt-BR' : 'en-US');
    } else {
      currentLanguage = savedLang;
    }
  });

  chrome.storage.local.get(['aster_detection_mode', 'aster_settings'], (result) => {
    if (result.aster_detection_mode) currentMode = result.aster_detection_mode;
    if (result.aster_settings) {
      showHoverButton = result.aster_settings.showVideoHoverButton !== false;
    }
    scanForVideos();
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.aster_language) {
      let savedLang = changes.aster_language.newValue;
      if (savedLang === 'system') {
        const sysLang = navigator.language;
        currentLanguage = (window.i18n && window.i18n[sysLang]) ? sysLang : (sysLang.startsWith('pt') ? 'pt-BR' : 'en-US');
      } else {
        currentLanguage = savedLang;
      }
    }
    if (namespace === 'local') {
      if (changes.aster_detection_mode) {
        currentMode = changes.aster_detection_mode.newValue;
      }
      if (changes.aster_settings) {
        const settings = changes.aster_settings.newValue || {};
        showHoverButton = settings.showVideoHoverButton !== false;
        
        if (!showHoverButton) {
          document.querySelectorAll('.aster-manual-btn').forEach(btn => btn.remove());
        } else {
          scanForVideos();
          Array.from(detectedVideos.values()).forEach(v => {
            try { injectManualButton(v); } catch(e) {}
          });
        }
      }
    }
  });
} catch(e) {
  scanForVideos();
}

function captureThumbnail(videoEl) {
  if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return null;
  
  let minTime = 0.5;
  if (videoEl.duration > 0 && videoEl.duration < 1) minTime = 0.1;
  
  if (videoEl.currentTime < minTime) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    
    const vRatio = videoEl.videoWidth / videoEl.videoHeight;
    const cRatio = 160 / 90;
    let dW = 160;
    let dH = 90;
    let dX = 0;
    let dY = 0;
    
    if (vRatio > cRatio) {
      dH = 160 / vRatio;
      dY = (90 - dH) / 2;
    } else {
      dW = 90 * vRatio;
      dX = (160 - dW) / 2;
    }
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 160, 90);
    ctx.drawImage(videoEl, dX, dY, dW, dH);
    
    try {
      const imgData = ctx.getImageData(0, 0, 160, 90).data;
      let isBlack = true;
      for (let i = 0; i < imgData.length; i += 4) {
        if (imgData[i] > 30 || imgData[i+1] > 30 || imgData[i+2] > 30) {
          isBlack = false;
          break;
        }
      }
      if (isBlack) return null;
    } catch(err) {}
    
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch (e) {
    return null; // Cross-origin taint error
  }
}

function extractSmartTitle(element) {
  try {
    const hostname = window.location.hostname.replace(/^www\./, '');
    
    if (hostname.includes('tiktok.com')) {
      const authorEl = document.querySelector('[data-e2e="browser-nickname"], [data-e2e="video-author-uniqueid"]');
      if (authorEl && authorEl.textContent) return `TikTok de ${authorEl.textContent.trim()}`;
    }

    if (hostname.includes('facebook.com')) {
      if (document.title && document.title.length > 2) {
        let clean = document.title.replace(/\s*\|\s*Facebook$/i, '').trim();
        if (clean && clean !== 'Facebook') return clean;
      }
      return 'Vídeo do Facebook';
    }

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
    const fallbackHostname = window.location.hostname.replace(/^www\./, '');
    if (fallbackHostname) return t('fallback_no_title') + ` (${fallbackHostname})`;
  } catch (e) {}

  return t('fallback_no_title');
}

function injectManualButton(v) {
  if (!showHoverButton) return;
  if (!v.element) return;
  
  // Limita o botão exclusivamente ao YouTube
  if (!window.location.hostname.includes('youtube.com') && !window.location.hostname.includes('youtu.be')) return;
  const videoEl = v.element;

  let parent = videoEl.parentElement;
  if (!parent) return;

  if (window.location.hostname.includes('youtube.com')) {
    const player = videoEl.closest('.html5-video-player');
    if (player) parent = player;
  }

  // Verifica duplicação no container final
  if (parent.querySelector('.aster-manual-btn')) {
    return;
  }
  
  const parentPos = window.getComputedStyle(parent).position;
  if (parentPos === 'static') {
    parent.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.className = 'aster-manual-btn';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
  btn.title = t('btn_add_to_aster');
  
  const isShorts = window.location.href.includes('/shorts/');
  
  Object.assign(btn.style, {
    position: 'absolute',
    top: isShorts ? '84px' : '12px',
    right: '65px',
    zIndex: '999999',
    background: 'rgba(20, 20, 20, 0.85)',
    color: '#7b61ff', // Símbolo roxo
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    transition: 'transform 0.2s, background 0.2s, opacity 0.3s',
    opacity: '1'
  });

  let hideTimeout;
  const startHideTimer = () => {
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      btn.style.opacity = '0';
      btn.style.pointerEvents = 'none'; // Garante que fique 100% invisível e não detecte hovers acidentais
    }, 1000);
  };
  
  const showBtn = () => {
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto'; // Restaura a interatividade
    clearTimeout(hideTimeout);
  };

  startHideTimer();

  btn.onmouseover = () => {
    btn.style.transform = 'scale(1.1)';
    btn.style.background = 'rgba(40, 40, 40, 0.95)';
    showBtn();
  };
  
  btn.onmouseout = () => {
    btn.style.transform = 'scale(1)';
    btn.style.background = 'rgba(20, 20, 20, 0.85)';
    startHideTimer();
  };

  if (!parent.dataset.asterHoverBound) {
    parent.dataset.asterHoverBound = 'true';
    parent.addEventListener('pointerenter', showBtn);
    parent.addEventListener('pointermove', () => {
      showBtn();
      startHideTimer();
    });
    parent.addEventListener('pointerleave', startHideTimer);
  }

  const openAsterMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Remove menus anteriores
    document.querySelectorAll('.aster-overlay-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'aster-overlay-menu';
    Object.assign(menu.style, {
      position: 'absolute',
      top: '52px', // Logo abaixo do botão (12px top + 36px height + 4px gap)
      right: '65px',
      background: 'rgba(20, 20, 20, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      borderRadius: '12px',
      padding: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      zIndex: '1000000',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: '180px',
      color: '#e5e5e5',
      fontFamily: 'sans-serif',
      fontSize: '14px',
      pointerEvents: 'auto'
    });

    // Mantém o botão visível enquanto o menu estiver aberto
    clearTimeout(hideTimeout);

    const createItem = (text, iconSvg, onClick) => {
      const item = document.createElement('div');
      Object.assign(item.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'background 0.2s',
        color: '#e5e5e5'
      });
      item.innerHTML = `<div style="display:flex;align-items:center;color:#7b61ff">${iconSvg}</div><span>${text}</span>`;
      item.onmouseover = () => item.style.background = 'rgba(255, 255, 255, 0.1)';
      item.onmouseout = () => item.style.background = 'transparent';
      item.onclick = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        onClick();
      };
      return item;
    };

    const svgAdd = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
    const svgDownload = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;

    const addBtn = createItem('Adicionar à lista', svgAdd, () => {
      v.addedToList = true;
      btn.style.background = 'rgba(16, 185, 129, 0.9)';
      btn.style.borderColor = 'rgba(16, 185, 129, 1)';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      
      try {
        chrome.runtime.sendMessage({
          action: 'video_detected',
          video: { url: v.url, type: v.type, title: v.title || null, thumbnail: v.thumbnail }
        }).catch(() => {});
      } catch(err) {}
      
      updateBadge();
      menu.remove();

      setTimeout(() => {
        btn.style.background = 'rgba(20, 20, 20, 0.85)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
      }, 2000);
    });

    const dlBtn = createItem('Baixar direto', svgDownload, () => {
      menu.innerHTML = '<div style="padding:12px;text-align:center;color:#888;">Buscando qualidades...</div>';
      
      chrome.storage.local.get('aster_settings', (data) => {
        const settings = data.aster_settings || {};
        const dirPath = settings.directDownloadPath || '';
        const isDirect = settings.directDownloadEnabled === true;
        
        const renderFormats = (formats) => {
          menu.innerHTML = '';
          if (!formats || formats.length === 0) {
             menu.innerHTML = '<div style="padding:12px;color:#ff4a4a;text-align:center;">Nenhuma qualidade encontrada.</div>';
             setTimeout(() => { menu.remove(); startHideTimer(); }, 3000);
             return;
          }
          
          const titleDiv = document.createElement('div');
          titleDiv.textContent = 'Selecione a Qualidade:';
          Object.assign(titleDiv.style, { padding: '8px', fontSize: '12px', color: '#888', fontWeight: 'bold' });
          menu.appendChild(titleDiv);

          formats.forEach(f => {
             let label = f.height ? `${f.height}p` : 'Áudio';
             if (f.height && f.width) label += ` (${f.width}x${f.height})`;
             const fBtn = createItem(label, svgDownload, () => {
               if (isDirect && dirPath.trim() === '') {
                 alert("Por favor, defina o Caminho da Pasta nas configurações para usar o Download Nativo.");
                 menu.remove();
                 startHideTimer();
                 return;
               }

               let actionName = 'download_video';
               const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok', 'hls'];
               if (vipTypes.includes(v.type)) actionName = 'download_youtube';
               if (v.type === 'html5') {
                 if (f.height && f.height !== 'audio') actionName = 'download_youtube';
                 else actionName = 'download_html5_converted';
               }
               
               chrome.runtime.sendMessage({
                 action: actionName,
                 url: v.url,
                 title: v.title,
                 quality: f.height ? `${f.height}p` : 'audio',
                 directDownload: isDirect,
                 directPath: dirPath
               }).catch(()=>{});
               
               btn.style.background = 'rgba(16, 185, 129, 0.9)';
               btn.style.borderColor = 'rgba(16, 185, 129, 1)';
               menu.remove();
               setTimeout(() => {
                 btn.style.background = 'rgba(20, 20, 20, 0.85)';
                 btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                 startHideTimer();
               }, 2000);
             });
             menu.appendChild(fBtn);
          });
        };

        // Solicita as qualidades
        chrome.runtime.sendMessage({ action: 'get_formats', url: v.url, type: v.type }, (response) => {
            if (chrome.runtime.lastError) {}
            if (response && response.formats) {
               renderFormats(response.formats);
            } else {
               if (v.type === 'video/mp4' || v.type === 'html5') {
                   renderFormats([{height: 1080}, {height: 720}, {height: null}]);
               } else if (window.lastYoutubeFormats && v.type === 'youtube') {
                   const formatsMap = new Map();
                   window.lastYoutubeFormats.forEach(f => {
                       if (f.height && f.height <= 1080) {
                           const h = f.height;
                           const w = f.width || Math.round(h * 16 / 9);
                           if (!formatsMap.has(h) || w > formatsMap.get(h).width) formatsMap.set(h, { height: h, width: w });
                       }
                   });
                   renderFormats(Array.from(formatsMap.values()).sort((a,b)=>b.height-a.height));
               } else {
                   menu.innerHTML = '<div style="padding:12px;color:#ff4a4a;text-align:center;">Erro ao contatar Companion.</div>';
                   setTimeout(() => { menu.remove(); startHideTimer(); }, 3000);
               }
            }
        });
      });
    });

    menu.appendChild(addBtn);
    menu.appendChild(dlBtn);

    parent.appendChild(menu);

    const closeMenu = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== btn && !btn.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('pointerdown', closeMenu);
        startHideTimer();
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', closeMenu), 10);
  };

  btn.addEventListener('pointerdown', openAsterMenu);
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });

  parent.appendChild(btn);
}

function scanForVideos() {
  try {
    if (!chrome.runtime?.id) return; // Se o contexto foi invalidado, aborta silenciosamente
    const newVideos = [];
    
    // Função recursiva para buscar <video> ignorando barreiras de Shadow DOM
    function findAllVideos(root) {
      let videos = Array.from(root.querySelectorAll('video'));
      
      const host = window.location.hostname;
      if (host.includes('tiktok.com') || host.includes('instagram.com') || host.includes('facebook.com') || host.includes('twitter.com') || host.includes('x.com')) {
        return videos;
      }

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
          let instaThumb = null;
          if (window.location.href.includes('/p/') || window.location.href.includes('/reel/') || window.location.href.includes('/reels/')) {
            const ogImage = document.querySelector('meta[property="og:image"]');
            if (ogImage && ogImage.content) instaThumb = ogImage.content;
          }
          newVideos.push({ url: instaUrl, type: 'instagram', title: instaTitle, element: video, thumbnail: instaThumb });
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
        if (video.paused && window.location.pathname === '/') return;
        
        let tiktokUrl = null;
        let specificTitle = null;
        
        if (window.location.pathname.includes('/video/') || window.location.pathname.includes('/v/')) {
          tiktokUrl = window.location.href;
        } else {
          let container = video.closest('[data-e2e="recommend-list-item-container"], .tiktok-web-player, [data-e2e="feed-video"]');
          if (container) {
             const a = container.querySelector('a[href*="/video/"], a[href*="/v/"]');
             if (a) tiktokUrl = a.href;
             
             if (!tiktokUrl) {
                const itemId = container.getAttribute('data-item-id') || (container.id && container.id.match(/(\d{15,})/) ? container.id.match(/(\d{15,})/)[1] : null);
                let username = '@tiktok';
                const authorEl = container.querySelector('[data-e2e="video-author-uniqueid"], [data-e2e="browser-nickname"]');
                if (authorEl && authorEl.textContent) {
                   username = authorEl.textContent.trim();
                   if (!username.startsWith('@')) username = '@' + username;
                } else {
                   const authorLink = container.querySelector('a[href^="/@"]');
                   if (authorLink) username = authorLink.getAttribute('href').split('/')[1].split('?')[0];
                }
                if (itemId) tiktokUrl = `https://www.tiktok.com/${username}/video/${itemId}`;
             }
             
             const descEl = container.querySelector('[data-e2e="video-desc"]');
             if (descEl && descEl.textContent) {
                specificTitle = descEl.textContent.trim();
             }
          }
        }
        
        if (tiktokUrl) {
           let titleToUse = specificTitle;
           if (!titleToUse) {
             let docTitle = document.title || '';
             if (docTitle.includes(' | TikTok')) titleToUse = docTitle.split(' | TikTok')[0].trim();
             else titleToUse = extractSmartTitle(video);
           }
           if (titleToUse.length > 80) titleToUse = titleToUse.substring(0, 80) + '...';
           newVideos.push({ url: tiktokUrl, type: 'tiktok', title: titleToUse, element: video });
        }
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
            const thumb = captureThumbnail(video);
            if (thumb) {
              chrome.runtime.sendMessage({
                action: 'set_hls_metadata',
                thumbnail: thumb
              }).catch(()=>{});
              return true;
            }
          return false;
        };
        
        if (!video.dataset.asterHlsListener) {
          video.dataset.asterHlsListener = "true";
          if (!sendHlsMeta()) {
            const handleHlsTimeUpdate = () => {
              if (sendHlsMeta()) {
                video.removeEventListener('timeupdate', handleHlsTimeUpdate);
              }
            };
            video.addEventListener('timeupdate', handleHlsTimeUpdate);
          }
        }
      }
    });
    
    // Adiciona ao map para desduplicação + envia em tempo real ao Side Panel
    newVideos.forEach(v => {
      const isNew = !detectedVideos.has(v.url);
      const existing = detectedVideos.get(v.url);

      // Só captura/recaptura thumbnail se for vídeo novo, ou se o já existente
      // ainda não tem nenhuma thumbnail (ex: primeira tentativa caiu num frame preto)
      let thumbnail = existing?.thumbnail || null;
      if (!thumbnail && (isNew || !existing?.thumbnail)) {
        if (v.type === 'youtube') {
           try {
             const ytUrl = new URL(v.url);
             let vidId = null;
             if (ytUrl.hostname === 'youtu.be') vidId = ytUrl.pathname.substring(1);
             else if (ytUrl.searchParams.has('v')) vidId = ytUrl.searchParams.get('v');
             else if (ytUrl.pathname.includes('/shorts/')) vidId = ytUrl.pathname.split('/shorts/')[1].split('/')[0].split('?')[0];
             if (vidId) thumbnail = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
           } catch(e) {}
        }
        
        if (!thumbnail) {
          try {
            const videoEl = v.element || document.querySelector('video');
            
            if (videoEl && videoEl.poster) {
              thumbnail = videoEl.poster;
            }

            if (!thumbnail && videoEl) {
              const tryCapture = () => {
                if (videoEl && videoEl.readyState >= 3 && videoEl.currentTime > 1) {
                  const result = captureThumbnail(videoEl);
                  if (result) {
                    v.thumbnail = result;
                    detectedVideos.set(v.url, v);
                    if (v.addedToList) {
                      try {
                        chrome.runtime.sendMessage({
                          action: 'video_detected',
                          video: { url: v.url, type: v.type, title: v.title || null, thumbnail: v.thumbnail }
                        }).catch(() => {});
                      } catch (err) {}
                    }
                  }
                }
              };
              if (window.requestIdleCallback) {
                window.requestIdleCallback(tryCapture, { timeout: 1000 });
              } else {
                setTimeout(tryCapture, 300);
              }
            }

            if (!thumbnail && videoEl && !window.asterThumbListeners.has(videoEl)) {
              window.asterThumbListeners.set(videoEl, true);
              const handleTimeUpdate = () => {
                if (videoEl.readyState >= 3 && videoEl.videoWidth > 0 && videoEl.currentTime > 1) {
                  videoEl.removeEventListener('timeupdate', handleTimeUpdate);
                  clearTimeout(window.scanTimeout);
                  window.scanTimeout = setTimeout(scanForVideos, 500);
                }
              };
              videoEl.addEventListener('timeupdate', handleTimeUpdate);
            }
          } catch (e) {
            // Cross-origin ou DRM, thumbnail ficará null
          }
        }
      }
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
    
    const allVideos = findAllVideos(document);
    let videoEl = allVideos.find(v => v.readyState >= 2 && v.videoWidth > 0) || allVideos[0] || null;
    let title = extractSmartTitle(videoEl);
    
    try {
      thumbnail = captureThumbnail(videoEl);
      if (!thumbnail && videoEl && videoEl.poster) {
        thumbnail = videoEl.poster;
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
