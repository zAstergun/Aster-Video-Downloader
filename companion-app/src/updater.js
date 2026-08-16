const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getBinFolder } = require('./paths');

function updateYtDlp(onProgress) {
  return new Promise((resolve, reject) => {
    onProgress("Procurando última versão do yt-dlp (Nightly/Latest)...");
    
    // Resolve a URL da última release (usa nightly builds para correções diárias de extratores como TikTok)
    const options = {
      hostname: 'api.github.com',
      path: '/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest',
      method: 'GET',
      headers: { 'User-Agent': 'Aster-Video-Downloader' }
    };
    
    https.get(options, (res) => {
      let data = '';
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Redirecionamento (incomum na API, mas por garantia)
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Falha ao obter última versão: HTTP ' + res.statusCode));
      }
      
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const platform = os.platform();
          
          let assetName = '';
          if (platform === 'win32') assetName = 'yt-dlp.exe';
          else if (platform === 'darwin') assetName = 'yt-dlp_macos';
          else assetName = 'yt-dlp'; // Linux
          
          const asset = release.assets.find(a => a.name === assetName);
          if (!asset) {
            return reject(new Error('Binário não encontrado para sua plataforma na última versão.'));
          }
          
          onProgress(`Baixando versão ${release.tag_name}...`);
          downloadBinary(asset.browser_download_url, assetName, onProgress)
            .then(() => resolve(`yt-dlp atualizado para ${release.tag_name} com sucesso!`))
            .catch(reject);
            
        } catch (e) {
          reject(new Error('Falha ao interpretar resposta do GitHub: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

function downloadBinary(url, assetName, onProgress) {
  return new Promise((resolve, reject) => {
    const binFolder = getBinFolder();
    if (!fs.existsSync(binFolder)) {
      try { fs.mkdirSync(binFolder, { recursive: true }); } catch (e) {}
    }
    
    const destPath = path.join(binFolder, assetName);
    const tempPath = destPath + '.new';
    
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
    
    const file = fs.createWriteStream(tempPath);
    
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Redirecionamentos de download (comum no github)
        file.close(() => {
          try { fs.unlinkSync(tempPath); } catch (e) {}
          downloadBinary(res.headers.location, assetName, onProgress)
            .then(resolve)
            .catch(reject);
        });
        return;
      }

      if (res.statusCode !== 200) {
        file.close(() => {
          try { fs.unlinkSync(tempPath); } catch (e) {}
          reject(new Error('Falha ao baixar binário: HTTP ' + res.statusCode));
        });
        return;
      }
      
      const totalSize = parseInt(res.headers['content-length'], 10);
      let downloadedSize = 0;
      
      res.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(0);
          if (percent % 10 === 0) onProgress(`Baixando atualização: ${percent}%`);
        }
      });
      
      res.pipe(file);
      file.on('finish', () => {
        file.close(async (closeErr) => {
          if (closeErr) {
            try { fs.unlinkSync(tempPath); } catch (e) {}
            return reject(closeErr);
          }

          // Delay para liberação do lock de arquivo no Windows
          await new Promise(r => setTimeout(r, 150));

          let replaced = false;
          let lastError = null;

          for (let attempt = 1; attempt <= 5; attempt++) {
            try {
              if (fs.existsSync(destPath)) {
                try { fs.unlinkSync(destPath); } catch (e) {}
              }
              fs.renameSync(tempPath, destPath);
              if (os.platform() !== 'win32') {
                try { fs.chmodSync(destPath, 0o755); } catch (e) {}
              }
              replaced = true;
              break;
            } catch (e) {
              lastError = e;
              await new Promise(r => setTimeout(r, 200));
            }
          }

          if (replaced) {
            resolve();
          } else {
            try {
              fs.copyFileSync(tempPath, destPath);
              try { fs.unlinkSync(tempPath); } catch (e) {}
              if (os.platform() !== 'win32') {
                try { fs.chmodSync(destPath, 0o755); } catch (e) {}
              }
              resolve();
            } catch (copyErr) {
              reject(new Error('Falha ao substituir binário: ' + (lastError ? lastError.message : copyErr.message) + '. O arquivo pode estar em uso.'));
            }
          }
        });
      });
    });

    req.on('error', (err) => {
      file.close(() => {
        try { fs.unlinkSync(tempPath); } catch (e) {}
        reject(err);
      });
    });
  });
}

