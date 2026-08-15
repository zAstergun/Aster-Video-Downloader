const path = require('path');
const fs = require('fs');

function getBinCandidates() {
  const candidates = [];
  if (process.pkg) {
    const exeDir = path.dirname(process.execPath);
    candidates.push(path.join(exeDir, 'bin'));
    candidates.push(path.join(exeDir, '..', 'bin'));
  }
  candidates.push(path.join(__dirname, '..', 'bin'));
  candidates.push(path.join(process.cwd(), 'bin'));
  
  return Array.from(new Set(candidates));
}

function getBinFolder() {
  const candidates = getBinCandidates();
  
  // 1. Prioritize folder that already contains binaries
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      const hasBinaries = fs.existsSync(path.join(dir, 'yt-dlp.exe')) ||
                          fs.existsSync(path.join(dir, 'yt-dlp')) ||
                          fs.existsSync(path.join(dir, 'ffmpeg.exe')) ||
                          fs.existsSync(path.join(dir, 'ffmpeg'));
      if (hasBinaries) {
        return dir;
      }
    }
  }

  // 2. Prioritize folder that exists as a directory
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  // 3. Fallback to default
  return candidates[0] || path.join(__dirname, '..', 'bin');
}

module.exports = { getBinFolder, getBinCandidates };

