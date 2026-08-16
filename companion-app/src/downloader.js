const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const m3u8Parser = require('m3u8-parser');
const { getBinFolder, getBinCandidates } = require('./paths');
const updater = require('./updater');

// Helper para sanitize do nome de arquivo
function sanitizeFilename(name) {
  return name
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, '_')
    .trim()
    .slice(0, 150); // evita nomes excessivamente longos
}

function resolveBinaryPath(binName) {
  const platform = os.platform();
  let fileNames = [];
  if (binName === 'yt-dlp') {
    fileNames = platform === 'win32' ? ['yt-dlp.exe'] : (platform === 'darwin' ? ['yt-dlp_macos', 'yt-dlp'] : ['yt-dlp']);
  } else if (binName === 'ffmpeg') {
    fileNames = platform === 'win32' ? ['ffmpeg.exe'] : ['ffmpeg'];
  } else if (binName === 'ffprobe') {
    fileNames = platform === 'win32' ? ['ffprobe.exe'] : ['ffprobe'];
  } else {
    fileNames = [binName];
  }

  const candidates = typeof getBinCandidates === 'function' ? getBinCandidates() : [getBinFolder()];

  // 1. Auto-recuperação: se existir arquivo .new sem o executável final, tenta renomear/recuperar
  for (const dir of candidates) {
    for (const fileName of fileNames) {
      const newPath = path.join(dir, fileName + '.new');
      const targetPath = path.join(dir, fileName);
      if (fs.existsSync(newPath)) {
        if (!fs.existsSync(targetPath)) {
          try {
            fs.renameSync(newPath, targetPath);
          } catch (e) {
            try { fs.copyFileSync(newPath, targetPath); } catch (err) {}
          }
        }
      }
    }
  }

  // 2. Busca o binário em todas as pastas candidatas
  for (const dir of candidates) {
    for (const fileName of fileNames) {
      const localPath = path.join(dir, fileName);
      if (fs.existsSync(localPath)) {
        if (platform !== 'win32') {
          try { fs.chmodSync(localPath, 0o755); } catch (e) {}
        }
        return localPath;
      }
    }
  }

  // 3. Fallback: se apenas o .new existir, tenta utilizá-lo diretamente
  for (const dir of candidates) {
    for (const fileName of fileNames) {
      const newPath = path.join(dir, fileName + '.new');
      if (fs.existsSync(newPath)) {
        if (platform !== 'win32') {
          try { fs.chmodSync(newPath, 0o755); } catch (e) {}
        }
        return newPath;
      }
    }
  }

  return fileNames[0] || binName;
}

const { spawn } = require('child_process');

let currentDownload = null;

function cleanupTempFiles(files, prefix) {
  if (files && Array.isArray(files)) {
    files.forEach(f => {
      if (f && fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    });
  }
  if (prefix) {
    try {
      const tmpDir = os.tmpdir();
      const matched = fs.readdirSync(tmpDir).filter(name => name.startsWith(prefix));
      matched.forEach(name => {
        try { fs.unlinkSync(path.join(tmpDir, name)); } catch (e) {}
      });
    } catch (e) {}
  }
}

function cancelCurrentDownload() {
  if (!currentDownload) return;
  const { child, tempFiles, tempPrefix, fileStream, abortController } = currentDownload;
  
  if (abortController) {
    try { abortController.abort(); } catch (e) {}
  }
  
  if (fileStream) {
    try { fileStream.destroy(); } catch (e) {}
  }
  
  if (child) {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    } catch (e) {
      try { child.kill('SIGKILL'); } catch (err) {}
    }
  }
  
  setTimeout(() => {
    cleanupTempFiles(tempFiles, tempPrefix);
  }, 200);
  
  cleanupTempFiles(tempFiles, tempPrefix);
  currentDownload = null;
}

