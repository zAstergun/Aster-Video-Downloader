const fs = require('fs');
const downloader = require('./downloader');
const localServer = require('./local-server');
const updater = require('./updater');

// Lógica de Native Messaging usando stdio
let inputBuffer = Buffer.alloc(0);
let isInitializing = false;
let messageQueue = [];

function processQueue() {
  while (messageQueue.length > 0) {
    handleMessage(messageQueue.shift());
  }
}

process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
  }
  
  while (inputBuffer.length >= 4) {
    const length = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length >= 4 + length) {
      const messageString = inputBuffer.toString('utf8', 4, 4 + length);
      inputBuffer = inputBuffer.subarray(4 + length); // Avança o buffer
      try {
        const message = JSON.parse(messageString);
        if (isInitializing) {
          messageQueue.push(message);
        } else {
          handleMessage(message);
        }
      } catch (e) {
        sendMessage({ error: 'Falha ao processar mensagem JSON' });
      }
    } else {
      break; // Aguarda mais dados
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
    const isVIP = ['youtube', 'twitter', 'instagram', 'facebook', 'reddit', 'tiktok'].includes(msg.type);
    if (isVIP) {
      downloader.getYouTubeFormats(msg.url, msg.cookies).then(result => {
        const formats = Array.isArray(result) ? result : (result.formats || []);
        const title = result && result.title ? result.title : null;
        const error = result && result.error ? result.error : null;
        sendMessage({ status: 'formats', formats: formats, title: title, videoUrl: msg.url, error: error });
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
    }, msg.cookies, msg.quality, msg.directDownload, msg.directPath, msg.title).then((filePath) => {
      if (msg.directDownload) {
        sendMessage({ status: 'direct_success', filePath: filePath });
      } else {
        return localServer.registerFile(filePath).then(localUrl => {
          const token = new URL(localUrl).searchParams.get('token');
          sendMessage({ status: 'ready_to_download', url: localUrl, token: token, filePath: filePath });
        });
      }
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'download_hls') {
    sendMessage({ status: 'info', text: 'Iniciando stream HLS...' });
    downloader.downloadHLS(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.quality, msg.cookies, msg.directDownload, msg.directPath, msg.title).then((filePath) => {
      if (msg.directDownload) {
        sendMessage({ status: 'direct_success', filePath: filePath });
      } else {
        return localServer.registerFile(filePath).then(localUrl => {
          const token = new URL(localUrl).searchParams.get('token');
          sendMessage({ status: 'ready_to_download', url: localUrl, token: token, filePath: filePath });
        });
      }
    }).catch(err => {
      sendMessage({ status: 'error', error: err.message });
    });
  } else if (msg.action === 'download_html5_converted') {
    sendMessage({ status: 'info', text: 'Iniciando conversão...' });
    downloader.downloadHTML5Converted(msg.url, (progressMsg) => {
      sendMessage({ status: 'progress', text: progressMsg });
    }, msg.quality, msg.directDownload, msg.directPath, msg.title).then((filePath) => {
      if (msg.directDownload) {
        sendMessage({ status: 'direct_success', filePath: filePath });
      } else {
        return localServer.registerFile(filePath).then(localUrl => {
          const token = new URL(localUrl).searchParams.get('token');
          sendMessage({ status: 'ready_to_download', url: localUrl, token: token, filePath: filePath });
        });
      }
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
    updater.updateAll((progressMsg) => {
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

const { getBinFolder } = require('./paths');
const path = require('path');

async function checkFirstRun() {
  const binFolder = getBinFolder();
  let needsDownload = false;
  
  if (!fs.existsSync(binFolder)) {
    needsDownload = true;
  } else {
    const platform = process.platform;
    const ytdlpFile = platform === 'win32' ? 'yt-dlp.exe' : (platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp');
    if (!fs.existsSync(path.join(binFolder, ytdlpFile))) needsDownload = true;
    if (platform === 'win32') {
      if (!fs.existsSync(path.join(binFolder, 'ffmpeg.exe'))) needsDownload = true;
      if (!fs.existsSync(path.join(binFolder, 'node.exe'))) needsDownload = true;
    }
  }

  if (needsDownload) {
    isInitializing = true;
    sendMessage({ status: 'info', text: 'Configurando o Aster pela primeira vez — baixando componentes necessários...' });
    try {
      await updater.updateAll((progressMsg) => {
        sendMessage({ status: 'progress', text: progressMsg });
      });
      sendMessage({ status: 'success', text: 'Componentes baixados com sucesso!' });
    } catch (err) {
      sendMessage({ status: 'error', error: 'Falha ao baixar componentes: ' + err.message });
    }
    isInitializing = false;
    processQueue();
  }
}

// Executar checagem na inicialização
checkFirstRun();
