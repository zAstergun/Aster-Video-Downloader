const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const m3u8Parser = require('m3u8-parser');

// Helper para sanitize do nome de arquivo
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

const { spawn } = require('child_process');

function downloadYoutube(url, onProgress, cookies = null, quality = null, downloadFolder = null) {
  return new Promise((resolve, reject) => {
    // Procura o yt-dlp na pasta bin
    const ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');
    const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';

    // FASE 0: Arquivo salvo na pasta temporária do sistema
    const ext = quality === 'audio' ? 'mp3' : 'mp4';
    const outputPath = path.join(os.tmpdir(), `aster_temp_${Date.now()}.${ext}`);
    
    let formatArg = 'bestvideo+bestaudio/best';
    if (quality === 'audio') {
      formatArg = 'bestaudio/bestaudio';
    } else if (quality && quality !== 'best') {
      const height = quality.replace('p', '');
      formatArg = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
    }

    const args = [
      '--ffmpeg-location', path.join(__dirname, '..', 'bin'),
      '--js-runtimes', 'node',
      '-f', formatArg,
      '-o', outputPath
    ];
    
    if (quality === 'audio') {
      args.push('--extract-audio', '--audio-format', 'mp3');
    } else {
      args.push('--merge-output-format', 'mp4');
    }

    // Cria o arquivo de cookies se foram enviados do Chrome
    let cookiesFile = null;
    if (cookies && cookies.length > 0) {
      onProgress("Processando cookies do navegador para autenticação...");
      let cookieText = "# Netscape HTTP Cookie File\n";
      cookies.forEach(c => {
        const includeSubdomains = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const expiration = c.expirationDate ? Math.floor(c.expirationDate) : 0;
        cookieText += `${c.domain}\t${includeSubdomains}\t${c.path}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
      });
      cookiesFile = path.join(os.tmpdir(), `aster_cookies_${Date.now()}.txt`);
      fs.writeFileSync(cookiesFile, cookieText);
      args.push('--cookies', cookiesFile);
    }
    
    args.push(url);

    onProgress("Iniciando yt-dlp para burlar o bloqueio...");
    
    const child = spawn(executable, args);

    child.stdout.on('data', (data) => {
      onProgress(data.toString().trim());
    });

    child.stderr.on('data', (data) => {
      onProgress("INFO: " + data.toString().trim());
    });

    child.on('close', (code) => {
      if (cookiesFile && fs.existsSync(cookiesFile)) fs.unlinkSync(cookiesFile);
      
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`yt-dlp falhou com código ${code}. O arquivo yt-dlp.exe está na pasta bin?`));
      }
    });
    
    child.on('error', (err) => {
      if (cookiesFile && fs.existsSync(cookiesFile)) fs.unlinkSync(cookiesFile);
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
  try {
    onProgress("Analisando playlist HLS principal...");
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
      
      onProgress("Melhor qualidade HLS selecionada. Obtendo segmentos...");
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
    
    const outputPath = path.join(os.tmpdir(), `Aster_HLS_${Date.now()}.mp4`);
    const fileStream = fs.createWriteStream(outputPath);

    for (let i = 0; i < segments.length; i++) {
      let segmentUri = segments[i].uri;
      const segmentAbsUrl = new URL(segmentUri, targetUrl).href;
      
      const percent = (((i + 1) / totalSegments) * 100).toFixed(1);
      onProgress(`Baixando HLS: ${percent}% (Segmento ${i + 1}/${totalSegments})`);
      
      await downloadHLSSegment(segmentAbsUrl, fileStream, 3, cookies);
    }

    fileStream.end();
    return outputPath;
  } catch (err) {
    throw new Error(`Falha no HLS: ${err.message}`);
  }
}

function getYouTubeFormats(url, cookies = null) {
  return new Promise((resolve, reject) => {
    const ytDlpPath = path.join(__dirname, '..', 'bin', 'yt-dlp.exe');
    const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';
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
        resolve(sortedFormats);
      } catch (err) {
        resolve([]);
      }
    });
    
    child.on('error', () => resolve([]));
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

function downloadHTML5Converted(url, onProgress, quality, downloadFolder = null) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = path.join(__dirname, '..', 'bin', 'ffmpeg.exe');
    const executable = fs.existsSync(ffmpegPath) ? ffmpegPath : 'ffmpeg';
    
    const baseFolder = os.tmpdir();
    let outputPath = '';
    const args = ['-y', '-i', url];
    
    if (quality === 'audio') {
      outputPath = path.join(baseFolder, `Aster_HTML5_${Date.now()}.mp3`);
      args.push('-vn', '-c:a', 'libmp3lame', '-q:a', '2');
    } else {
      outputPath = path.join(baseFolder, `Aster_HTML5_${Date.now()}.mp4`);
      const height = parseInt(quality.replace('p', ''), 10) || 720;
      args.push('-vf', `scale=-2:${height}`, '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-c:a', 'aac');
    }
    
    args.push(outputPath);
    onProgress(`Iniciando conversão local com FFmpeg (${quality})... isso pode levar alguns minutos.`);
    
    const child = spawn(executable, args);

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
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg falhou com código ${code}. Verifique a pasta bin.`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`Falha ao iniciar FFmpeg: ${err.message}`));
    });
  });
}

module.exports = {
  downloadYoutube,
  downloadHLS,
  getYouTubeFormats,
  getHLSFormats,
  downloadHTML5Converted
};
