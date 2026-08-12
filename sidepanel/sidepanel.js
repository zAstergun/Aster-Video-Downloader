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
  
  const clearBtn = document.getElementById('clear-btn');
  const historyBtn = document.getElementById('history-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const backFromHistory = document.getElementById('back-from-history');
  const backFromSettings = document.getElementById('back-from-settings');

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
    panel.style.display = 'block';
  }

  historyBtn.addEventListener('click', () => {
    renderHistory();
    showPanel(panelHistory);
  });
  settingsBtn.addEventListener('click', () => showPanel(panelSettings));
  backFromHistory.addEventListener('click', () => showPanel(panelVideos));
  backFromSettings.addEventListener('click', () => showPanel(panelVideos));

  // =========================================
  // Receive Videos in Real-Time
  // =========================================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // new_video_detected agora é tratado dentro de chrome.tabs.query para filtrar por aba

    if (request.action === 'companion_progress') {
      const msg = request.data;
      if (msg.status === 'info' || msg.status === 'progress') {
        statusBadge.textContent = msg.text;
      } else if (msg.status === 'success') {
        statusBadge.textContent = 'Concluído!';
        statusBadge.style.color = '#10b981';
        statusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.25)';
        setTimeout(() => {
          statusBadge.textContent = 'Aguardando vídeos...';
          statusBadge.style.color = '';
          statusBadge.style.background = '';
          statusBadge.style.borderColor = '';
        }, 5000);
      } else if (msg.status === 'error') {
        statusBadge.textContent = 'Erro: ' + (msg.error || '');
        statusBadge.style.color = '#ef4444';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
        setTimeout(() => {
          statusBadge.textContent = 'Aguardando vídeos...';
          statusBadge.style.color = '';
          statusBadge.style.background = '';
          statusBadge.style.borderColor = '';
        }, 5000);
      }
    }
  });

  // =========================================
  // Scan Current Tab on Open
  // =========================================
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const activeTab = tabs[0];
    const pageUrl = activeTab.url || '';
    let currentTabId = activeTab.id;

    // Apenas ouve novos vídeos da aba atual
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

    // Pede histórico de vídeos detectados na aba
    chrome.runtime.sendMessage({ action: 'get_tab_videos' }, (response) => {
      chrome.runtime.lastError;
      if (response && response.videos) {
        detectedVideos = response.videos;
      }
      
      // YouTube special fallback
      if (pageUrl.includes('youtube.com/watch') || pageUrl.includes('youtube.com/shorts') || pageUrl.includes('youtu.be/')) {
        if (!detectedVideos.find(v => v.type === 'youtube')) {
          detectedVideos.unshift({
            url: pageUrl,
            type: 'youtube',
            title: 'Vídeo do YouTube',
            thumbnail: null
          });
        }
      }

      // HLS fallback (caso o service worker não tenha armazenado para a aba)
      chrome.runtime.sendMessage({ action: 'get_hls_streams' }, (bgResponse) => {
        if (bgResponse && bgResponse.streams && bgResponse.streams.length > 0) {
          chrome.tabs.sendMessage(activeTab.id, { action: 'get_page_metadata' }, (metaResponse) => {
            chrome.runtime.lastError; // limpa o erro se o script não estiver injetado
            
            const pageTitle = (metaResponse && metaResponse.title) ? metaResponse.title.trim() : (bgResponse.title || 'Stream HLS (.m3u8)');
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
            csResponse.videos.forEach(v => {
              if (detectedVideos.find(existing => existing.url === v.url)) return;
              const isVIP = vipTypes.includes(v.type);
              const titles = {
                'twitter': 'Vídeo do Twitter / X',
                'instagram': 'Vídeo do Instagram',
                'facebook': 'Vídeo do Facebook',
                'reddit': 'Vídeo do Reddit'
              };
              detectedVideos.push({
                url: v.url,
                type: isVIP ? v.type : 'html5',
                title: isVIP ? titles[v.type] : 'HTML5 Video',
                thumbnail: v.thumbnail || null
              });
            });
          }
          renderVideoList();
        });
      });
    });
  });

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
        'facebook': 'FB', 'reddit': 'REDDIT', 'hls': 'M3U8', 'html5': 'HTML5'
      };
      const fmtBadge = document.createElement('span');
      fmtBadge.className = 'badge badge-format';
      fmtBadge.textContent = typeLabels[video.type] || 'VIDEO';
      meta.appendChild(fmtBadge);
      body.appendChild(meta);

      // Actions
      const actions = document.createElement('div');
      actions.className = 'video-card-actions';

      const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'hls'];
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

      const dlBtn = document.createElement('button');
      dlBtn.className = 'download-btn';
      dlBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Baixar';
      if (isVIP) {
        dlBtn.disabled = true;
        dlBtn.style.opacity = '0.4';
      }
      dlBtn.addEventListener('click', () => {
        const quality = qualitySelect.value;
        downloadVideo(video, quality);
      });
      actions.appendChild(dlBtn);
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
      'reddit': ['reddit.com'], 'hls': []
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
          const dlBtn = card.querySelector('.download-btn');
          if (dlBtn) {
            dlBtn.disabled = false;
            dlBtn.style.opacity = '1';
          }
        }
      });
    });

    // YouTube special: also get DOM formats for resolution display
    if (video.type === 'youtube') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: 'get_youtube_formats' }, (response) => {
          chrome.runtime.lastError;
          if (response && response.formats && response.formats.length > 0) {
            qualitySelect.innerHTML = '<option value="best">Melhor qualidade disponível</option>';
            response.formats.forEach(f => {
              qualitySelect.innerHTML += `<option value="${f.height}p">MP4 ${f.height}p (${f.width}x${f.height})</option>`;
            });
            qualitySelect.innerHTML += '<option value="audio">Áudio (MP3)</option>';
            qualitySelect.disabled = false;

            const card = qualitySelect.closest('.video-card');
            if (card) {
              const dlBtn = card.querySelector('.download-btn');
              if (dlBtn) { dlBtn.disabled = false; dlBtn.style.opacity = '1'; }
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
    const vipTypes = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'hls'];
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
    } else {
      chrome.runtime.sendMessage({ action: actionName, url: video.url, title: video.title, quality: quality });
    }
  }

  // =========================================
  // Clear Detected Videos
  // =========================================
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
  // History Panel
  // =========================================
  const historyList = document.getElementById('history-list');
  const clearHistoryBtn = document.getElementById('clear-history-btn');

  function renderHistory() {
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
          <div class="history-item-title">${item.title || item.url}</div>
          <div class="history-item-meta">
            <span>${new Date(item.timestamp).toLocaleString()}</span>
            <span class="${item.status === 'success' ? 'history-status-success' : 'history-status-error'}">${item.status === 'success' ? '✓ Concluído' : '✗ Falha'}</span>
          </div>
        `;
        historyList.appendChild(el);
      });
    });
  }

  clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.set({ aster_history: [] }, () => renderHistory());
  });

  // =========================================
  // Settings Panel
  // =========================================
  const customFolderInput = document.getElementById('custom-folder-input');
  const saveSettingsBtn = document.getElementById('save-settings-btn');

  chrome.storage.local.get('aster_settings', (data) => {
    if (data.aster_settings && data.aster_settings.downloadFolder) {
      customFolderInput.value = data.aster_settings.downloadFolder;
    }
  });

  saveSettingsBtn.addEventListener('click', () => {
    const folder = customFolderInput.value.trim();
    chrome.storage.local.set({ aster_settings: { downloadFolder: folder } }, () => {
      saveSettingsBtn.textContent = 'Salvo!';
      saveSettingsBtn.style.backgroundColor = '#10b981';
      setTimeout(() => {
        saveSettingsBtn.textContent = 'Salvar Configurações';
        saveSettingsBtn.style.backgroundColor = '';
      }, 2000);
    });
  });

});
