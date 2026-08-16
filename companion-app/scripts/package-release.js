const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const tempDir = path.join(rootDir, '_release_temp');
  const zipPath = path.join(rootDir, 'Aster-Video-Downloader.zip');

  console.log('[1/4] Limpando diretórios temporários...');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[2/4] Copiando arquivos essenciais da extensão...');
  // 1. Arquivos na raiz
  fs.copyFileSync(path.join(rootDir, 'manifest.json'), path.join(tempDir, 'manifest.json'));
  
  const setupExe = path.join(rootDir, 'Aster Companion Setup.exe');
  if (!fs.existsSync(setupExe)) {
    console.error('ERRO: "Aster Companion Setup.exe" não encontrado na raiz!');
    process.exit(1);
  }
  fs.copyFileSync(setupExe, path.join(tempDir, 'Aster Companion Setup.exe'));

  // 2. Pastas da extensão
  copyDirRecursive(path.join(rootDir, 'background'), path.join(tempDir, 'background'));
  copyDirRecursive(path.join(rootDir, 'content-scripts'), path.join(tempDir, 'content-scripts'));
  copyDirRecursive(path.join(rootDir, 'sidepanel'), path.join(tempDir, 'sidepanel'));

  // 3. Assets filtrados
  const assetsDest = path.join(tempDir, 'assets');
  fs.mkdirSync(assetsDest, { recursive: true });
  const excludedAssets = new Set([
    'gen-bmps.ps1',
    'icon.ico',
    'wizard-large.bmp',
    'wizard-small.bmp',
    'readme_images'
  ]);

  const assetEntries = fs.readdirSync(path.join(rootDir, 'assets'), { withFileTypes: true });
  for (const entry of assetEntries) {
    if (excludedAssets.has(entry.name)) continue;
    const srcAsset = path.join(rootDir, 'assets', entry.name);
    const destAsset = path.join(assetsDest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcAsset, destAsset);
    } else {
      fs.copyFileSync(srcAsset, destAsset);
    }
  }

  console.log('[3/4] Compactando para Aster-Video-Downloader.zip...');
  const psCmd = `powershell -NoProfile -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${zipPath}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });

  console.log('[4/4] Limpando pasta temporária...');
  fs.rmSync(tempDir, { recursive: true, force: true });

  const stats = fs.statSync(zipPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\n🎉 Release gerado com sucesso:`);
  console.log(`   Arquivo: Aster-Video-Downloader.zip (${sizeMB} MB)`);
  console.log(`   Local: ${zipPath}`);
}

main();