function updateFfmpeg(onProgress) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    if (platform !== 'win32') {
      return resolve('FFmpeg no macOS/Linux é gerenciado pelo sistema (brew/apt) — nada a atualizar.');
    }

    onProgress("Procurando FFmpeg...");
    const zipUrl = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
    const binFolder = getBinFolder();
    if (!fs.existsSync(binFolder)) {
      try { fs.mkdirSync(binFolder, { recursive: true }); } catch (e) {}
    }
    
    const zipDest = path.join(binFolder, 'ffmpeg.zip');
    if (fs.existsSync(zipDest)) {
      try { fs.unlinkSync(zipDest); } catch (e) {}
    }

    const file = fs.createWriteStream(zipDest);
    
    // Função para tratar redirecionamentos recursivamente
    const downloadZip = (url) => {
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadZip(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close(() => {
            try { fs.unlinkSync(zipDest); } catch (e) {}
            reject(new Error('Falha ao baixar FFmpeg: HTTP ' + res.statusCode));
          });
          return;
        }

        const totalSize = parseInt(res.headers['content-length'], 10);
        let downloadedSize = 0;
        
        res.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize) {
            const percent = ((downloadedSize / totalSize) * 100).toFixed(0);
            if (percent % 10 === 0) onProgress(`Baixando zip: ${percent}%`);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close(async (closeErr) => {
            if (closeErr) {
              try { fs.unlinkSync(zipDest); } catch (e) {}
              return reject(closeErr);
            }

            await new Promise(r => setTimeout(r, 150));
            onProgress("Extraindo FFmpeg...");
            
            const script = `
              $ErrorActionPreference = 'Stop'
              Add-Type -AssemblyName System.IO.Compression.FileSystem
              $zipPath = '${zipDest}'
              $extractPath = '${binFolder}\\ffmpeg_temp'
              if (Test-Path $extractPath) { Remove-Item -Path $extractPath -Recurse -Force }
              New-Item -ItemType Directory -Path $extractPath | Out-Null
              [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $extractPath)
              
              $ffmpegExe = Get-ChildItem -Path $extractPath -Filter "ffmpeg.exe" -Recurse | Select-Object -First 1
              if ($ffmpegExe) {
                Copy-Item -Path $ffmpegExe.FullName -Destination '${binFolder}\\ffmpeg.exe' -Force
              }
              $ffprobeExe = Get-ChildItem -Path $extractPath -Filter "ffprobe.exe" -Recurse | Select-Object -First 1
              if ($ffprobeExe) {
                Copy-Item -Path $ffprobeExe.FullName -Destination '${binFolder}\\ffprobe.exe' -Force
              }
              
              Remove-Item -Path $extractPath -Recurse -Force
              Remove-Item -Path $zipPath -Force
            `;
            
            const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', script]);
            
            ps.on('close', (code) => {
              if (code === 0) {
                resolve('FFmpeg atualizado com sucesso!');
              } else {
                reject(new Error('Falha na extração do FFmpeg via PowerShell.'));
              }
            });
            
            ps.on('error', (err) => {
              reject(new Error('Erro ao chamar PowerShell para extração: ' + err.message));
            });
          });
        });
      }).on('error', (err) => {
        file.close(() => {
          try { fs.unlinkSync(zipDest); } catch (e) {}
          reject(err);
        });
      });
    };
    
    downloadZip(zipUrl);
  });
}

function updateNode(onProgress) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    if (platform !== 'win32') {
      return resolve('Node.js no macOS/Linux geralmente já está instalado ou será usado pelo sistema.');
    }
    
    const binFolder = getBinFolder();
    const nodePath = path.join(binFolder, 'node.exe');
    const requiredMajor = 22;
    const nodeUrl = 'https://nodejs.org/dist/v22.16.0/win-x64/node.exe';
    
    // Verifica se o node.exe existente atende à versão mínima
    if (fs.existsSync(nodePath)) {
      try {
        const { execSync } = require('child_process');
        const version = execSync(`"${nodePath}" --version`, { timeout: 5000 }).toString().trim();
        const major = parseInt(version.replace('v', '').split('.')[0], 10);
        if (major >= requiredMajor) {
          return resolve(`Node.js já está na versão ${version}.`);
        }
        onProgress(`Node.js ${version} desatualizado (mínimo v${requiredMajor}). Atualizando...`);
      } catch (e) {
        onProgress('Não foi possível verificar versão do Node.js. Atualizando...');
      }
    } else {
      onProgress("Procurando Node.js (Runtime JS)...");
    }
    
    onProgress("Baixando Node.js v22...");
    downloadBinary(nodeUrl, 'node.exe', onProgress)
      .then(() => resolve('Node.js atualizado com sucesso!'))
      .catch(reject);
  });
}

async function updateAll(onProgress) {
  let ytResult = '';
  let ffmpegResult = '';

  try {
    ytResult = await updateYtDlp((msg) => onProgress(`[yt-dlp] ${msg}`));
  } catch (err) {
    ytResult = `Erro yt-dlp: ${err.message}`;
  }

  try {
    ffmpegResult = await updateFfmpeg((msg) => onProgress(`[FFmpeg] ${msg}`));
  } catch (err) {
    ffmpegResult = `Erro FFmpeg: ${err.message}`;
  }

  let nodeResult = '';
  try {
    nodeResult = await updateNode((msg) => onProgress(`[NodeJS] ${msg}`));
  } catch (err) {
    nodeResult = `Erro NodeJS: ${err.message}`;
  }

  return `${ytResult}\n${ffmpegResult}\n${nodeResult}`;
}

module.exports = { updateAll, updateYtDlp, updateFfmpeg, updateNode };
