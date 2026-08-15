// Service Worker base para a extensão Aster (Manifest V3)
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }
function errLog(...args) { if (DEBUG) console.error(...args); }

// Armazenamento de streams HLS interceptados (Map de tabId -> url)
const interceptedStreams = new Map();
// Armazenamento de vídeos HTML5 detectados (Map de tabId -> array de vídeos)
const detectedVideosByTab = new Map();
// Armazenamento de metadados para fallback de streams HLS (Map de tabId -> thumbnail)
const hlsMetadataByTab = new Map();
// FASE 0: Armazenamento de downloads ativos do Companion App
const activeDownloads = new Map();

chrome.runtime.onInstalled.addListener(() => {
  log("Aster Video Downloader instalado com sucesso.");
  // Abre o Side Panel ao clicar no ícone da extensão
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// Listener para monitorar o status do download feito pelo Chrome
chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state) return;
  if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
    const downloadInfo = activeDownloads.get(delta.id);
    if (!downloadInfo) return;
    activeDownloads.delete(delta.id);
    
    downloadInfo.port.postMessage({ action: 'cleanup', token: downloadInfo.token, filePath: downloadInfo.filePath });
    downloadInfo.port.disconnect();
    
    const status = delta.state.current === 'complete' ? 'success' : 'error';
    const notifTitle = status === 'success' ? 'Download Concluído' : 'Download Interrompido';
    
    // Notifica o sidepanel que o download terminou (para esconder o botão cancelar)
    chrome.runtime.sendMessage({
      action: 'companion_progress',
      data: { status: status, url: downloadInfo.url, text: status === 'success' ? 'Concluído!' : 'Interrompido' },
      url: downloadInfo.url
    }).catch(() => {});
    
    chrome.storage.local.get('aster_settings', (data) => {
      const settings = data.aster_settings || {};
      if (settings.notificationsEnabled !== false) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/assets/icon.png',
          title: notifTitle,
          message: downloadInfo.title || 'Vídeo salvo com sucesso.'
        }).catch(() => {});
      }
    });
    
    chrome.storage.local.get('aster_history', (histData) => {
       const history = histData.aster_history || [];
       history.push({
         url: downloadInfo.url,
         title: downloadInfo.title || 'Sem título',
         status: status,
         timestamp: Date.now()
       });
       if (history.length > 50) history.shift();
       chrome.storage.local.set({ aster_history: history });
    });
  }
});

// Intercepta requisições de rede em busca de m3u8 (HLS)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Filtra URLs que contém .m3u8 (comum em Kiwify, Twitter, etc)
    if (details.url.includes('.m3u8')) {
      if (details.tabId > 0) {
        // Ignora playlists master de anúncios ou segmentos irrelevantes
        if (details.url.includes('ad') || details.url.includes('blank')) return;

        let streams = interceptedStreams.get(details.tabId) || new Set();
        
        // Verifica se já temos este URL exato
        if (streams.has(details.url)) return;

        // Fetch the m3u8 content to determine if it's a master playlist or variant
        fetch(details.url)
          .then(r => r.text())
          .then(text => {
            const isMaster = text.includes('#EXT-X-STREAM-INF');
            
            // Heurística de deduplicação por path base
            const newBase = details.url.substring(0, details.url.lastIndexOf('/') + 1);
            let duplicateOf = null;
            
            for (const s of streams) {
              const sBase = s.substring(0, s.lastIndexOf('/') + 1);
              if (details.url.startsWith(sBase) || s.startsWith(newBase)) {
                duplicateOf = s;
                break;
              }
            }

            if (!duplicateOf) {
              // Nova stream de uma origem diferente
              streams.add(details.url);
              interceptedStreams.set(details.tabId, streams);
              notifyHLS(details.tabId, details.url);
            } else if (isMaster) {
              // Se a nova é Master, mas a existente era variante (mesmo path), substituimos
              // Como não sabemos se a existente era master ou não sem guardar estado extra,
              // damos preferencia para a recém descoberta se ela for Master.
              streams.delete(duplicateOf);
              streams.add(details.url);
              interceptedStreams.set(details.tabId, streams);
              notifyHLS(details.tabId, details.url);
            }
          })
          .catch(() => {});
          
        function notifyHLS(tabId, url) {
          log("HLS Interceptado na aba", tabId, ":", url);
          chrome.action.setBadgeText({ text: '!', tabId: tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#7b61ff', tabId: tabId });
          chrome.runtime.sendMessage({ action: 'hls_detected', url: url, tabId: tabId }).catch(() => {});
        }
      }
    }
  },
  { urls: ["<all_urls>"] }
);

// Limpa dados quando a aba é fechada ou atualizada
chrome.tabs.onRemoved.addListener((tabId) => {
  interceptedStreams.delete(tabId);
  detectedVideosByTab.delete(tabId);
  hlsMetadataByTab.delete(tabId);
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    interceptedStreams.delete(tabId);
    detectedVideosByTab.delete(tabId);
    hlsMetadataByTab.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId: tabId });
  }
});