// Resolve o caminho do runtime Node.js para o yt-dlp (prefere o da pasta bin)
function resolveNodeRuntimeArg() {
  const candidates = typeof getBinCandidates === 'function' ? getBinCandidates() : [getBinFolder()];
  for (const dir of candidates) {
    const nodePath = path.join(dir, os.platform() === 'win32' ? 'node.exe' : 'node');
    if (fs.existsSync(nodePath)) {
      return `node:${nodePath}`;
    }
  }
  return 'node'; // fallback para o PATH do sistema
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Verifica se o erro do yt-dlp é recuperável com atualização
function isRetryableError(stderrText) {
  const retryablePatterns = [
    'n challenge solving failed',
    'Ensure you have a supported JavaScript runtime',
    'Unexpected response from webpage request',
    'Unable to extract universal data for rehydration',
    'Requested format is not available',
    'challenge solver script distribution',
    '[TikTok]'
  ];
  return retryablePatterns.some(pattern => stderrText.includes(pattern));
}

function downloadYoutube(url, onProgress, cookies = null, quality = null, directDownload = false, directPath = '', title = null, _isRetry = false) {
  return new Promise((resolve, reject) => {
    // Procura o yt-dlp na pasta bin
    const executable = resolveBinaryPath('yt-dlp');

    const timestamp = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const tempPrefix = `aster_temp_${timestamp}`;
    const ext = quality === 'audio' ? 'mp3' : 'mp4';
    
    let outputPath;
    if (directDownload && directPath) {
      if (!fs.existsSync(directPath)) {
        try { fs.mkdirSync(directPath, { recursive: true }); } catch(e){}
      }
      const safeTitle = title ? sanitizeFilename(title) : `aster_video_${timestamp}`;
      outputPath = path.join(directPath, `${safeTitle}.${ext}`);
    } else {
      outputPath = path.join(os.tmpdir(), `${tempPrefix}.${ext}`);
    }
    const tempFiles = [outputPath];
    
    let formatArg = 'bestvideo+bestaudio/best';
    if (quality === 'audio') {
      formatArg = 'bestaudio/bestaudio';
    } else if (quality && quality !== 'best') {
      const height = quality.replace('p', '');
      formatArg = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
    }

    const ffmpegPath = resolveBinaryPath('ffmpeg');
    const ffmpegDir = path.isAbsolute(ffmpegPath) ? path.dirname(ffmpegPath) : getBinFolder();

    const nodeRuntime = resolveNodeRuntimeArg();
    const args = [
      '--ffmpeg-location', ffmpegDir,
      '--js-runtimes', nodeRuntime,
      '--remote-components', 'ejs:github',
      '--user-agent', DEFAULT_USER_AGENT,
      '-f', formatArg,
      '-o', outputPath
    ];

    if (url.includes('tiktok.com')) {
      args.push('--referer', 'https://www.tiktok.com/');
      args.push('--impersonate', 'chrome');
    } else if (url.includes('instagram.com')) {
      args.push('--referer', 'https://www.instagram.com/');
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      args.push('--referer', 'https://x.com/');
    }
    
    if (quality === 'audio') {
      args.push('--extract-audio', '--audio-format', 'mp3');
    } else {
      args.push('--merge-output-format', 'mp4');
      args.push('--write-subs', '--embed-subs', '--sub-langs', 'all');
    }

    // Cria o arquivo de cookies se foram enviados do Chrome
    let cookiesFile = null;
    if (cookies && cookies.length > 0) {
      onProgress("Preparando autenticação...");
      let cookieText = "# Netscape HTTP Cookie File\n";
      cookies.forEach(c => {
        const includeSubdomains = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const expiration = c.expirationDate ? Math.floor(c.expirationDate) : 0;
        cookieText += `${c.domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
      });
      cookiesFile = path.join(os.tmpdir(), `aster_cookies_${timestamp}.txt`);
      fs.writeFileSync(cookiesFile, cookieText);
      tempFiles.push(cookiesFile);
      args.push('--cookies', cookiesFile);
    }
    
    // Remove fragmento de hash interno antes de passar ao yt-dlp
    const targetUrl = (url && url.includes('#')) ? url.split('#')[0] : url;
    args.push(targetUrl);

    onProgress("Preparando vídeo...");
    
    const env = Object.assign({}, process.env);
    // Windows: a chave PATH pode ser 'Path', 'PATH', etc. Precisamos modificar a existente.
    const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
    env[pathKey] = getBinFolder() + path.delimiter + (env[pathKey] || '');

    const child = spawn(executable, args, { env });
    currentDownload = { type: 'ytdl', child, tempFiles, tempPrefix };
    
    let stderrBuffer = '';
    let stdoutBuffer = '';

    child.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) stdoutBuffer += text + '\n';
      onProgress(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        stderrBuffer += text + '\n';
        onProgress("INFO: " + text);
      }
    });

    child.on('close', (code) => {
      if (cookiesFile && fs.existsSync(cookiesFile)) {
        try { fs.unlinkSync(cookiesFile); } catch (e) {}
      }
      
      if (currentDownload && currentDownload.child === child) {
        currentDownload = null;
      }
      
      if (code === 0) {
        resolve(outputPath);
      } else if (!_isRetry && isRetryableError(stderrBuffer)) {
        // Erro recuperável: tenta atualizar yt-dlp + node e re-executar
        cleanupTempFiles(tempFiles, tempPrefix);
        onProgress('Erro detectado. Atualizando componentes e tentando novamente...');
        updater.updateAll((msg) => onProgress(`[Atualização] ${msg}`))
          .then(() => {
            onProgress('Componentes atualizados. Re-tentando download...');
            return downloadYoutube(url, onProgress, cookies, quality, directDownload, directPath, title, true);
          })
          .then(resolve)
          .catch(reject);
      } else {
        cleanupTempFiles(tempFiles, tempPrefix);
        let errorOutput = stderrBuffer.trim() || stdoutBuffer.trim();
        const lastLines = errorOutput.split('\n').slice(-8).join(' | ');
        const detail = lastLines ? `Detalhe: ${lastLines}` : (url.includes('tiktok.com') ? 'O TikTok bloqueou o yt-dlp (tente atualizar ou aguardar correção).' : 'O arquivo yt-dlp.exe está na pasta bin?');
        reject(new Error(`yt-dlp falhou com código ${code}. ${detail}`));
      }
    });
    
    child.on('error', (err) => {
      cleanupTempFiles(tempFiles, tempPrefix);
      if (currentDownload && currentDownload.child === child) {
        currentDownload = null;
      }
      reject(new Error(`Falha ao iniciar yt-dlp: ${err.message}`));
    });
  });
}

function fetchHLS(url, cookies = null) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const options = {};
    if (cookies && cookies.length > 0) {
      options.headers = {
        'Cookie': cookies.map(c => `${c.name}=${c.value}`).join('; ')
      };
    }
    client.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchHLS(res.headers.location, cookies));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Erro HTTP: ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ body: data, finalUrl: url }));
    }).on('error', reject);
  });
}

function downloadHLSSegment(segmentUrl, writeStream, maxRetries = 3, cookies = null) {
  return new Promise((resolve, reject) => {
    const client = segmentUrl.startsWith('https') ? https : http;
    const options = {};
    if (cookies && cookies.length > 0) {
      options.headers = {
        'Cookie': cookies.map(c => `${c.name}=${c.value}`).join('; ')
      };
    }
    
    const tryDownload = (attempt) => {
      client.get(segmentUrl, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadHLSSegment(res.headers.location, writeStream, maxRetries, cookies));
        }
        if (res.statusCode !== 200) {
          if (attempt < maxRetries) {
            setTimeout(() => tryDownload(attempt + 1), 1000);
            return;
          }
          return reject(new Error(`Erro HTTP no segmento: ${res.statusCode}`));
        }
        
        res.on('data', (chunk) => writeStream.write(chunk));
        res.on('end', () => resolve());
      }).on('error', (err) => {
        if (attempt < maxRetries) {
          setTimeout(() => tryDownload(attempt + 1), 1000);
          return;
        }
        reject(err);
      });
    };
    
    tryDownload(1);
  });
}

async function downloadHLS(url, onProgress, quality = null, cookies = null, directDownload = false, directPath = '', title = null) {
  const timestamp = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
  const tempPrefix = `Aster_HLS_${timestamp}`;
  
  let outputPath;
  if (directDownload && directPath) {
    if (!fs.existsSync(directPath)) {
      try { fs.mkdirSync(directPath, { recursive: true }); } catch(e){}
    }
    const safeTitle = title ? sanitizeFilename(title) : `Aster_HLS_${timestamp}`;
    outputPath = path.join(directPath, `${safeTitle}.mp4`);
  } else {
    outputPath = path.join(os.tmpdir(), `${tempPrefix}.mp4`);
  }
  const tempFiles = [outputPath];
  
  let isCancelled = false;
  const abortController = {
    abort: () => { isCancelled = true; }
  };

  try {
    onProgress("Analisando stream de vídeo...");
    const masterRes = await fetchHLS(url, cookies);
    const parser = new m3u8Parser.Parser();
    parser.push(masterRes.body);
    parser.end();

    let targetUrl = masterRes.finalUrl;

    // Se for uma master playlist, pegamos a qualidade solicitada
    if (parser.manifest.playlists && parser.manifest.playlists.length > 0) {
      let targetPlaylist = null;
      
      if (quality && quality !== 'best' && quality !== 'audio') {
        const targetHeight = parseInt(quality.replace('p', ''), 10);
        // Filtra playlists que tenham a resolucao definida e <= targetHeight
        const validPlaylists = parser.manifest.playlists.filter(p => p.attributes.RESOLUTION && p.attributes.RESOLUTION.height <= targetHeight);
        
        if (validPlaylists.length > 0) {
          // Ordena por height (decrescente) e depois por bandwidth para pegar a melhor dentro do limite
          validPlaylists.sort((a, b) => {
            if (b.attributes.RESOLUTION.height !== a.attributes.RESOLUTION.height) {
              return b.attributes.RESOLUTION.height - a.attributes.RESOLUTION.height;
            }
            return b.attributes.BANDWIDTH - a.attributes.BANDWIDTH;
          });
          targetPlaylist = validPlaylists[0];
        }
      }
      
      if (!targetPlaylist) {
        // Fallback: pega a melhor qualidade (maior bandwidth)
        const sortedPlaylists = parser.manifest.playlists.sort((a, b) => b.attributes.BANDWIDTH - a.attributes.BANDWIDTH);
        targetPlaylist = sortedPlaylists[0];
      }
      
      let bestPlaylistUri = targetPlaylist.uri;
      
      // Resolve a URI relativa para absoluta
      targetUrl = new URL(bestPlaylistUri, masterRes.finalUrl).href;
      
      onProgress("Preparando stream de vídeo...");
      const variantRes = await fetchHLS(targetUrl, cookies);
      const variantParser = new m3u8Parser.Parser();
      variantParser.push(variantRes.body);
      variantParser.end();
      parser.manifest = variantParser.manifest;
    }

    if (!parser.manifest.segments || parser.manifest.segments.length === 0) {
      throw new Error("Nenhum segmento encontrado na playlist.");
    }

    const segments = parser.manifest.segments;
    const totalSegments = segments.length;
    
    const fileStream = fs.createWriteStream(outputPath);
    currentDownload = { type: 'hls', fileStream, tempFiles, tempPrefix, abortController };

    for (let i = 0; i < segments.length; i++) {
      if (isCancelled) {
        throw new Error("Download HLS cancelado pelo usuário.");
      }
      let segmentUri = segments[i].uri;
      const segmentAbsUrl = new URL(segmentUri, targetUrl).href;
      
      const percent = (((i + 1) / totalSegments) * 100).toFixed(1);
      onProgress(`Baixando: ${percent}%`);
      
      await downloadHLSSegment(segmentAbsUrl, fileStream, 3, cookies);
    }

    fileStream.end();
    if (currentDownload && currentDownload.fileStream === fileStream) {
      currentDownload = null;
    }
    return outputPath;
  } catch (err) {
    cleanupTempFiles(tempFiles, tempPrefix);
    if (currentDownload && currentDownload.tempFiles === tempFiles) {
      currentDownload = null;
    }
    throw new Error(`Falha no HLS: ${err.message}`);
  }
}

function getYouTubeFormats(url, cookies = null) {
  return new Promise((resolve, reject) => {
    const executable = resolveBinaryPath('yt-dlp');
    const nodeRuntime = resolveNodeRuntimeArg();
    const args = [
      '--js-runtimes', nodeRuntime,
      '--remote-components', 'ejs:github',
      '--user-agent', DEFAULT_USER_AGENT,
      '-J'
    ];

    if (url.includes('tiktok.com')) {
      args.push('--referer', 'https://www.tiktok.com/');
      args.push('--impersonate', 'chrome');
    } else if (url.includes('instagram.com')) {
      args.push('--referer', 'https://www.instagram.com/');
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      args.push('--referer', 'https://x.com/');
    }
    
    let cookiesFile = null;
    if (cookies && cookies.length > 0) {
      let cookieText = "# Netscape HTTP Cookie File\n";
      cookies.forEach(c => {
        const includeSubdomains = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const expiration = c.expirationDate ? Math.floor(c.expirationDate) : 0;
        cookieText += `${c.domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
      });
      cookiesFile = path.join(os.tmpdir(), `aster_cookies_fmt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.txt`);
      fs.writeFileSync(cookiesFile, cookieText);
      args.push('--cookies', cookiesFile);
    }
    
    // Remove fragmento de hash interno antes de passar ao yt-dlp
    const targetUrl = (url && url.includes('#')) ? url.split('#')[0] : url;
    args.push(targetUrl);
    
    const env = Object.assign({}, process.env);
    const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
    env[pathKey] = getBinFolder() + path.delimiter + (env[pathKey] || '');

    const child = spawn(executable, args, { env });
    let output = '';
    let stderrOutput = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });
    
    child.on('close', (code) => {
      if (cookiesFile && fs.existsSync(cookiesFile)) fs.unlinkSync(cookiesFile);
      if (code !== 0) {
        let errorMsg = stderrOutput.trim() || output.trim();
        const lastLines = errorMsg.split('\n').slice(-8).join(' | ');
        return resolve({ formats: [], title: null, error: lastLines });
      }
      try {
        const info = JSON.parse(output);
        if (!info.formats) return resolve({ formats: [], title: null });
        
        const formatsMap = new Map();
        info.formats.forEach(f => {
          if (f.vcodec !== 'none') {
            let h = f.height;
            let w = f.width;
            if (!h && f.resolution && typeof f.resolution === 'string' && f.resolution.includes('x')) {
              const parts = f.resolution.split('x');
              if (parts.length === 2) {
                w = parseInt(parts[0], 10) || null;
                h = parseInt(parts[1], 10) || null;
              }
            }
            if (h) {
              w = w || Math.round(h * 16 / 9);
              if (!formatsMap.has(h)) {
                 formatsMap.set(h, { height: h, width: w });
              } else if (w > formatsMap.get(h).width) {
                 formatsMap.set(h, { height: h, width: w });
              }
            }
          }
        });
        const sortedFormats = Array.from(formatsMap.values()).sort((a, b) => b.height - a.height);
        resolve({ formats: sortedFormats, title: info.title || null });
      } catch (err) {
        resolve({ formats: [], title: null, error: 'Falha ao parsear JSON: ' + err.message });
      }
    });
    
    child.on('error', (err) => resolve({ formats: [], title: null, error: err.message }));
  });
}

