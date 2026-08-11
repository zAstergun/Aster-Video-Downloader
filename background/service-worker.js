// Service Worker base para a extensão Aster (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  console.log("Aster Video Downloader instalado com sucesso.");
});

// Listener principal de mensagens
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download_video') {
    startDownload(request.url);
    // Retorna true para indicar que a resposta pode ser assíncrona (se necessário no futuro)
    sendResponse({ status: 'started' });
    return true; 
  }
});

function startDownload(url) {
  // Para a Fase 1: Download direto via API de downloads do Chrome (apenas HTML5 simples)
  console.log('Iniciando download simples para URL:', url);
  
  chrome.downloads.download({
    url: url,
    conflictAction: 'uniquify',
    saveAs: true // Deixa o usuário escolher onde e com qual nome salvar
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error("Erro no download:", chrome.runtime.lastError);
    } else {
      console.log("Download iniciado com ID:", downloadId);
    }
  });
}