// Listener principal de mensagens (Side Panel + Content Scripts)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.action === 'set_hls_metadata') {
    if (sender.tab) {
      hlsMetadataByTab.set(sender.tab.id, request.thumbnail);
      chrome.runtime.sendMessage({
        action: 'hls_metadata_updated',
        tabId: sender.tab.id,
        thumbnail: request.thumbnail
      }).catch(()=>{});
    }
    return;
  }

  // Relay de vídeos detectados em tempo real pelo content script → Side Panel
  if (request.action === 'video_detected') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      if (!detectedVideosByTab.has(tabId)) {
        detectedVideosByTab.set(tabId, []);
      }
      const list = detectedVideosByTab.get(tabId);
      const existingIdx = list.findIndex(v => v.url === request.video.url);
      if (existingIdx === -1) {
        list.unshift(request.video); // Mais recente primeiro
      } else {
        const existing = list.splice(existingIdx, 1)[0];
        if (!existing.thumbnail && request.video.thumbnail) {
          existing.thumbnail = request.video.thumbnail; // Atualiza thumbnail
        }
        list.unshift(existing); // Move para o topo
      }
    }

    chrome.runtime.sendMessage({
      action: 'new_video_detected',
      video: request.video,
      tabId: tabId
    }).catch(() => {
      // Side Panel pode estar fechado, ignore
    });
    return;
  }

  // Side Panel pedindo os vídeos da aba atual
  if (request.action === 'get_tab_videos') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        const videos = detectedVideosByTab.get(tabId) || [];
        sendResponse({ videos });
      } else {
        sendResponse({ videos: [] });
      }
    });
    return true; // Asynchronous response
  }

  // Side Panel limpando vídeos da aba
  if (request.action === 'clear_tab_videos') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        detectedVideosByTab.delete(tabId);
        sendResponse({ success: true });
      }
    });
    return true;
  }

  if (request.action === 'get_hls_streams') {
    // Popup pede os streams da aba atual
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const tab = tabs[0];
        const tabId = tab.id;
        const streams = interceptedStreams.has(tabId) ? Array.from(interceptedStreams.get(tabId)) : [];
        const thumbnail = hlsMetadataByTab.get(tabId) || null;
        sendResponse({ streams: streams, title: tab.title, thumbnail: thumbnail });
      } else {
        sendResponse({ streams: [] });
      }
    });
    return true; // async
  }
  
  if (request.action === 'get_formats') {
    chrome.runtime.sendNativeMessage('com.aster.downloader', {
      action: 'get_formats',
      url: request.url,
      type: request.type,
      cookies: request.cookies
    }, (response) => {
      sendResponse(response);
    });
    return true; // async
  }
  
  if (request.action === 'download_video') {
    startDownload(request.url);
    sendResponse({ status: 'started' });
    return true; 
  }
  
  if (request.action === 'download_youtube') {
    startCompanionDownload('download_youtube', request.url, request.cookies, request.quality, request.title);
    sendResponse({ status: 'started_companion' });
    return true;
  }
  
  if (request.action === 'download_hls') {
    startCompanionDownload('download_hls', request.url, request.cookies, request.quality, request.title);
    sendResponse({ status: 'started_companion' });
    return true;
  }
  
  if (request.action === 'download_html5_converted') {
    startCompanionDownload('download_html5_converted', request.url, null, request.quality, request.title);
    sendResponse({ status: 'started_companion' });
    return true;
  }
  
  if (request.action === 'cancel_companion_download') {
    if (activeJob && activeJob.url === request.url && activeJob.port) {
      try {
        activeJob.cancelled = true; // Flag para o onDisconnect não fazer retry
        activeJob.port.postMessage({ action: 'cancel' });
        activeJob.port.disconnect();
      } catch (e) {}
      // Libera imediatamente o job para que novos downloads possam começar
      activeJob = null;
      processDownloadQueue();
    } else {
      const index = downloadQueue.findIndex(j => j.url === request.url);
      if (index !== -1) {
        downloadQueue.splice(index, 1);
      }
    }
    // Avisa o sidepanel para restaurar os botões
    chrome.runtime.sendMessage({
      action: 'companion_progress',
      data: { status: 'cancelled', url: request.url },
      url: request.url
    }).catch(() => {});
    sendResponse({ status: 'cancelled' });
    return true;
  }
  
  if (request.action === 'update_ytdlp') {
    try {
      const port = chrome.runtime.connectNative('com.aster.downloader');
      port.onMessage.addListener((msg) => {
        chrome.runtime.sendMessage({ action: 'companion_progress', data: msg }).catch(() => {});
        if (msg.status === 'success' || msg.status === 'error') {
          port.disconnect();
        }
      });
      port.postMessage({ action: 'update_ytdlp' });
      sendResponse({ status: 'started' });
    } catch (err) {
      sendResponse({ status: 'error' });
    }
    return true;
  }
});

