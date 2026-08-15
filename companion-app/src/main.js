const fs = require('fs');
const downloader = require('./downloader');
const localServer = require('./local-server');
const updater = require('./updater');

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
      downloader.getYouTubeFormats(msg.url, msg.cookies).then(result => {
        const formats = Array.isArray(result) ? result : (result.formats || []);
        const title = result && result.title ? result.title : null;
        sendMessage({ status: 'formats', formats: formats, title: title, videoUrl: msg.url });
      });
    } else if (msg.type === 'hls') {
      downloader.getHLSFormats(msg.url).then(formats => {
        sendMessage({ status: 'formats', formats: formats, videoUrl: msg.url });
      });
    } else {
      sendMessage({ status: 'formats', formats: [], videoUrl: msg.url });
    }
  } else if (msg.action === 'download_youtube') {
    sendMessage({ status: 'info', text: 'Iniciando download...' });
    downloader.downloadYoutube(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.cookies, msg.quality, msg.downloadFolder).then((filePath) => {
      return localServer.registerFile(filePath).then(localUrl => {
        const token = new URL(localUrl).searchParams.get('token');
        sendMessage({ status: 'ready_to_download', url: localUrl, token: token, filePath: filePath });
      });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'download_hls') {
    sendMessage({ status: 'info', text: 'Iniciando stream HLS...' });
    downloader.downloadHLS(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.quality, msg.cookies).then((filePath) => {
      return localServer.registerFile(filePath).then(localUrl => {
        const token = new URL(localUrl).searchParams.get('token');
        sendMessage({ status: 'ready_to_download', url: localUrl, token: token, filePath: filePath });
      });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'download_html5_converted') {
    sendMessage({ status: 'info', text: 'Iniciando conversão...' });
    downloader.downloadHTML5Converted(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.quality, msg.downloadFolder).then((filePath) => {
      return localServer.registerFile(filePath).then(localUrl => {
        const token = new URL(localUrl).searchParams.get('token');
        sendMessage({ status: 'ready_to_download', url: localUrl, token: token, filePath: filePath });
      });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'cancel') {
    downloader.cancelCurrentDownload();
    sendMessage({ status: 'cancelled' });
  } else if (msg.action === 'cleanup') {
    localServer.unregisterFile(msg.token);
    if (msg.filePath && fs.existsSync(msg.filePath)) {
      try {
        fs.unlinkSync(msg.filePath);
      } catch (e) {
        // Ignora erro
      }
    }
  } else if (msg.action === 'update_ytdlp') {
    updater.updateYtDlp((progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }).then(result => {
      sendMessage({ status: 'success', text: result });
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else {
    sendMessage({ status: 'error', error: 'Ação desconhecida: ' + msg.action });
  }
}

process.stdin.on('end', () => {
  downloader.cancelCurrentDownload();
  process.exit(0);
});

process.on('exit', () => {
  downloader.cancelCurrentDownload();
});
