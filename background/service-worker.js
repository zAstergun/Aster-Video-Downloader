// Service Worker base para a extensão Aster (Manifest V3)

// Armazenamento de streams HLS interceptados (Map de tabId -> url)
const interceptedStreams = new Map();
// Armazenamento de vídeos HTML5 detectados (Map de tabId -> array de vídeos)
const detectedVideosByTab = new Map();
// Armazenamento de metadados para fallback de streams HLS (Map de tabId -> thumbnail)
const hlsMetadataByTab = new Map();

chrome.runtime.onInstalled.addListener(() => {
  console.log("Aster Video Downloader instalado com sucesso.");
  // Abre o Side Panel ao clicar no ícone da extensão
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
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
        
        // Deduplicação inteligente: ignora playlists variantes do mesmo diretório base
        let isDuplicate = false;
        const newBase = details.url.substring(0, details.url.lastIndexOf('/') + 1);
        
        for (const s of streams) {
          const sBase = s.substring(0, s.lastIndexOf('/') + 1);
          // Se o novo m3u8 está na mesma pasta (ou subpasta) de um já capturado, é variante!
          if (details.url.startsWith(sBase) || s.startsWith(newBase)) {
            isDuplicate = true;
            break;
          }
        }

        if (!isDuplicate) {
          streams.add(details.url);
          interceptedStreams.set(details.tabId, streams);
          
          console.log("HLS Interceptado na aba", details.tabId, ":", details.url);
          
          chrome.action.setBadgeText({ text: '!', tabId: details.tabId });
          chrome.action.setBadgeBackgroundColor({ color: '#7b61ff', tabId: details.tabId });
          
          chrome.runtime.sendMessage({ action: 'hls_detected', url: details.url }).catch(() => {});
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
      const existing = list.find(v => v.url === request.video.url);
      if (!existing) {
        list.unshift(request.video); // Mais recente primeiro
      } else if (!existing.thumbnail && request.video.thumbnail) {
        existing.thumbnail = request.video.thumbnail; // Atualiza thumbnail
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
    startCompanionDownload('download_hls', request.url, null, request.quality, request.title);
    sendResponse({ status: 'started_companion' });
    return true;
  }
  
  if (request.action === 'download_html5_converted') {
    startCompanionDownload('download_html5_converted', request.url, null, request.quality, request.title);
    sendResponse({ status: 'started_companion' });
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

function startCompanionDownload(action, url, cookies = null, quality = null, title = null) {
  console.log("Enviando para o companion app:", action, url);
  
  chrome.storage.local.get('aster_settings', (data) => {
    const settings = data.aster_settings || {};
    const downloadFolder = settings.downloadFolder || null;
    
    try {
      const port = chrome.runtime.connectNative('com.aster.downloader');
      
      port.onMessage.addListener((msg) => {
        console.log("Mensagem do Companion App:", msg);
        // Repassa a mensagem para o popup (se estiver aberto)
        chrome.runtime.sendMessage({
          action: 'companion_progress',
          data: msg,
          url: url
        }).catch(() => {
          // Ignora erro caso o popup esteja fechado
        });
        
        // FASE 6: Salvar no Histórico
        if (msg.status === 'success' || msg.status === 'error') {
          chrome.storage.local.get('aster_history', (histData) => {
             const history = histData.aster_history || [];
             history.push({
               url: url,
               title: title || 'Download Concluído',
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
        console.log("Desconectado do Companion App. Erro (se houver):", chrome.runtime.lastError);
        if (chrome.runtime.lastError) {
           console.warn("Companion app não encontrado. Por favor, instale o Companion App usando o install.bat.");
        }
      });
      
      port.postMessage({ action: action, url: url, cookies: cookies, quality: quality, downloadFolder: downloadFolder });
    } catch (err) {
      console.error("Erro ao conectar ao companion app:", err);
    }
  });
}