async function getHLSFormats(url, cookies = null) {
  try {
    const masterRes = await fetchHLS(url, cookies);
    const parser = new m3u8Parser.Parser();
    parser.push(masterRes.body);
    parser.end();
    
    if (parser.manifest.playlists && parser.manifest.playlists.length > 0) {
      const formatsMap = new Map();
      parser.manifest.playlists.forEach(p => {
        if (p.attributes.RESOLUTION && p.attributes.RESOLUTION.height && p.attributes.RESOLUTION.width) {
          const h = p.attributes.RESOLUTION.height;
          const w = p.attributes.RESOLUTION.width;
          if (!formatsMap.has(h)) {
            formatsMap.set(h, { height: h, width: w });
          } else if (w > formatsMap.get(h).width) {
            formatsMap.set(h, { height: h, width: w });
          }
        }
      });
      const sortedFormats = Array.from(formatsMap.values()).sort((a, b) => b.height - a.height);
      return sortedFormats;
    }
    return [];
  } catch (err) {
    return [];
  }
}

function downloadHTML5Converted(url, onProgress, quality, directDownload = false, directPath = '', title = null) {
  return new Promise((resolve, reject) => {
    const executable = resolveBinaryPath('ffmpeg');
    
    const timestamp = Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const tempPrefix = `Aster_HTML5_${timestamp}`;
    const ext = quality === 'audio' ? 'mp3' : 'mp4';
    
    let outputPath;
    if (directDownload && directPath) {
      if (!fs.existsSync(directPath)) {
        try { fs.mkdirSync(directPath, { recursive: true }); } catch(e){}
      }
      const safeTitle = title ? sanitizeFilename(title) : `Aster_HTML5_${timestamp}`;
      outputPath = path.join(directPath, `${safeTitle}.${ext}`);
    } else {
      outputPath = path.join(os.tmpdir(), `${tempPrefix}.${ext}`);
    }
    const tempFiles = [outputPath];
    
    const args = ['-y', '-i', url];
    
    if (quality === 'audio') {
      args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2');
    } else {
      const height = parseInt(quality.replace('p', ''), 10) || 720;
      args.push('-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac');
    }
    
    args.push(outputPath);
    onProgress(`Convertendo vídeo (${quality})...`);
    
    const child = spawn(executable, args);
    currentDownload = { type: 'ffmpeg', child, tempFiles, tempPrefix };
    
    let stderrBuffer = '';

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        stderrBuffer += msg + '\n';
      }
      if (msg.includes('time=')) {
        const timeMatch = msg.match(/time=(\d{2}:\d{2}:\d{2})/);
        if (timeMatch) {
          onProgress(`Convertendo... Tempo renderizado: ${timeMatch[1]}`);
        }
      }
    });

    child.on('close', (code) => {
      if (currentDownload && currentDownload.child === child) {
        currentDownload = null;
      }
      if (code === 0) {
        resolve(outputPath);
      } else {
        cleanupTempFiles(tempFiles, tempPrefix);
        const lastLines = stderrBuffer.trim().split('\n').slice(-3).join(' | ');
        const detail = lastLines ? `Detalhe: ${lastLines}` : 'Verifique a pasta bin.';
        reject(new Error(`FFmpeg falhou com código ${code}. ${detail}`));
      }
    });
    
    child.on('error', (err) => {
      cleanupTempFiles(tempFiles, tempPrefix);
      if (currentDownload && currentDownload.child === child) {
        currentDownload = null;
      }
      reject(new Error(`Falha ao iniciar FFmpeg: ${err.message}`));
    });
  });
}

module.exports = {
  downloadYoutube,
  downloadHLS,
  getYouTubeFormats,
  getHLSFormats,
  downloadHTML5Converted,
  cancelCurrentDownload
};
