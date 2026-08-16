const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function getIsccPath() {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe')
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  
  try {
    execSync('iscc /?', { stdio: 'ignore' });
    return 'iscc';
  } catch (e) {
    if (e.status !== undefined && e.code !== 'ENOENT') {
      return 'iscc';
    }
  }
  return null;
}

function ensureInnoSetup() {
  let iscc = getIsccPath();
  if (iscc) return iscc;

  console.log('Inno Setup não encontrado. Tentando instalar via winget...');
  try {
    execSync(
      'winget install JRSoftware.InnoSetup --silent --accept-package-agreements --accept-source-agreements',
      { stdio: 'inherit' }
    );
    iscc = getIsccPath();
    if (iscc) return iscc;
    
    console.error('Inno Setup foi instalado, mas ISCC.exe não foi encontrado nos caminhos padrões.');
    process.exit(1);
  } catch (err) {
    console.error('Não foi possível instalar o Inno Setup automaticamente (provavelmente por causa de um prompt de UAC).');
    console.error('Instale manualmente em https://jrsoftware.org/isinfo.php e rode o build novamente.');
    process.exit(1);
  }
}

function prepareManifest() {
  const rootManifestPath = path.resolve(__dirname, '../host-manifest.json');
  const distManifestPath = path.resolve(__dirname, '../dist/host-manifest.json');
  
  if (!fs.existsSync(rootManifestPath)) {
    console.error('host-manifest.json original não encontrado na raiz.');
    process.exit(1);
  }

  const distDir = path.resolve(__dirname, '../dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const manifest = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'));
  manifest.path = 'aster-companion-app-win.exe';

  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('host-manifest.json modificado copiado para dist/');
}

function main() {
  const exePath = path.resolve(__dirname, '../dist/aster-companion-app-win.exe');
  if (!fs.existsSync(exePath)) {
    console.error('aster-companion-app-win.exe não encontrado. Rode "npm run build" e depois "npm run build:pkg" antes de rodar este script.');
    process.exit(1);
  }

  const isccPath = ensureInnoSetup();
  prepareManifest();

  const issPath = path.resolve(__dirname, '../installer/aster-setup.iss');
  console.log('Compilando instalador com Inno Setup usando:', isccPath);
  execSync(`"${isccPath}" "${issPath}"`, { stdio: 'inherit' });
  console.log('Instalador gerado na raiz do projeto: Aster Companion Setup.exe');
}

main();
