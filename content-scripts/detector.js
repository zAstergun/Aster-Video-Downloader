// Content Script genérico para detecção de vídeos HTML5

let detectedVideos = new Map(); // Usando Map para evitar URLs duplicadas

function scanForVideos() {
  const newVideos = [];
  
  // 1. Procurar por tags <video>
  const videoElements = document.querySelectorAll('video');
  videoElements.forEach(video => {
    if (video.src && video.src.startsWith('http')) {
      newVideos.push({
        url: video.src,
        type: 'video/mp4' // simplificação
      });
    }
    
    // 2. Procurar por tags <source> dentro de <video>
    const sources = video.querySelectorAll('source');
    sources.forEach(source => {
      if (source.src && source.src.startsWith('http')) {
        newVideos.push({
          url: source.src,
          type: source.type || 'video/mp4'
        });
      }
    });
  });
  
  // Adiciona ao map para desduplicação
  newVideos.forEach(v => {
    if (!detectedVideos.has(v.url)) {
      detectedVideos.set(v.url, v);
      console.log('[Aster] Novo vídeo detectado:', v.url);
    }
  });
  
  // Atualiza o badge da extensão
  updateBadge();
}

function updateBadge() {
  const count = detectedVideos.size;
  chrome.runtime.sendMessage({
    action: 'update_badge', // No futuro o background pode lidar com isso
    count: count
  }).catch(() => {
    // Silenciar erros de comunicação se o background não estiver pronto
  });
}

// Inicializa o escaneamento
scanForVideos();

// Cria um observer para detectar vídeos adicionados dinamicamente ao DOM
const observer = new MutationObserver((mutations) => {
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
});

observer.observe(document.body, { childList: true, subtree: true });

// Escuta requisições do popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_videos') {
    // Retorna a lista de vídeos como array
    sendResponse({ videos: Array.from(detectedVideos.values()) });
  }
});
