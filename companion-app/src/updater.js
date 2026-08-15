const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

function updateYtDlp(onProgress) {
  return new Promise((resolve, reject) => {
    onProgress("Procurando última versão do yt-dlp...");
    
    // Resolve a URL da última release
    const options = {
      hostname: 'api.github.com',
      path: '/repos/yt-dlp/yt-dlp/releases/latest',
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
    const binFolder = path.join(__dirname, '..', 'bin');
    if (!fs.existsSync(binFolder)) fs.mkdirSync(binFolder);
    
    const destPath = path.join(binFolder, assetName);
    const tempPath = destPath + '.new';
    
    const file = fs.createWriteStream(tempPath);
    
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Redirecionamentos de download (comum no github)
        file.close();
        return resolve(downloadBinary(res.headers.location, assetName, onProgress));
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
        file.close();
        // Substituir o antigo pelo novo
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
          fs.renameSync(tempPath, destPath);
          if (os.platform() !== 'win32') {
             fs.chmodSync(destPath, 0o755); // Dar permissão de execução
          }
          resolve();
        } catch (e) {
          reject(new Error('Falha ao substituir binário: ' + e.message + '. O yt-dlp pode estar em uso.'));
        }
      });
    }).on('error', (err) => {
      fs.unlink(tempPath, () => {});
      reject(err);
    });
  });
}

module.exports = { updateYtDlp };