function startDownload(url) {
  // Download direto (MP4)
  chrome.downloads.download({
    url: url,
    conflictAction: 'uniquify',
    saveAs: true
  });
}

const downloadQueue = [];
let activeJob = null;

function processDownloadQueue() {
  if (activeJob || downloadQueue.length === 0) return;
  activeJob = downloadQueue.shift();
  executeCompanionDownload(activeJob);
}

function startCompanionDownload(action, url, cookies = null, quality = null, title = null) {
  downloadQueue.push({ action, url, cookies, quality, title });
  processDownloadQueue();
}

function executeCompanionDownload(job) {
  const { action, url, cookies, quality, title } = job;
  log("Enviando para o companion app (via fila):", action, url);
  
  try {
    const port = chrome.runtime.connectNative('com.aster.downloader');
    activeJob.port = port;
      
      let jobFinished = false;
      const finishJob = () => {
        if (!jobFinished) {
          jobFinished = true;
          activeJob = null;
          processDownloadQueue();
        }
      };
      
      port.onMessage.addListener((msg) => {
        log("Mensagem do Companion App:", msg);
        // Repassa a mensagem para o popup (se estiver aberto)
        chrome.runtime.sendMessage({
          action: 'companion_progress',
          data: msg,
          url: url
        }).catch(() => {
          // Ignora erro caso o popup esteja fechado
        });
        
        // FASE 6 / FASE 0: Acionar o Chrome ou Salvar Erro
        if (msg.status === 'ready_to_download') {
           finishJob();
           const safeTitle = title ? title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') : 'Aster_Video';
           const suggestedFilename = safeTitle || 'Aster_Video';
           let ext = 'mp4';
           if (msg.filePath && msg.filePath.endsWith('.mp3')) ext = 'mp3';
           
           chrome.downloads.download({
             url: msg.url,
             filename: `${suggestedFilename}.${ext}`,
             saveAs: true
           }, (downloadId) => {
               if (downloadId) {
                   activeDownloads.set(downloadId, {
                       port: port,
                       token: msg.token,
                       filePath: msg.filePath,
                       url: url,
                       title: title
                   });
               } else {
                   // Fallback se download falhar na hora
                   port.postMessage({ action: 'cleanup', token: msg.token, filePath: msg.filePath });
                   port.disconnect();
               }
           });
        } else if (msg.status === 'error') {
          finishJob();
          port.disconnect();
          
          chrome.storage.local.get('aster_settings', (data) => {
            const settings = data.aster_settings || {};
            if (settings.notificationsEnabled !== false) {
              chrome.notifications.create({
                type: 'basic',
                iconUrl: '/assets/icon.png',
                title: 'Erro no Download',
                message: (title || 'Falha ao processar') + '\n' + (msg.error || '')
              }).catch(() => {});
            }
          });
          
          chrome.storage.local.get('aster_history', (histData) => {
             const history = histData.aster_history || [];
             history.push({
               url: url,
               title: title || 'Download Falhou',
               status: msg.status,
               timestamp: Date.now()
             });
             // Mantém os últimos 50
             if (history.length > 50) history.shift();
             chrome.storage.local.set({ aster_history: history });
          });
        }
      });
      
      port.onDisconnect.addListener(() => {
        if (jobFinished) return;
        
        // Se foi cancelado manualmente, não faz retry
        if (job.cancelled) {
          finishJob();
          return;
        }
        
        log("Desconectado do Companion App. Erro (se houver):", chrome.runtime.lastError);
        if (chrome.runtime.lastError) {
           console.warn("Companion app não encontrado. Por favor, instale o Companion App usando o install.bat.");
           chrome.runtime.sendMessage({ action: 'companion_missing' }).catch(() => {});
           finishJob();
        } else {
           if (!job.retries) job.retries = 0;
           if (job.retries < 3) {
             job.retries++;
             log(`Reconectando... tentativa ${job.retries}/3`);
             setTimeout(() => {
               jobFinished = true;
               activeJob = null;
               downloadQueue.unshift(job);
               processDownloadQueue();
             }, 2000);
           } else {
             finishJob();
             chrome.storage.local.get('aster_history', (histData) => {
               const history = histData.aster_history || [];
               history.push({ url: url, title: title || 'Download Falhou (Desconexão)', status: 'error', timestamp: Date.now() });
               if (history.length > 50) history.shift();
               chrome.storage.local.set({ aster_history: history });
             });
           }
        }
      });
      
      port.postMessage({ action: action, url: url, cookies: cookies, quality: quality });
    } catch (err) {
      errLog("Erro ao conectar ao companion app:", err);
      if (activeJob) {
        activeJob = null;
        processDownloadQueue();
      }
    }
}
