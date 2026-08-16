// ============================================
// Aster Side Panel — Main Logic
// ============================================

let currentLanguage = 'pt-BR';

function t(key, ...args) {
  let str = (window.i18n && window.i18n[currentLanguage] && window.i18n[currentLanguage][key]) ? window.i18n[currentLanguage][key] : key;
  args.forEach((arg, i) => {
    str = str.replace(`{${i}}`, arg);
  });
  return str;
}


document.addEventListener('DOMContentLoaded', () => {
  const videoList = document.getElementById('video-list');
  const emptyState = document.getElementById('empty-state');
  const statusBadge = document.getElementById('status-badge');
  const videoCount = document.getElementById('video-count');
  
  const panelVideos = document.getElementById('panel-videos');
  const panelHistory = document.getElementById('panel-history');
  const panelSettings = document.getElementById('panel-settings');
  const panelTrash = document.getElementById('panel-trash');
  
  const clearBtn = document.getElementById('clear-btn');
  const historyBtn = document.getElementById('history-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const openTrashBtn = document.getElementById('open-trash-btn');
  const backFromHistory = document.getElementById('back-from-history');
  const backFromSettings = document.getElementById('back-from-settings');
  const backFromTrash = document.getElementById('back-from-trash');

  const modeToggle = document.getElementById('mode-toggle');
  const modeToggleLabel = document.getElementById('mode-toggle-label');

  // Inicializa estado do toggle de modo de detecção
  chrome.storage.local.get(['aster_detection_mode'], (data) => {
    const container = modeToggle.closest('.mode-toggle-container');
    if (data.aster_detection_mode === 'manual') {
      modeToggle.checked = false;
      modeToggleLabel.textContent = t('mode_manual');
      modeToggleLabel.style.color = 'var(--text-muted)';
      container.setAttribute('data-i18n-title', 'mode_manual_desc');
    } else {
      modeToggle.checked = true;
      modeToggleLabel.textContent = t('mode_auto');
      modeToggleLabel.style.color = 'var(--accent)';
      container.setAttribute('data-i18n-title', 'mode_auto_desc');
    }
    container.title = t(container.getAttribute('data-i18n-title'));
  });

  const languageSelect = document.getElementById('language-select');

  function applyLanguage(lang) {
    if (lang === 'system') {
      const sysLang = navigator.language;
      lang = (window.i18n && window.i18n[sysLang]) ? sysLang : (sysLang.startsWith('pt') ? 'pt-BR' : 'en-US');
    }
    if (!window.i18n || !window.i18n[lang]) lang = 'en-US';
    currentLanguage = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (window.i18n && window.i18n[lang] && window.i18n[lang][key]) {
        el.textContent = window.i18n[lang][key];
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (window.i18n && window.i18n[lang] && window.i18n[lang][key]) {
        el.setAttribute('title', window.i18n[lang][key]);
      }
    });
  }

  chrome.storage.sync.get(['aster_language'], (data) => {
    let savedLang = data.aster_language || 'system';
    if (languageSelect) languageSelect.value = savedLang;
    applyLanguage(savedLang);
    
    // Update dynamic initial texts
    const container = modeToggle.closest('.mode-toggle-container');
    if (modeToggle.checked) {
      modeToggleLabel.textContent = t('mode_auto');
      container.setAttribute('data-i18n-title', 'mode_auto_desc');
    } else {
      modeToggleLabel.textContent = t('mode_manual');
      container.setAttribute('data-i18n-title', 'mode_manual_desc');
    }
    container.title = t(container.getAttribute('data-i18n-title'));
    if (statusBadge.textContent === 'Aguardando vídeos...' || statusBadge.textContent === 'Waiting for videos...') {
      statusBadge.textContent = t('status_waiting');
    }
  });

  if (languageSelect) {
    languageSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      chrome.storage.sync.set({ aster_language: lang });
      applyLanguage(lang);
      renderVideoList();
      renderHistory();
      if (panelTrash && panelTrash.style.display !== 'none') renderTrash();
    });
  }

  modeToggle.addEventListener('change', (e) => {
    const isAuto = e.target.checked;
    const mode = isAuto ? 'auto' : 'manual';
    const container = modeToggle.closest('.mode-toggle-container');
    
    if (isAuto) {
      modeToggleLabel.textContent = t('mode_auto');
      modeToggleLabel.style.color = 'var(--accent)';
      container.setAttribute('data-i18n-title', 'mode_auto_desc');
    } else {
      modeToggleLabel.textContent = t('mode_manual');
      modeToggleLabel.style.color = 'var(--text-muted)';
      container.setAttribute('data-i18n-title', 'mode_manual_desc');
    }
    container.title = t(container.getAttribute('data-i18n-title'));

    chrome.storage.local.set({ aster_detection_mode: mode });
  });

  // Estado local: vídeos detectados no painel
  let detectedVideos = [];
  const activeDownloadsSet = new Set();
  
  chrome.runtime.sendMessage({ action: 'get_active_downloads' }, (response) => {
    if (response && response.activeUrls) {
      response.activeUrls.forEach(u => activeDownloadsSet.add(u));
    }
  });

  chrome.storage.local.get(['aster_detected_videos'], (data) => {
    if (data.aster_detected_videos) {
      detectedVideos = data.aster_detected_videos;
      renderVideoList();
    }
  });

  function saveVideos() {
    chrome.storage.local.set({ aster_detected_videos: detectedVideos });
  }

  // =========================================
  // Help Modal
  // =========================================
  const helpModal = document.getElementById('help-modal');
  const noVideoBtn = document.getElementById('no-video-btn');
  const closeHelpModal = document.getElementById('close-help-modal');

  if (noVideoBtn && helpModal && closeHelpModal) {
    noVideoBtn.addEventListener('click', () => {
      helpModal.style.display = 'flex';
    });

    closeHelpModal.addEventListener('click', () => {
      helpModal.style.display = 'none';
    });

    // Close when clicking outside
    helpModal.addEventListener('click', (e) => {
      if (e.target === helpModal) {
        helpModal.style.display = 'none';
      }
    });
  }

  // =========================================
  // Panel Navigation
  // =========================================
  function showPanel(panel) {
    panelVideos.style.display = 'none';
    panelHistory.style.display = 'none';
    panelSettings.style.display = 'none';
    if (panelTrash) panelTrash.style.display = 'none';
    panel.style.display = 'block';

    const downloadAllContainer = document.getElementById('download-all-container');
    if (downloadAllContainer) {
      downloadAllContainer.style.display = panel === panelVideos ? 'block' : 'none';
    }
  }

  historyBtn.addEventListener('click', () => {
    renderHistory();
    showPanel(panelHistory);
  });
  settingsBtn.addEventListener('click', () => showPanel(panelSettings));
  if (openTrashBtn) {
    openTrashBtn.addEventListener('click', () => {
      renderTrash();
      showPanel(panelTrash);
    });
  }
  backFromHistory.addEventListener('click', () => showPanel(panelVideos));
  backFromSettings.addEventListener('click', () => showPanel(panelVideos));
  if (backFromTrash) {
    backFromTrash.addEventListener('click', () => {
      renderHistory();
      showPanel(panelHistory);
    });
  }

  function formatFriendlyProgress(rawText) {
    if (!rawText) return t('prog_processing') || 'Processando...';
    const text = rawText.trim();

    // 1. Porcentagem de Download (yt-dlp ou HLS)
    const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      const percentStr = percentMatch[1];
      const percent = Math.round(parseFloat(percentStr));
      
      let downloadedStr = '';
      const sizeMatch = text.match(/of\s+~?([\d\.]+\s*[KMGT]?i?B)/i);
      
      if (sizeMatch) {
        let totalSizeStr = sizeMatch[1].replace(/iB/g, 'B'); // ex: 10.45MB
        
        const numMatch = totalSizeStr.match(/([\d\.]+)/);
        const unitMatch = totalSizeStr.match(/[a-zA-Z]+/);
        
        if (numMatch && unitMatch) {
          const totalNum = parseFloat(numMatch[1]);
          const unit = unitMatch[0];
          
          let downloadedNum = totalNum * (parseFloat(percentStr) / 100);
          downloadedNum = downloadedNum % 1 === 0 ? downloadedNum.toFixed(0) : downloadedNum.toFixed(2);
          
          downloadedStr = `${downloadedNum}${unit}/${totalSizeStr}`;
        } else {
          downloadedStr = `${t('prog_of') || 'de'} ${totalSizeStr}`;
        }
      } else {
        const fragMatch = text.match(/frag\s+(\d+)\/(\d+)/i);
        if (fragMatch) {
          downloadedStr = `${fragMatch[1]}/${fragMatch[2]}${t('prog_parts') || ' partes'}`;
        }
      }
      
      const speedMatch = text.match(/at\s+([\d\.]+\s*[KMGT]?i?B\/s)/i);
      const speedStr = speedMatch ? speedMatch[1].replace(/iB/g, 'B') : '';
      
      if (downloadedStr && speedStr) {
        return `${percent}% • ${downloadedStr} • ${speedStr}`;
      } else if (downloadedStr) {
        return `${percent}% • ${downloadedStr}`;
      } else if (speedStr) {
        return `${percent}% • ${speedStr}`;
      }
      
      return `${t('prog_downloading_percent') || 'Baixando: '} ${percent}%`;
    }

    // 2. Extração de informações / Burlar proteção / Início
    if (text.includes('[youtube]') || text.includes('[twitter]') || text.includes('[instagram]') || 
        text.includes('[reddit]') || text.includes('[facebook]') || text.includes('Extracting') || 
        text.includes('Downloading webpage') || text.includes('Solving JS') || text.includes('burlar') ||
        text.includes('cookies') || text.includes('API JSON') || text.includes('player API') || text.includes('Preparando')) {
      return t('prog_preparing_video') || 'Preparando vídeo...';
    }

    // 3. Pós-processamento e Mesclagem
    if (text.includes('[Merger]') || text.includes('Merging formats')) {
      return t('prog_merging') || 'Unindo áudio e vídeo...';
    }
    if (text.includes('[ExtractAudio]') || text.includes('audio-format') || text.includes('extract-audio')) {
      return t('prog_converting_audio') || 'Convertendo áudio...';
    }
    if (text.includes('[EmbedSubtitle]') || text.includes('Writing video subtitles') || text.includes('subtitles') || text.includes('--write-subs')) {
      return t('prog_embedding_subs') || 'Embutindo legendas...';
    }
    if (text.includes('Deleting original file') || text.includes('Fixup') || text.includes('pass -k to keep') || text.includes('Finalizando')) {
      return t('prog_finalizing') || 'Finalizando arquivo...';
    }

    // 4. HLS / Streaming
    if (text.includes('Analisando playlist') || text.includes('Obtendo segmentos') || text.includes('stream de vídeo') || text.includes('Analisando stream')) {
      return t('prog_analyzing_stream') || 'Analisando stream...';
    }

    // 5. Conversão FFmpeg
    if (text.includes('Tempo renderizado') || text.includes('Convertendo...')) {
      const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
      return timeMatch ? `${t('prog_converting_time') || 'Convertendo:'} ${timeMatch[1]}` : (t('prog_converting_video') || 'Convertendo vídeo...');
    }
    if (text.includes('conversão local') || text.includes('Iniciando conversão')) {
      return t('prog_starting_conversion') || 'Iniciando conversão...';
    }

    // 6. Mensagens padrão conhecidas
    if (text.includes('Iniciando yt-dlp') || text.includes('Destination:') || text.includes('Iniciando download')) {
      return t('prog_starting_download') || 'Iniciando download...';
    }

    // Se for uma mensagem curta e amigável (sem colchetes técnicos de log), mantém
    if (!text.startsWith('[') && text.length <= 35) {
      return text;
    }

    return 'Processando vídeo...';
  }

  // =========================================
  // Receive Videos in Real-Time
  // =========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // new_video_detected agora é tratado dentro de chrome.tabs.query para filtrar por aba

    if (request.action === 'companion_missing') {
      statusBadge.textContent = 'Companion App não detectado';
      statusBadge.style.color = '#ef4444';
      statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      
      let banner = document.getElementById('companion-missing-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'companion-missing-banner';
        banner.style.padding = '10px';
        banner.style.background = 'rgba(239, 68, 68, 0.1)';
        banner.style.color = '#ef4444';
        banner.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        banner.style.borderRadius = '8px';
        banner.style.marginBottom = '15px';
        banner.style.fontSize = '12px';
        banner.style.textAlign = 'center';
        banner.innerHTML = 'O <strong>Companion App</strong> não está instalado ou rodando. Para baixar, execute o arquivo <code>install.bat</code>.';
        videoList.parentNode.insertBefore(banner, videoList);
      }
      return;
    }

    if (request.action === 'companion_progress') {
      const msg = request.data;
      if (msg.status === 'info' || msg.status === 'progress') {
        const friendlyText = formatFriendlyProgress(msg.text);
        statusBadge.textContent = friendlyText;
        statusBadge.title = msg.text || friendlyText;
        
        const match = msg.text.match(/(\d+(?:\.\d+)?)%/);
        if (match && request.url) {
           const percent = parseFloat(match[1]);
           const cards = document.querySelectorAll('.video-card');
           cards.forEach(card => {
             if (card.dataset.url === request.url) {
               let pBar = card.querySelector('.progress-bar');
               if (!pBar) {
                 const pContainer = document.createElement('div');
                 pContainer.className = 'progress-container';
                 pContainer.style.width = '100%';
                 pContainer.style.height = '4px';
                 pContainer.style.background = 'rgba(255,255,255,0.1)';
                 pContainer.style.marginTop = '10px';
                 pContainer.style.borderRadius = '2px';
                 pContainer.style.overflow = 'hidden';
                 
                 pBar = document.createElement('div');
                 pBar.className = 'progress-bar';
                 pBar.style.height = '100%';
                 pBar.style.background = '#10b981';
                 pBar.style.width = '0%';
                 pBar.style.transition = 'width 0.2s';
                 
                 pContainer.appendChild(pBar);
                 card.querySelector('.video-card-body').appendChild(pContainer);
               }
               pBar.style.width = percent + '%';
             }
           });
        }
      } else if (msg.status === 'success' || msg.status === 'direct_success') {
        activeDownloadsSet.delete(request.url);
        statusBadge.textContent = t('status_completed');
        statusBadge.title = t('notif_download_success_desc');
        statusBadge.style.color = '#10b981';
        statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
        setTimeout(() => {
          statusBadge.textContent = t('status_waiting');
          statusBadge.title = '';
          statusBadge.style.color = '';
          statusBadge.style.background = '';
          statusBadge.style.borderColor = '';
        }, 5000);
        
        const cards = document.querySelectorAll('.video-card');
        cards.forEach(card => {
          if (card.dataset.url === request.url) {
            const pContainer = card.querySelector('.progress-container');
            if (pContainer) pContainer.remove();
          }
        });
        
        // Notify UI that a download finished
        document.dispatchEvent(new CustomEvent('aster_download_finished', { detail: { url: request.url } }));
      } else if (msg.status === 'error') {
        activeDownloadsSet.delete(request.url);
        let errorMsg = msg.error || t('notif_download_error_fallback');
        
        statusBadge.textContent = (t('prog_error_prefix') || 'Erro: ') + errorMsg;
        statusBadge.title = msg.error || '';
        statusBadge.style.color = '#ef4444';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        statusBadge.classList.add('error-badge-wrap');

        const copyBtn = document.getElementById('copy-error-btn');
        if (copyBtn) {
          copyBtn.style.display = 'flex';
          copyBtn.onclick = () => {
             navigator.clipboard.writeText(errorMsg).catch(()=>{});
             const oldHTML = copyBtn.innerHTML;
             copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
             setTimeout(() => { copyBtn.innerHTML = oldHTML; }, 2000);
          };
        }

        setTimeout(() => {
          statusBadge.textContent = t('status_waiting');
          statusBadge.title = '';
          statusBadge.style.color = '';
          statusBadge.style.background = '';
          statusBadge.style.borderColor = '';
          statusBadge.classList.remove('error-badge-wrap');
          if (copyBtn) copyBtn.style.display = 'none';
        }, 15000);
        
        const cards = document.querySelectorAll('.video-card');
        cards.forEach(card => {
          if (card.dataset.url === request.url) {
            const pBar = card.querySelector('.progress-bar');
            if (pBar) pBar.style.background = '#ef4444';
          }
        });
        
        // Notify UI that a download errored
        document.dispatchEvent(new CustomEvent('aster_download_finished', { detail: { url: request.url } }));
      } else if (msg.status === 'cancelled') {
        activeDownloadsSet.delete(request.url);
        statusBadge.textContent = t('btn_cancel') + 'ado'; // Roughly Download cancelado
        statusBadge.title = '';
        setTimeout(() => {
          statusBadge.textContent = t('status_waiting');
          statusBadge.style.color = '';
          statusBadge.style.background = '';
          statusBadge.style.borderColor = '';
        }, 3000);
        
        // Remove progress bar
        const cards = document.querySelectorAll('.video-card');
        cards.forEach(card => {
          if (card.dataset.url === request.url) {
            const pContainer = card.querySelector('.progress-container');
            if (pContainer) pContainer.remove();
          }
        });
        
        // Restaura os botões via evento
        document.dispatchEvent(new CustomEvent('aster_download_finished', { detail: { url: request.url } }));
      }
    }
  });

  // =========================================
  // Scan Current Tab on Open & Tab Switch
  // =========================================
  let currentTabId = null;
  let currentTabUrl = null;

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'new_video_detected') {
      if (modeToggle.checked && request.tabId !== currentTabId) return;
      const video = request.video;
      const existingIdx = detectedVideos.findIndex(v => v.url === video.url);
      if (existingIdx === -1) {
        detectedVideos.unshift(video);
        saveVideos();
        renderVideoList();
      } else {
        const existing = detectedVideos.splice(existingIdx, 1)[0];
        if (!existing.thumbnail && video.thumbnail) {
          existing.thumbnail = video.thumbnail;
        }
        detectedVideos.unshift(existing);
        saveVideos();
        renderVideoList();
      }
    }
    if (request.action === 'hls_detected') {
      if (!modeToggle.checked || request.tabId !== currentTabId) return;
      if (!detectedVideos.find(v => v.url === request.url)) {
        loadVideosForActiveTab();
      }
    }
    if (request.action === 'hls_metadata_updated') {
      if (modeToggle.checked && request.tabId !== currentTabId) return;
      let updated = false;
      detectedVideos.forEach(v => {
        if (v.type === 'hls' && !v.thumbnail && request.thumbnail) {
          v.thumbnail = request.thumbnail;
          updated = true;
        }
      });
      if (updated) { 
        saveVideos(); 
        renderVideoList(); 
      } else {
        // Se não atualizou, o vídeo pode ainda não estar na lista devido a race condition.
        // Recarrega a lista da aba ativa.
        loadVideosForActiveTab();
      }
    }
  });

  function loadVideosForActiveTab(isForceScan = false) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const activeTab = tabs[0];
      const pageUrl = activeTab.url || '';

      if (currentTabId !== activeTab.id || currentTabUrl !== pageUrl) {
        currentTabId = activeTab.id;
        currentTabUrl = pageUrl;
      } else {
        currentTabId = activeTab.id;
      }

      // Pede histórico de vídeos detectados na aba
      chrome.runtime.sendMessage({ action: 'get_tab_videos' }, (response) => {
        chrome.runtime.lastError;
        if (response && response.videos) {
          let updated = false;
          response.videos.forEach(v => {
            if (!detectedVideos.find(existing => existing.url === v.url)) {
              detectedVideos.push(v);
              updated = true;
            }
          });
          if (updated) saveVideos();
        }
        
        // YouTube special fallback
        if (pageUrl.includes('youtube.com/watch') || pageUrl.includes('youtube.com/shorts') || pageUrl.includes('youtu.be/')) {
          let ytTitle = activeTab.title ? activeTab.title.replace(/\s*-\s*YouTube$/i, '').trim() : '';
          if (!ytTitle || ytTitle.toLowerCase() === 'youtube') {
            try {
              const host = new URL(pageUrl).hostname.replace(/^www\./, '');
              ytTitle = host ? `Vídeo de ${host}` : 'Vídeo do YouTube';
            } catch(e) {
              ytTitle = 'Vídeo do YouTube';
            }
          }
          if (!detectedVideos.find(v => v.url === pageUrl)) {
            if (modeToggle.checked || isForceScan) {
              let ytThumb = null;
              try {
                const ytUrl = new URL(pageUrl);
                let vidId = null;
                if (ytUrl.hostname === 'youtu.be') vidId = ytUrl.pathname.substring(1);
                else if (ytUrl.searchParams.has('v')) vidId = ytUrl.searchParams.get('v');
                else if (ytUrl.pathname.includes('/shorts/')) vidId = ytUrl.pathname.split('/shorts/')[1].split('/')[0].split('?')[0];
                if (vidId) ytThumb = `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
              } catch(e) {}

              detectedVideos.unshift({
                url: pageUrl,
                type: 'youtube',
                title: ytTitle,
                thumbnail: ytThumb
              });
              saveVideos();
            }
          }
        }

        // HLS fallback (caso o service worker não tenha armazenado para a aba)
        chrome.runtime.sendMessage({ action: 'get_hls_streams' }, (bgResponse) => {
          if (bgResponse && bgResponse.streams && bgResponse.streams.length > 0) {
            chrome.tabs.sendMessage(activeTab.id, { action: 'get_page_metadata' }, (metaResponse) => {
              chrome.runtime.lastError; // limpa o erro se o script não estiver injetado
              
              let siteFallback = '';
              try { siteFallback = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch(e){}
              const defaultHlsTitle = siteFallback ? `Vídeo de ${siteFallback}` : 'Stream HLS (.m3u8)';
              const pageTitle = (metaResponse && metaResponse.title) ? metaResponse.title.trim() : (bgResponse.title || defaultHlsTitle);
              const pageThumb = (metaResponse && metaResponse.thumbnail) ? metaResponse.thumbnail : (bgResponse.thumbnail || null);

              bgResponse.streams.forEach((streamUrl) => {
                if (pageUrl.includes('twitter.com/') || pageUrl.includes('x.com/') || pageUrl.includes('youtube.com/') || pageUrl.includes('reddit.com/')) return;
                if (detectedVideos.find(v => v.url === streamUrl)) return;
                
                if (modeToggle.checked || isForceScan) {
                  detectedVideos.push({
                    url: streamUrl,
                    type: 'hls',
                    title: pageTitle,
                    thumbnail: pageThumb
                  });
                  saveVideos();
                }
              });
              renderVideoList();
            });
          }
          
          // Pede pro content script escanear ativamente pra pegar os que faltam
          chrome.tabs.sendMessage(activeTab.id, { action: 'get_videos' }, (csResponse) => {
            chrome.runtime.lastError;
            if (csResponse && csResponse.videos) {
              const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok', 'hls'];
              let siteFallback = '';
              try { siteFallback = new URL(pageUrl).hostname.replace(/^www\./, ''); } catch(e){}
              const defaultTitle = siteFallback ? `Vídeo de ${siteFallback}` : 'Vídeo Web';
              csResponse.videos.forEach(v => {
                if (detectedVideos.find(existing => existing.url === v.url)) return;
                const isVIP = vipTypes.includes(v.type);
                detectedVideos.push({
                  url: v.url,
                  type: isVIP ? v.type : 'html5',
                  title: v.title || defaultTitle,
                  thumbnail: v.thumbnail || null
                });
              });
              saveVideos();
            }
            renderVideoList();
          });
        });
      });
    });
  }

  chrome.tabs.onActivated.addListener((activeInfo) => {
    currentTabId = activeInfo.tabId;
    loadVideosForActiveTab();
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tabId === currentTabId && changeInfo.status === 'complete') {
      loadVideosForActiveTab();
    }
  });

  loadVideosForActiveTab();

  // =========================================
  // Render Video List
  // =========================================
  function renderVideoList() {
    videoList.innerHTML = '';

    if (detectedVideos.length === 0) {
      emptyState.style.display = 'flex';
      videoCount.textContent = '';
      return;
    }

    emptyState.style.display = 'none';
    videoCount.textContent = detectedVideos.length === 1 ? t('one_video') : t('multiple_videos', detectedVideos.length);
    statusBadge.textContent = videoCount.textContent;

    detectedVideos.forEach((video, index) => {
      const card = document.createElement('div');
      card.className = 'video-card';
      card.style.position = 'relative';
      card.dataset.url = video.url;

      // Thumbnail
      const thumbDiv = document.createElement('div');
      thumbDiv.className = 'video-thumb';
      
      let imgEl = null;
      let vidEl = null;

      if (video.thumbnail) {
        imgEl = document.createElement('img');
        imgEl.src = video.thumbnail;
        imgEl.alt = 'Preview';
        imgEl.draggable = false;
        thumbDiv.appendChild(imgEl);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'thumb-placeholder';
        placeholder.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        thumbDiv.appendChild(placeholder);
      }

      // Adiciona tag de vídeo para preview animado (apenas HTML5 direto)
      if (video.type === 'html5' || video.type === 'video/mp4') {
        vidEl = document.createElement('video');
        vidEl.className = 'video-preview';
        vidEl.src = video.url;
        vidEl.muted = true;
        vidEl.loop = true;
        vidEl.playsInline = true;
        thumbDiv.appendChild(vidEl);

        thumbDiv.addEventListener('mouseenter', () => {
          if (imgEl) imgEl.style.opacity = '0';
          vidEl.play().catch(() => {});
        });
        thumbDiv.addEventListener('mouseleave', () => {
          if (imgEl) imgEl.style.opacity = '1';
          vidEl.pause();
        });
      }

      card.appendChild(thumbDiv);

      // Body
      const body = document.createElement('div');
      body.className = 'video-card-body';

      const title = document.createElement('div');
      title.className = 'video-card-title';
      title.textContent = video.title || t('fallback_no_title');
      body.appendChild(title);

      // Meta badges
      const meta = document.createElement('div');
      meta.className = 'video-card-meta';

      const typeLabels = {
        'youtube': 'YT-DLP', 'twitter': 'X-DLP', 'instagram': 'INSTA',
        'facebook': 'FB', 'reddit': 'REDDIT', 'tiktok': 'TIKTOK', 'hls': 'M3U8', 'html5': 'HTML5'
      };
      const fmtBadge = document.createElement('span');
      fmtBadge.className = 'badge badge-format';
      fmtBadge.textContent = typeLabels[video.type] || 'VIDEO';
      meta.appendChild(fmtBadge);
      body.appendChild(meta);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'video-card-actions';

      const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok', 'hls'];
      const isVIP = vipTypes.includes(video.type);

      const qualitySelect = document.createElement('select');
      qualitySelect.className = 'quality-select';

      if (isVIP) {
        if (video.cachedFormats) {
          qualitySelect.innerHTML = `<option value="best">${t('qual_best_avail')}</option>`;
          if (video.cachedFormats.length > 0) {
            video.cachedFormats.forEach(f => {
              qualitySelect.innerHTML += `<option value="${f.height}p">MP4 ${f.height}p (${f.width}x${f.height})</option>`;
            });
            const qBadge = document.createElement('span');
            qBadge.className = 'badge badge-quality';
            qBadge.textContent = video.cachedFormats[0].height + 'p';
            meta.appendChild(qBadge);
          } else {
            ['1080', '720', '480', '360'].forEach(h => {
              qualitySelect.innerHTML += `<option value="${h}p">MP4 ${h}p</option>`;
            });
            if (video.cachedError) {
              const warnBadge = document.createElement('span');
              warnBadge.className = 'badge badge-format-error';
              warnBadge.textContent = '⚠';
              warnBadge.title = `Não foi possível obter as resoluções reais: ${video.cachedError}`;
              meta.appendChild(warnBadge);
            }
          }
          qualitySelect.innerHTML += `<option value="audio">${t('qual_audio')}</option>`;
          qualitySelect.disabled = false;
        } else {
          qualitySelect.innerHTML = `<option value="">${t('qual_loading')}</option>`;
          qualitySelect.disabled = true;
          fetchFormats(video);
        }
      } else {
        qualitySelect.innerHTML = `
          <option value="best">${t('qual_best')}</option>
          <option value="1080p">MP4 1080p</option>
          <option value="720p">MP4 720p</option>
          <option value="480p">MP4 480p</option>
          <option value="audio">${t('qual_audio')}</option>
        `;
      }
      actions.appendChild(qualitySelect);

      const btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.gap = '6px';
      btnRow.style.width = '100%';

      const audioBtn = document.createElement('button');
      audioBtn.className = 'download-btn';
      audioBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
      audioBtn.title = 'Baixar Áudio';
      audioBtn.style.background = '#8b5cf6';
      audioBtn.style.padding = '5px 8px';
      if (isVIP && !video.cachedFormats) {
        audioBtn.disabled = true;
        audioBtn.style.opacity = '0.4';
      }
      btnRow.appendChild(audioBtn);

      const dlBtn = document.createElement('button');
      dlBtn.className = 'download-btn';
      dlBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> ' + t('btn_download');
      dlBtn.style.flex = '1';
      if (isVIP && !video.cachedFormats) {
        dlBtn.disabled = true;
        dlBtn.style.opacity = '0.4';
      }
      btnRow.appendChild(dlBtn);
      
      actions.appendChild(btnRow);
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'download-btn';
      cancelBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> ' + t('btn_cancel');
      cancelBtn.style.display = 'none';
      cancelBtn.style.background = '#ef4444';
      cancelBtn.style.width = '100%';
      
      audioBtn.addEventListener('click', () => {
        downloadVideo(video, 'audio');
        btnRow.style.display = 'none';
        cancelBtn.style.display = 'flex';
      });

      dlBtn.addEventListener('click', () => {
        const quality = qualitySelect.value;
        downloadVideo(video, quality);
        btnRow.style.display = 'none';
        cancelBtn.style.display = 'flex';
      });
      
      cancelBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'cancel_companion_download', url: video.url });
        statusBadge.textContent = 'Download cancelado';
        cancelBtn.style.display = 'none';
        btnRow.style.display = 'flex';
      });
      actions.appendChild(cancelBtn);
      
      if (activeDownloadsSet.has(video.url)) {
        btnRow.style.display = 'none';
        cancelBtn.style.display = 'flex';
      }
      
      document.addEventListener('aster_download_finished', (e) => {
        if (e.detail.url === video.url) {
          cancelBtn.style.display = 'none';
          btnRow.style.display = 'flex';
        }
      });
      
      body.appendChild(actions);
      card.appendChild(body);

      // Dismiss (X) button
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'dismiss-btn';
      dismissBtn.textContent = '×';
      dismissBtn.title = 'Remover';
      dismissBtn.addEventListener('click', () => {
        detectedVideos.splice(index, 1);
        saveVideos();
        renderVideoList();
      });
      card.appendChild(dismissBtn);

      videoList.appendChild(card);
    });
  }

  // =========================================
  // Fetch Formats via Companion App
  // =========================================
  function fetchFormats(video) {
    if (video.isFetchingFormats || video.cachedFormats) return;
    video.isFetchingFormats = true;
    const getCookies = (domains, targetUrl = null) => {
      return new Promise(resolve => {
        if (!chrome.cookies) return resolve([]);
        let all = [];
        const tasks = [];
        
        if (targetUrl) {
          tasks.push(new Promise(res => {
            chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
              all = all.concat(cookies || []);
              res();
            });
          }));
        }

        domains.forEach(d => {
          tasks.push(new Promise(res => {
            chrome.cookies.getAll({ domain: d }, (cookies) => {
              all = all.concat(cookies || []);
              res();
            });
          }));
        });

        Promise.all(tasks).then(() => {
          // Deduplicar cookies por domain + name + path
          const seen = new Set();
          const unique = all.filter(c => {
            const key = `${c.domain}|${c.name}|${c.path}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          resolve(unique);
        });
      });
    };

    const domainMap = {
      'youtube': [], 'twitter': ['twitter.com', 'x.com'],
      'instagram': ['instagram.com'], 'facebook': ['facebook.com'],
      'reddit': ['reddit.com'], 'tiktok': ['tiktok.com', 'www.tiktok.com', '.tiktok.com'], 'hls': []
    };
    const domains = domainMap[video.type] || [];

    let cookiePromise;
    if (video.type === 'youtube') {
      cookiePromise = getCookies([], "https://www.youtube.com");
    } else if (video.type === 'tiktok') {
      cookiePromise = getCookies(domains, "https://www.tiktok.com");
    } else if (video.type === 'instagram') {
      cookiePromise = getCookies(domains, "https://www.instagram.com");
    } else if (video.type === 'twitter') {
      cookiePromise = getCookies(domains, "https://x.com");
    } else {
      cookiePromise = getCookies(domains);
    }

    cookiePromise.then(cookies => {
      chrome.runtime.sendMessage({
        action: 'get_formats',
        url: video.url,
        type: video.type,
        cookies: cookies.length > 0 ? cookies : null
      }, (response) => {
        chrome.runtime.lastError;
        if (response && response.title) {
          video.title = response.title;
        }
        if (!response || !response.formats) {
          video.cachedFormats = [];
          video.cachedError = response ? response.error : 'Unknown error';
        } else {
          video.cachedFormats = response.formats;
        }
        renderVideoList();
      });
    });

    // YouTube special: also get DOM formats for resolution display
    if (video.type === 'youtube') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        
        const activeUrl = tabs[0].url || '';
        if (!activeUrl.includes('youtube.com/watch') && !activeUrl.includes('youtube.com/shorts') && !activeUrl.includes('youtu.be/')) return;
        
        const getVideoId = (u) => {
          try {
            const url = new URL(u);
            if (url.searchParams.has('v')) return url.searchParams.get('v');
            if (url.pathname.includes('/shorts/')) return url.pathname.split('/shorts/')[1];
            return url.pathname.split('/').pop();
          } catch(e) { return null; }
        };
        const vid1 = getVideoId(video.url);
        const vid2 = getVideoId(activeUrl);
        if (vid1 && vid2 && vid1 !== vid2) return;

        chrome.tabs.sendMessage(tabs[0].id, { action: 'get_youtube_formats' }, (response) => {
          chrome.runtime.lastError;
          if (response && response.title) {
            video.title = response.title;
          }
          if (response && response.formats && response.formats.length > 0) {
            video.cachedFormats = response.formats;
            renderVideoList();
          }
        });
      });
    }
  }

  // =========================================
  // Download Video
  // =========================================
  function downloadVideo(video, quality) {
    activeDownloadsSet.add(video.url);
    chrome.storage.local.get('aster_settings', (data) => {
      const settings = data.aster_settings || {};
      const isDirect = settings.directDownloadEnabled === true;
      const dirPath = settings.directDownloadPath || '';
      
      if (isDirect && dirPath.trim() === '') {
        alert(t ? t('alert_direct_path_missing') : "Por favor, defina o Caminho da Pasta nas configurações.");
        activeDownloadsSet.delete(video.url);
        renderVideoList();
        return;
      }
      
      let actionName = 'download_video';
      const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok', 'hls'];
      if (vipTypes.includes(video.type)) actionName = 'download_youtube';
      if (video.type === 'html5') {
        if (quality && quality !== 'best') {
          actionName = 'download_html5_converted';
        } else if (isDirect) {
          actionName = 'download_youtube'; // Encaminha para o yt-dlp no companion app para suportar o caminho direto
        }
      }

      statusBadge.textContent = 'Iniciando download...';

      const getCookiesAndSend = (domains, targetUrl = null) => {
        if (!chrome.cookies) {
          chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, quality: quality, directDownload: isDirect, directPath: dirPath });
          return;
        }
        let all = [];
        const tasks = [];

        if (targetUrl) {
          tasks.push(new Promise(res => {
            chrome.cookies.getAll({ url: targetUrl }, (cookies) => {
              all = all.concat(cookies || []);
              res();
            });
          }));
        }

        domains.forEach(d => {
          tasks.push(new Promise(res => {
            chrome.cookies.getAll({ domain: d }, (cookies) => {
              all = all.concat(cookies || []);
              res();
            });
          }));
        });

        Promise.all(tasks).then(() => {
          const seen = new Set();
          const unique = all.filter(c => {
            const key = `${c.domain}|${c.name}|${c.path}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, cookies: unique.length > 0 ? unique : null, quality: quality, directDownload: isDirect, directPath: dirPath });
        });
      };

      if (video.type === 'youtube') {
        getCookiesAndSend([], "https://www.youtube.com");
      } else if (video.type === 'tiktok') {
        getCookiesAndSend(['tiktok.com', 'www.tiktok.com', '.tiktok.com'], "https://www.tiktok.com");
      } else if (video.type === 'twitter') {
        getCookiesAndSend(['twitter.com', 'x.com'], "https://x.com");
      } else if (video.type === 'instagram') {
        getCookiesAndSend(['instagram.com'], "https://www.instagram.com");
      } else if (video.type === 'facebook') {
        getCookiesAndSend(['facebook.com'], "https://www.facebook.com");
      } else if (video.type === 'reddit') {
        getCookiesAndSend(['reddit.com'], "https://www.reddit.com");
      } else {
        let urlDomain;
        try { urlDomain = new URL(video.url).hostname; } catch(e) {}
        if (isDirect && actionName === 'download_youtube' && urlDomain) {
          getCookiesAndSend([urlDomain], video.url);
        } else {
          chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, quality: quality, directDownload: isDirect, directPath: dirPath });
        }
      }
    });
  }

  // =========================================
  // Force Scan / Clear Detected Videos
  // =========================================
  const forceScanBtn = document.getElementById('force-scan-btn');
  if (forceScanBtn) {
    forceScanBtn.addEventListener('click', () => {
      forceScanBtn.disabled = true;
      statusBadge.textContent = 'Procurando vídeo na página...';
      
      // Limpa o cache de formatos para forçar uma nova busca ao clicar manualmente
      detectedVideos.forEach(v => {
        v.cachedFormats = null;
        v.isFetchingFormats = false;
        v.cachedError = null;
      });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) { forceScanBtn.disabled = false; return; }
        chrome.tabs.sendMessage(tabs[0].id, { action: 'force_scan' }, (response) => {
          chrome.runtime.lastError; // limpa erro se o content script não estiver injetado
          loadVideosForActiveTab(true);
          setTimeout(() => { forceScanBtn.disabled = false; }, 1000);
        });
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clear_tab_videos' });
    detectedVideos = [];
    saveVideos();
    renderVideoList();
    statusBadge.textContent = 'Lista limpa';
    setTimeout(() => {
      statusBadge.textContent = t('status_waiting');
    }, 2000);
  });

  const downloadAllBtn = document.getElementById('download-all-btn');
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', () => {
      if (!detectedVideos || detectedVideos.length === 0) return;
      detectedVideos.forEach(video => {
        const card = document.querySelector(`.video-card[data-url="${video.url}"]`);
        let quality = 'best';
        if (card) {
          const select = card.querySelector('.quality-select');
          if (select) quality = select.value;
        }
        downloadVideo(video, quality);
        
        // Hide download buttons and show cancel on the card
        if (card) {
          const btnRow = card.querySelector('.video-card-actions > div[style*="display: flex"]');
          const cancelBtn = card.querySelector('.download-btn:last-child'); // The cancel button
          if (btnRow) btnRow.style.display = 'none';
          if (cancelBtn) cancelBtn.style.display = 'flex';
        }
      });
    });
  }

  // =========================================
  // History & Trash Panels
  // =========================================
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');
  const trashList = document.getElementById('trash-list');
  const emptyTrashBtn = document.getElementById('empty-trash-btn');

  function pruneExpiredTrash(callback) {
    chrome.storage.local.get(['aster_trash', 'aster_settings'], (data) => {
      let trash = data.aster_trash || [];
      const settings = data.aster_settings || {};
      const retentionDays = parseInt(settings.trashRetentionDays, 10) || 7;
      const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const initialCount = trash.length;
      trash = trash.filter(item => (now - (item.deletedAt || item.timestamp || now)) < maxAgeMs);
      if (trash.length !== initialCount) {
        chrome.storage.local.set({ aster_trash: trash }, () => {
          if (callback) callback(trash);
        });
      } else {
        if (callback) callback(trash);
      }
    });
  }

  function renderHistory() {
    pruneExpiredTrash();
    chrome.storage.local.get('aster_history', (data) => {
      historyList.innerHTML = '';
      const history = data.aster_history || [];

      if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-state" style="padding: 20px 0;"><p style="font-size: 13px;">Nenhum download registrado.</p></div>';
        clearHistoryBtn.style.display = 'none';
        return;
      }

      clearHistoryBtn.style.display = 'block';
      history.slice().reverse().forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
            <div class="history-item-title" title="${item.title || item.url}" style="flex: 1; margin-bottom: 0;">${item.title || item.url}</div>
            <button class="history-item-delete-btn" data-timestamp="${item.timestamp}" title="Mover para a lixeira">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
          <div class="history-item-meta" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <span>${new Date(item.timestamp).toLocaleString()}</span>
              <span class="${item.status === 'success' ? 'history-status-success' : 'history-status-error'}">${item.status === 'success' ? '✓ ' + t('status_completed') : '✗ ' + t('btn_failed')}</span>
            </div>
            ${item.url ? `<a href="${item.url}" target="_blank" title="Abrir link original" style="color: var(--accent); background: rgba(123, 97, 255, 0.15); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center; text-decoration: none; transition: background 0.2s;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> Link</a>` : ''}
          </div>
        `;

        const deleteBtn = el.querySelector('.history-item-delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ts = Number(deleteBtn.dataset.timestamp);
            chrome.storage.local.get(['aster_history', 'aster_trash'], (hData) => {
              let curHistory = hData.aster_history || [];
              let curTrash = hData.aster_trash || [];
              const idx = curHistory.findIndex(h => h.timestamp === ts);
              if (idx !== -1) {
                const itemToTrash = curHistory.splice(idx, 1)[0];
                itemToTrash.deletedAt = Date.now();
                curTrash.push(itemToTrash);
                chrome.storage.local.set({ aster_history: curHistory, aster_trash: curTrash }, () => renderHistory());
              }
            });
          });
        }

        historyList.appendChild(el);
      });
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.get(['aster_history', 'aster_trash'], (hData) => {
      const curHistory = hData.aster_history || [];
      let curTrash = hData.aster_trash || [];
      if (curHistory.length > 0) {
        const now = Date.now();
        const trashed = curHistory.map(item => ({ ...item, deletedAt: now }));
        curTrash = curTrash.concat(trashed);
        chrome.storage.local.set({ aster_history: [], aster_trash: curTrash }, () => renderHistory());
      }
    });
  });

  function renderTrash() {
    pruneExpiredTrash((trash) => {
      trashList.innerHTML = '';
      if (!trash || trash.length === 0) {
        trashList.innerHTML = '<div class="empty-state" style="padding: 20px 0;"><p style="font-size: 13px;">Lixeira vazia.</p></div>';
        emptyTrashBtn.style.display = 'none';
        return;
      }

      emptyTrashBtn.style.display = 'block';
      trash.slice().reverse().forEach(item => {
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
            <div class="history-item-title" title="${item.title || item.url}" style="flex: 1; margin-bottom: 0;">${item.title || item.url}</div>
            <div class="trash-item-actions">
              <button class="trash-btn trash-restore-btn" data-timestamp="${item.timestamp}" title="Restaurar para o histórico">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                </svg>
                Restaurar
              </button>
              <button class="trash-btn trash-delete-btn" data-timestamp="${item.timestamp}" title="Excluir permanentemente">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          <div class="history-item-meta" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div style="display: flex; gap: 8px; align-items: center;">
              <span>Excluído: ${new Date(item.deletedAt || item.timestamp).toLocaleDateString()}</span>
              <span class="${item.status === 'success' ? 'history-status-success' : 'history-status-error'}">${item.status === 'success' ? '✓ ' + t('status_completed') : '✗ ' + t('btn_failed')}</span>
            </div>
            ${item.url ? `<a href="${item.url}" target="_blank" title="Abrir link original" style="color: var(--accent); background: rgba(123, 97, 255, 0.15); padding: 4px 6px; border-radius: 4px; display: flex; align-items: center; justify-content: center; text-decoration: none; transition: background 0.2s;"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg> Link</a>` : ''}
          </div>
        `;

        const restoreBtn = el.querySelector('.trash-restore-btn');
        if (restoreBtn) {
          restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ts = Number(restoreBtn.dataset.timestamp);
            chrome.storage.local.get(['aster_history', 'aster_trash'], (data) => {
              let curHistory = data.aster_history || [];
              let curTrash = data.aster_trash || [];
              const idx = curTrash.findIndex(t => t.timestamp === ts);
              if (idx !== -1) {
                const itemToRestore = curTrash.splice(idx, 1)[0];
                delete itemToRestore.deletedAt;
                curHistory.push(itemToRestore);
                chrome.storage.local.set({ aster_history: curHistory, aster_trash: curTrash }, () => renderTrash());
              }
            });
          });
        }

        const deletePermBtn = el.querySelector('.trash-delete-btn');
        if (deletePermBtn) {
          deletePermBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ts = Number(deletePermBtn.dataset.timestamp);
            chrome.storage.local.get('aster_trash', (data) => {
              let curTrash = data.aster_trash || [];
              const idx = curTrash.findIndex(t => t.timestamp === ts);
              if (idx !== -1) {
                curTrash.splice(idx, 1);
                chrome.storage.local.set({ aster_trash: curTrash }, () => renderTrash());
              }
            });
          });
        }

        trashList.appendChild(el);
      });
    });
  }

  if (emptyTrashBtn) {
    emptyTrashBtn.addEventListener('click', () => {
      chrome.storage.local.set({ aster_trash: [] }, () => renderTrash());
    });
  }

  // =========================================
  // Settings Panel
  // =========================================

  const notificationsToggle = document.getElementById('notifications-toggle');

  const directDownloadToggle = document.getElementById('direct-download-toggle');
  const directDownloadPath = document.getElementById('direct-download-path');
  const directDownloadPathContainer = document.getElementById('direct-download-path-container');

  if (directDownloadToggle && directDownloadPathContainer && directDownloadPath) {
    chrome.storage.local.get('aster_settings', (data) => {
      const settings = data.aster_settings || {};
      directDownloadToggle.checked = settings.directDownloadEnabled === true;
      directDownloadPath.value = settings.directDownloadPath || '';
      directDownloadPathContainer.style.display = settings.directDownloadEnabled ? 'flex' : 'none';
    });

    directDownloadToggle.addEventListener('change', () => {
      const isEnabled = directDownloadToggle.checked;
      directDownloadPathContainer.style.display = isEnabled ? 'flex' : 'none';
      chrome.storage.local.get('aster_settings', (data) => {
        const settings = data.aster_settings || {};
        settings.directDownloadEnabled = isEnabled;
        chrome.storage.local.set({ aster_settings: settings });
      });
    });

    directDownloadPath.addEventListener('change', () => {
      chrome.storage.local.get('aster_settings', (data) => {
        const settings = data.aster_settings || {};
        settings.directDownloadPath = directDownloadPath.value;
        chrome.storage.local.set({ aster_settings: settings });
      });
    });
  }
  if (notificationsToggle) {
    chrome.storage.local.get('aster_settings', (data) => {
      const settings = data.aster_settings || {};
      notificationsToggle.checked = settings.notificationsEnabled !== false;
    });

    notificationsToggle.addEventListener('change', () => {
      chrome.storage.local.get('aster_settings', (data) => {
        const settings = data.aster_settings || {};
        settings.notificationsEnabled = notificationsToggle.checked;
        chrome.storage.local.set({ aster_settings: settings });
      });
    });
  }

  const showButtonToggle = document.getElementById('show-button-toggle');
  if (showButtonToggle) {
    chrome.storage.local.get('aster_settings', (data) => {
      const settings = data.aster_settings || {};
      showButtonToggle.checked = settings.showVideoHoverButton !== false;
    });

    showButtonToggle.addEventListener('change', () => {
      chrome.storage.local.get('aster_settings', (data) => {
        const settings = data.aster_settings || {};
        settings.showVideoHoverButton = showButtonToggle.checked;
        chrome.storage.local.set({ aster_settings: settings });
      });
    });
  }

  const trashRetentionSelect = document.getElementById('trash-retention-select');
  if (trashRetentionSelect) {
    chrome.storage.local.get('aster_settings', (data) => {
      const settings = data.aster_settings || {};
      trashRetentionSelect.value = String(settings.trashRetentionDays || 7);
    });

    trashRetentionSelect.addEventListener('change', () => {
      chrome.storage.local.get('aster_settings', (data) => {
        const settings = data.aster_settings || {};
        settings.trashRetentionDays = parseInt(trashRetentionSelect.value, 10) || 7;
        chrome.storage.local.set({ aster_settings: settings }, () => {
          pruneExpiredTrash();
        });
      });
    });
  }

  const updateYtdlpBtn = document.getElementById('update-ytdlp-btn');
  if (updateYtdlpBtn) {
    updateYtdlpBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'update_ytdlp' });
      statusBadge.textContent = 'Iniciando atualização...';
    });
  }

});
