(function() {
  function getFormats() {
    let response = null;
    try {
       const player = document.querySelector('ytd-player');
       if (player && typeof player.getPlayerResponse === 'function') {
          response = player.getPlayerResponse();
       }
    } catch (e) {}

    if (!response) {
       response = window.ytInitialPlayerResponse;
    }

    if (response && response.streamingData) {
      let allFormats = [
        ...(response.streamingData.formats || []),
        ...(response.streamingData.adaptiveFormats || [])
      ];
      window.postMessage({ type: 'ASTER_YOUTUBE_DATA', formats: allFormats }, '*');
    }
  }
  getFormats();
  window.addEventListener('yt-page-data-updated', getFormats);
  window.addEventListener('yt-navigate-finish', getFormats);
})();
