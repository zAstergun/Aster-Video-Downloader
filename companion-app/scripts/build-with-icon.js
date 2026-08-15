const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

async function main() {
  const rootDir = path.resolve(__dirname, '../..');
  const pngPath = path.join(rootDir, 'assets', 'icon.png');
  const icoPath = path.join(rootDir, 'assets', 'icon.ico');

  console.log('[1/4] Gerando icon.ico a partir de icon.png...');
  const pngToIcoModule = await import('png-to-ico');
  const pngToIco = pngToIcoModule.default || pngToIcoModule;
  const icoBuffer = await pngToIco(pngPath);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('      icon.ico gerado em:', icoPath);

  console.log('[2/4] Preparando base do executável com ícone no cache do pkg...');
  const userHome = os.homedir();
  const pkgCacheDir = path.join(userHome, '.pkg-cache', 'v3.4');
  const fetchedWin = path.join(pkgCacheDir, 'fetched-v18.5.0-win-x64');
  const builtWin = path.join(pkgCacheDir, 'built-v18.5.0-win-x64');
  const fetchedWinBak = path.join(pkgCacheDir, 'fetched-v18.5.0-win-x64.bak');

  if (!fs.existsSync(fetchedWin) && !fs.existsSync(builtWin) && !fs.existsSync(fetchedWinBak)) {
    console.log('      Baixando base do Node 18 via pkg-fetch...');
    execSync('npx pkg-fetch -n node18 -p win -a x64', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
  }

  const sourceExe = fs.existsSync(fetchedWin) ? fetchedWin : (fs.existsSync(fetchedWinBak) ? fetchedWinBak : null);
  
  if (sourceExe) {
    // Sempre re-cria o builtWin a partir do fetched original limpo, e injeta o ícone
    fs.copyFileSync(sourceExe, builtWin);
    const rceditModule = await import('rcedit');
    const rcedit = rceditModule.default || rceditModule.rcedit || rceditModule;

    await rcedit(builtWin, {
      icon: icoPath,
      'version-string': {
        ProductName: 'Aster Video Downloader Companion',
        FileDescription: 'Aster Video Downloader Native Messaging Host',
        CompanyName: 'Aster',
        LegalCopyright: 'Aster Video Downloader'
      }
    });
    console.log('      Ícone e metadados injetados no binário "built" com sucesso.');
  }

  // TRUQUE: Ocultar temporariamente o 'fetched' para forçar o pkg a usar o 'built' (que não tem verificação de hash)
  if (fs.existsSync(fetchedWin)) {
    fs.renameSync(fetchedWin, fetchedWinBak);
  }

  try {
    console.log('[3/4] Compilando executáveis com pkg...');
    execSync('npx pkg .', { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
    console.log('      Build concluído com sucesso!');
  } finally {
    // Restaurar o 'fetched' para não quebrar outros builds
    console.log('[4/4] Restaurando cache do pkg...');
    if (fs.existsSync(fetchedWinBak)) {
      fs.renameSync(fetchedWinBak, fetchedWin);
    }
  }
}

main().catch(err => {
  console.error('Erro durante o build:', err);
  process.exit(1);
});
