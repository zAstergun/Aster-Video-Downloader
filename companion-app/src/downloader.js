const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const m3u8Parser = require('m3u8-parser');
const { getBinFolder, getBinCandidates } = require('./paths');

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

function downloadYoutube(url, onProgress, cookies = null, quality = null) {
  return new Promise((resolve, reject) => {
    // Procura o yt-dlp na pasta bin
    const executable = resolveBinaryPath('yt-dlp');

    const timestamp = Date.now();
    const tempPrefix = `aster_temp_${timestamp}`;
    const ext = quality === 'audio' ? 'mp3' : 'mp4';
    const outputPath = path.join(os.tmpdir(), `${tempPrefix}.${ext}`);
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

    const args = [
      '--ffmpeg-location', ffmpegDir,
      '--js-runtimes', 'node',
      '-f', formatArg,
      '-o', outputPath
    ];
    
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
    
    args.push(url);

    onProgress("Preparando vídeo...");
    
    const child = spawn(executable, args);
    currentDownload = { type: 'ytdl', child, tempFiles, tempPrefix };

    child.stdout.on('data', (data) => {
      onProgress(data.toString().trim());
    });

    child.stderr.on('data', (data) => {
      onProgress("INFO: " + data.toString().trim());
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
      } else {
        cleanupTempFiles(tempFiles, tempPrefix);
        reject(new Error(`yt-dlp falhou com código ${code}. O arquivo yt-dlp.exe está na pasta bin?`));
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

async function downloadHLS(url, onProgress, quality = null, cookies = null) {
  const timestamp = Date.now();
  const tempPrefix = `Aster_HLS_${timestamp}`;
  const outputPath = path.join(os.tmpdir(), `${tempPrefix}.mp4`);
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
    const args = ['--js-runtimes', 'node', '-J'];
    
    let cookiesFile = null;
    if (cookies && cookies.length > 0) {
      let cookieText = "# Netscape HTTP Cookie File\n";
      cookies.forEach(c => {
        const includeSubdomains = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const expiration = c.expirationDate ? Math.floor(c.expirationDate) : 0;
        cookieText += `${c.domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
      });
      cookiesFile = path.join(os.tmpdir(), `aster_cookies_fmt_${Date.now()}.txt`);
      fs.writeFileSync(cookiesFile, cookieText);
      args.push('--cookies', cookiesFile);
    }
    
    args.push(url);
    
    const child = spawn(executable, args);
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.on('close', (code) => {
      if (cookiesFile && fs.existsSync(cookiesFile)) fs.unlinkSync(cookiesFile);
      if (code !== 0) {
        return resolve([]); // Retorna vazio silenciosamente
      }
      try {
        const info = JSON.parse(output);
        if (!info.formats) return resolve([]);
        
        const formatsMap = new Map();
        info.formats.forEach(f => {
          if (f.vcodec !== 'none' && f.height) {
            const h = f.height;
            const w = f.width || Math.round(h * 16 / 9);
            if (!formatsMap.has(h)) {
               formatsMap.set(h, { height: h, width: w });
            } else if (w > formatsMap.get(h).width) {
               formatsMap.set(h, { height: h, width: w });
            }
          }
        });
        const sortedFormats = Array.from(formatsMap.values()).sort((a, b) => b.height - a.height);
        resolve({ formats: sortedFormats, title: info.title || null });
      } catch (err) {
        resolve({ formats: [], title: null });
      }
    });
    
    child.on('error', () => resolve({ formats: [], title: null }));
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

function downloadHTML5Converted(url, onProgress, quality) {
  return new Promise((resolve, reject) => {
    const executable = resolveBinaryPath('ffmpeg');
    
    const baseFolder = os.tmpdir();
    const timestamp = Date.now();
    const tempPrefix = `Aster_HTML5_${timestamp}`;
    const ext = quality === 'audio' ? 'mp3' : 'mp4';
    const outputPath = path.join(baseFolder, `${tempPrefix}.${ext}`);
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

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
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
        reject(new Error(`FFmpeg falhou com código ${code}. Verifique a pasta bin.`));
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
