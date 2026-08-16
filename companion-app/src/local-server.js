const http = require('http');
const fs = require('fs');
const path = require('path');

let server = null;
let port = 0;
const fileMap = new Map();

function startServer() {
  return new Promise((resolve, reject) => {
    if (server) {
      return resolve(port);
    }
    
    server = http.createServer((req, res) => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const token = urlObj.searchParams.get('token');
        
        if (!token || !fileMap.has(token)) {
          res.writeHead(403);
          res.end('Forbidden or Invalid Token');
          return;
        }
        
        const filePath = fileMap.get(token);
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('File Not Found');
          return;
        }
        
        const stat = fs.statSync(filePath);
        const fileName = path.basename(filePath);
        
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': stat.size,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`
        });
        
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    
    server.on('error', (err) => {
      reject(err);
    });
    
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve(port);
    });
  });
}

async function registerFile(filePath) {
  const currentPort = await startServer();
  const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  fileMap.set(token, filePath);
  return `http://127.0.0.1:${currentPort}/download?token=${token}`;
}

function unregisterFile(token) {
  fileMap.delete(token);
}

module.exports = {
  registerFile,
  unregisterFile
};
