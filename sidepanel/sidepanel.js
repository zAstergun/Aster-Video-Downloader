// ============================================
// Aster Side Panel — Main Logic
// ============================================

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

  // Estado local: vídeos detectados no painel
  let detectedVideos = [];

  // =========================================
  // Donation Banner
  // =========================================
  const donateBanner = document.getElementById('donate-banner');
  const donateClose = document.getElementById('donate-close');

  chrome.storage.local.get('aster_donate_dismissed', (data) => {
    if (data.aster_donate_dismissed) {
      donateBanner.classList.add('hidden');
    }
  });

  donateClose.addEventListener('click', () => {
    donateBanner.classList.add('hidden');
    chrome.storage.local.set({ aster_donate_dismissed: true });
  });

  // =========================================
  // Panel Navigation
  // =========================================
  function showPanel(panel) {
    panelVideos.style.display = 'none';
    panelHistory.style.display = 'none';
    panelSettings.style.display = 'none';
    if (panelTrash) panelTrash.style.display = 'none';
    panel.style.display = 'block';
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
    if (!rawText) return 'Processando...';
    const text = rawText.trim();

    // 1. Porcentagem de Download (yt-dlp ou HLS)
    const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      const percent = Math.round(parseFloat(percentMatch[1]));
      const speedMatch = text.match(/at\s+([\d\.]+\s*[KMGT]?i?B\/s)/i);
      if (speedMatch) {
        return `Baixando: ${percent}% (${speedMatch[1].replace('iB/s', 'B/s')})`;
      }
      return `Baixando: ${percent}%`;
    }

    // 2. Extração de informações / Burlar proteção / Início
    if (text.includes('[youtube]') || text.includes('[twitter]') || text.includes('[instagram]') || 
        text.includes('[reddit]') || text.includes('[facebook]') || text.includes('Extracting') || 
        text.includes('Downloading webpage') || text.includes('Solving JS') || text.includes('burlar') ||
        text.includes('cookies') || text.includes('API JSON') || text.includes('player API') || text.includes('Preparando')) {
      return 'Preparando vídeo...';
    }

    // 3. Pós-processamento e Mesclagem
    if (text.includes('[Merger]') || text.includes('Merging formats')) {
      return 'Unindo áudio e vídeo...';
    }
    if (text.includes('[ExtractAudio]') || text.includes('audio-format') || text.includes('extract-audio')) {
      return 'Convertendo áudio...';
    }
    if (text.includes('[EmbedSubtitle]') || text.includes('Writing video subtitles') || text.includes('subtitles') || text.includes('--write-subs')) {
      return 'Embutindo legendas...';
    }
    if (text.includes('Deleting original file') || text.includes('Fixup') || text.includes('pass -k to keep') || text.includes('Finalizando')) {
      return 'Finalizando arquivo...';
    }

    // 4. HLS / Streaming
    if (text.includes('Analisando playlist') || text.includes('Obtendo segmentos') || text.includes('stream de vídeo') || text.includes('Analisando stream')) {
      return 'Analisando stream...';
    }

    // 5. Conversão FFmpeg
    if (text.includes('Tempo renderizado') || text.includes('Convertendo...')) {
      const timeMatch = text.match(/(\d{2}:\d{2}:\d{2})/);
      return timeMatch ? `Convertendo: ${timeMatch[1]}` : 'Convertendo vídeo...';
    }
    if (text.includes('conversão local') || text.includes('Iniciando conversão')) {
      return 'Iniciando conversão...';
    }

    // 6. Mensagens padrão conhecidas
    if (text.includes('Iniciando yt-dlp') || text.includes('Destination:') || text.includes('Iniciando download')) {
      return 'Iniciando download...';
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
      } else if (msg.status === 'success') {
        statusBadge.textContent = 'Concluído!';
        statusBadge.title = 'Download concluído com sucesso';
        statusBadge.style.color = '#10b981';
        statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
        setTimeout(() => {
          statusBadge.textContent = 'Aguardando vídeos...';
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
        let errorMsg = msg.error || 'Falha ao processar';
        if (errorMsg.includes('yt-dlp falhou') || errorMsg.includes('bin')) {
          errorMsg = 'Erro no conversor local';
        } else if (errorMsg.length > 30) {
          errorMsg = errorMsg.substring(0, 30) + '…';
        }
        statusBadge.textContent = 'Erro: ' + errorMsg;
        statusBadge.title = msg.error || '';
        statusBadge.style.color = '#ef4444';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        setTimeout(() => {
          statusBadge.textContent = 'Aguardando vídeos...';
          statusBadge.title = '';
          statusBadge.style.color = '';
          statusBadge.style.background = '';
          statusBadge.style.borderColor = '';
        }, 5000);
        
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
        statusBadge.textContent = 'Download cancelado';
        statusBadge.title = '';
        setTimeout(() => {
          statusBadge.textContent = 'Aguardando vídeos...';
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

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'new_video_detected' && request.tabId === currentTabId) {
      const video = request.video;
      const existing = detectedVideos.find(v => v.url === video.url);
      if (!existing) {
        detectedVideos.unshift(video);
        renderVideoList();
      } else if (!existing.thumbnail && video.thumbnail) {
        existing.thumbnail = video.thumbnail;
        renderVideoList();
      }
    }
  });

  function loadVideosForActiveTab() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const activeTab = tabs[0];
      const pageUrl = activeTab.url || '';
      currentTabId = activeTab.id;

      // Reset list
      detectedVideos = [];
      renderVideoList();

      // Pede histórico de vídeos detectados na aba
      chrome.runtime.sendMessage({ action: 'get_tab_videos' }, (response) => {
        chrome.runtime.lastError;
        if (response && response.videos) {
          detectedVideos = response.videos;
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
          if (!detectedVideos.find(v => v.type === 'youtube')) {
            detectedVideos.unshift({
              url: pageUrl,
              type: 'youtube',
              title: ytTitle,
              thumbnail: null
            });
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
                
                detectedVideos.push({
                  url: streamUrl,
                  type: 'hls',
                  title: pageTitle,
                  thumbnail: pageThumb
                });
              });
              renderVideoList();
            });
          }
          
          // Pede pro content script escanear ativamente pra pegar os que faltam
          chrome.tabs.sendMessage(activeTab.id, { action: 'get_videos' }, (csResponse) => {
            chrome.runtime.lastError;
            if (csResponse && csResponse.videos) {
              const vipTypes = ['twitter', 'instagram', 'facebook', 'reddit'];
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
    videoCount.textContent = `${detectedVideos.length} vídeo(s)`;
    statusBadge.textContent = `${detectedVideos.length} vídeo(s) detectado(s)`;

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
      title.textContent = video.title || `Vídeo ${detectedVideos.length - index}`;
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
        qualitySelect.innerHTML = '<option value="">Carregando...</option>';
        qualitySelect.disabled = true;
        fetchFormats(video, qualitySelect);
      } else {
        qualitySelect.innerHTML = `
          <option value="best">Melhor qualidade</option>
          <option value="1080p">MP4 1080p</option>
          <option value="720p">MP4 720p</option>
          <option value="480p">MP4 480p</option>
          <option value="audio">Áudio (MP3)</option>
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
      if (isVIP) {
        audioBtn.disabled = true;
        audioBtn.style.opacity = '0.4';
      }
      btnRow.appendChild(audioBtn);

      const dlBtn = document.createElement('button');
      dlBtn.className = 'download-btn';
      dlBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Baixar';
      dlBtn.style.flex = '1';
      if (isVIP) {
        dlBtn.disabled = true;
        dlBtn.style.opacity = '0.4';
      }
      btnRow.appendChild(dlBtn);
      
      actions.appendChild(btnRow);
      
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'download-btn';
      cancelBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Cancelar';
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
        renderVideoList();
      });
      card.appendChild(dismissBtn);

      videoList.appendChild(card);
    });
  }

  // =========================================
  // Fetch Formats via Companion App
  // =========================================
  function fetchFormats(video, qualitySelect) {
    const getCookies = (domains) => {
      return new Promise((resolve) => {
        if (!chrome.cookies || domains.length === 0) return resolve([]);
        let all = [];
        let done = 0;
        domains.forEach(d => {
          chrome.cookies.getAll({ domain: d }, (cookies) => {
            all = all.concat(cookies || []);
            done++;
            if (done === domains.length) resolve(all);
          });
        });
      });
    };

    const domainMap = {
      'youtube': [], 'twitter': ['twitter.com', 'x.com'],
      'instagram': ['instagram.com'], 'facebook': ['facebook.com'],
      'reddit': ['reddit.com'], 'tiktok': ['tiktok.com'], 'hls': []
    };
    const domains = domainMap[video.type] || [];

    let cookiePromise;
    if (video.type === 'youtube') {
      cookiePromise = new Promise(resolve => {
        chrome.cookies.getAll({ url: "https://www.youtube.com" }, resolve);
      });
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
          const card = qualitySelect.closest('.video-card');
          if (card) {
            const titleEl = card.querySelector('.video-card-title');
            if (titleEl) {
              titleEl.textContent = response.title;
              titleEl.title = response.title;
            }
          }
        }
        if (!response || !response.formats) {
          qualitySelect.innerHTML = '<option value="best">Melhor qualidade disponível</option>';
          ['1080', '720', '480', '360'].forEach(h => {
            qualitySelect.innerHTML += `<option value="${h}p">MP4 ${h}p</option>`;
          });
        } else {
          qualitySelect.innerHTML = '<option value="best">Melhor qualidade disponível</option>';
          if (response.formats.length > 0) {
            response.formats.forEach(f => {
              qualitySelect.innerHTML += `<option value="${f.height}p">MP4 ${f.height}p (${f.width}x${f.height})</option>`;
            });

            // Add quality badge to the card
            const card = qualitySelect.closest('.video-card');
            if (card) {
              const meta = card.querySelector('.video-card-meta');
              const existing = meta.querySelector('.badge-quality');
              if (!existing && response.formats.length > 0) {
                const qBadge = document.createElement('span');
                qBadge.className = 'badge badge-quality';
                qBadge.textContent = response.formats[0].height + 'p';
                meta.appendChild(qBadge);
              }
            }
          } else {
            ['1080', '720', '480', '360'].forEach(h => {
              qualitySelect.innerHTML += `<option value="${h}p">MP4 ${h}p</option>`;
            });
          }
        }
        qualitySelect.innerHTML += '<option value="audio">Áudio (MP3)</option>';
        qualitySelect.disabled = false;
        
        // Enable download button
        const card = qualitySelect.closest('.video-card');
        if (card) {
          const dlBtns = card.querySelectorAll('.download-btn');
          dlBtns.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
          });
        }
      });
    });

    // YouTube special: also get DOM formats for resolution display
    if (video.type === 'youtube') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'get_youtube_formats' }, (response) => {
          chrome.runtime.lastError;
          if (response && response.title) {
            video.title = response.title;
            const card = qualitySelect.closest('.video-card');
            if (card) {
              const titleEl = card.querySelector('.video-card-title');
              if (titleEl) {
                titleEl.textContent = response.title;
                titleEl.title = response.title;
              }
            }
          }
          if (response && response.formats && response.formats.length > 0) {
            qualitySelect.innerHTML = '<option value="best">Melhor qualidade disponível</option>';
            response.formats.forEach(f => {
              qualitySelect.innerHTML += `<option value="${f.height}p">MP4 ${f.height}p (${f.width}x${f.height})</option>`;
            });
            qualitySelect.innerHTML += '<option value="audio">Áudio (MP3)</option>';
            qualitySelect.disabled = false;

            const card = qualitySelect.closest('.video-card');
            if (card) {
              const dlBtns = card.querySelectorAll('.download-btn');
              dlBtns.forEach(btn => { btn.disabled = false; btn.style.opacity = '1'; });
              const meta = card.querySelector('.video-card-meta');
              const existing = meta.querySelector('.badge-quality');
              if (!existing) {
                const qBadge = document.createElement('span');
                qBadge.className = 'badge badge-quality';
                qBadge.textContent = response.formats[0].height + 'p';
                meta.appendChild(qBadge);
              }
            }
          }
        });
      });
    }
  }

  // =========================================
  // Download Video
  // =========================================
  function downloadVideo(video, quality) {
    let actionName = 'download_video';
    const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok', 'hls'];
    if (vipTypes.includes(video.type)) actionName = 'download_youtube';
    if (video.type === 'html5' && quality && quality !== 'best') actionName = 'download_html5_converted';

    statusBadge.textContent = 'Iniciando download...';

    const getCookiesAndSend = (domains) => {
      if (!chrome.cookies || domains.length === 0) {
        chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, quality: quality });
        return;
      }
      let all = [];
      let done = 0;
      domains.forEach(d => {
        chrome.cookies.getAll({ domain: d }, (cookies) => {
          all = all.concat(cookies || []);
          done++;
          if (done === domains.length) {
            chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, cookies: all, quality: quality });
          }
        });
      });
    };

    if (video.type === 'youtube') {
      chrome.cookies.getAll({ url: "https://www.youtube.com" }, (cookies) => {
        chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, cookies: cookies, quality: quality });
      });
    } else if (video.type === 'twitter') {
      getCookiesAndSend(['twitter.com', 'x.com']);
    } else if (video.type === 'instagram') {
      getCookiesAndSend(['instagram.com']);
    } else if (video.type === 'facebook') {
      getCookiesAndSend(['facebook.com']);
    } else if (video.type === 'reddit') {
      getCookiesAndSend(['reddit.com']);
    } else if (video.type === 'tiktok') {
      getCookiesAndSend(['tiktok.com']);
    } else {
      chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, quality: quality });
    }
  }

  // =========================================
  // Force Scan / Clear Detected Videos
  // =========================================
  const forceScanBtn = document.getElementById('force-scan-btn');
  if (forceScanBtn) {
    forceScanBtn.addEventListener('click', () => {
      forceScanBtn.disabled = true;
      statusBadge.textContent = 'Procurando vídeo na página...';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) { forceScanBtn.disabled = false; return; }
        chrome.tabs.sendMessage(tabs[0].id, { action: 'force_scan' }, (response) => {
          chrome.runtime.lastError; // limpa erro se o content script não estiver injetado
          if (response && response.videos) {
            response.videos.forEach(v => {
              if (!detectedVideos.find(existing => existing.url === v.url)) {
                detectedVideos.unshift(v);
              }
            });
            renderVideoList();
          }
          statusBadge.textContent = detectedVideos.length > 0
            ? `${detectedVideos.length} vídeo(s) detectado(s)`
            : 'Nenhum vídeo encontrado nesta página';
          forceScanBtn.disabled = false;
        });
      });
    });
  }

  clearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clear_tab_videos' });
    detectedVideos = [];
    renderVideoList();
    statusBadge.textContent = 'Lista limpa';
    setTimeout(() => {
      statusBadge.textContent = 'Aguardando vídeos...';
    }, 2000);
  });

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
              <span class="${item.status === 'success' ? 'history-status-success' : 'history-status-error'}">${item.status === 'success' ? '✓ Concluído' : '✗ Falha'}</span>
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
              <span class="${item.status === 'success' ? 'history-status-success' : 'history-status-error'}">${item.status === 'success' ? '✓ Concluído' : '✗ Falha'}</span>
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
