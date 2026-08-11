document.addEventListener('DOMContentLoaded', () => {
  const videoList = document.getElementById('video-list');
  const template = document.getElementById('video-item-template');
  const statusBadge = document.getElementById('status-badge');

  // Pedir ao background os vídeos da aba atual
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    
    const activeTab = tabs[0];
    
    // Tenta comunicar com o content script para obter vídeos
    chrome.tabs.sendMessage(activeTab.id, { action: 'get_videos' }, (response) => {
      // Se ocorreu um erro (ex: página restrita como chrome://)
      if (chrome.runtime.lastError) {
        showEmptyState('Não é possível buscar vídeos nesta página.');
        return;
      }

      if (response && response.videos && response.videos.length > 0) {
        renderVideos(response.videos);
      } else {
        showEmptyState('Nenhum vídeo encontrado nesta página.');
      }
    });
  });

  function renderVideos(videos) {
    videoList.innerHTML = ''; // Limpar empty state
    statusBadge.textContent = `${videos.length} vídeo(s)`;
    statusBadge.style.color = '#7b61ff';
    statusBadge.style.backgroundColor = 'rgba(123, 97, 255, 0.15)';
    statusBadge.style.borderColor = 'rgba(123, 97, 255, 0.3)';

    videos.forEach((video, index) => {
      const clone = template.content.cloneNode(true);
      
      const title = clone.querySelector('.video-title');
      title.textContent = `Vídeo ${index + 1} (${new URL(video.url).hostname})`;
      
      const format = clone.querySelector('.video-format');
      format.textContent = video.type || 'MP4';

      const downloadBtn = clone.querySelector('.download-btn');
      downloadBtn.addEventListener('click', () => {
        downloadVideo(video.url);
      });

      videoList.appendChild(clone);
    });
  }

  function showEmptyState(message) {
    videoList.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
        <p>${message}</p>
      </div>
    `;
    statusBadge.textContent = '0 vídeos';
    statusBadge.style.color = 'var(--text-muted)';
    statusBadge.style.backgroundColor = 'transparent';
    statusBadge.style.borderColor = 'var(--border-color)';
  }

  function downloadVideo(url) {
    // Comunica com o background script para baixar o vídeo
    chrome.runtime.sendMessage({
      action: 'download_video',
      url: url
    });
    
    // Feedback visual
    const originalText = statusBadge.textContent;
    statusBadge.textContent = 'Baixando...';
    setTimeout(() => {
      statusBadge.textContent = originalText;
    }, 2000);
  }
});
