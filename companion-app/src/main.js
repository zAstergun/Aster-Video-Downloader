const fs = require('fs');
const downloader = require('./downloader');

// Lógica de Native Messaging usando stdio
process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    if (chunk.length >= 4) {
      const length = chunk.readUInt32LE(0);
      if (chunk.length >= 4 + length) {
        const messageString = chunk.toString('utf8', 4, 4 + length);
        try {
          const message = JSON.parse(messageString);
          handleMessage(message);
        } catch (e) {
          sendMessage({ error: 'Falha ao processar mensagem JSON' });
        }
      }
    }
  }
});

function sendMessage(msg) {
  const msgString = JSON.stringify(msg);
  const msgBuffer = Buffer.from(msgString, 'utf8');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(msgBuffer.length, 0);
  process.stdout.write(lengthBuffer);
  process.stdout.write(msgBuffer);
}

function handleMessage(msg) {
  if (msg.action === 'get_formats') {
    const isVIP = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit'].includes(msg.type);
    if (isVIP) {
      downloader.getYouTubeFormats(msg.url, msg.cookies).then(formats => {
        sendMessage({ status: 'formats', formats: formats, videoUrl: msg.url });
      });
    } else if (msg.type === 'hls') {
      downloader.getHLSFormats(msg.url).then(formats => {
        sendMessage({ status: 'formats', formats: formats, videoUrl: msg.url });
      });
    } else {
      sendMessage({ status: 'formats', formats: [], videoUrl: msg.url });
    }
  } else if (msg.action === 'download_youtube') {
    sendMessage({ status: 'info', text: 'Iniciando yt-dlp: ' + msg.url });
    downloader.downloadYoutube(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.cookies, msg.quality, msg.downloadFolder).then((filePath) => {
      sendMessage({ status: 'success', filePath: filePath });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'download_hls') {
    sendMessage({ status: 'info', text: 'Iniciando download HLS: ' + msg.url });
    downloader.downloadHLS(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.quality, msg.downloadFolder).then((filePath) => {
      sendMessage({ status: 'success', filePath: filePath });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'download_html5_converted') {
    sendMessage({ status: 'info', text: 'Iniciando conversão FFmpeg: ' + msg.url });
    downloader.downloadHTML5Converted(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.quality, msg.downloadFolder).then((filePath) => {
      sendMessage({ status: 'success', filePath: filePath });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else {
    sendMessage({ status: 'error', error: 'Ação desconhecida: ' + msg.action });
  }
}
