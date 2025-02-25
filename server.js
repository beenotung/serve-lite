#!/usr/bin/env node

const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv;
let port = +process.env.PORT;
let appMode = false;

let root = './';
for (let i = 2; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--app') {
    appMode = true;
    continue;
  }
  port = +arg || port;
  if (fs.existsSync(arg)) {
    root = arg;
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.php': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.md': 'text/plain',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/plain',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.avi': 'video/x-msvideo',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.oga': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.opus': 'audio/opus',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.epub': 'application/epub+zip',
};

function checkPort(port) {
  return new Promise(resolve => {
    const server = net.createServer(socket => {
      socket.end();
    });
    server.on('error', () => {
      server.close();
      resolve('used');
    });
    server.listen(port, () => {
      server.close();
      resolve('not used');
    });
  });
}

async function getPort() {
  if (port) return port;
  for (port = 8080; port < 65535; port += 10) {
    const res = await checkPort(port);
    if (res === 'not used') return port;
  }
  return 0;
}

function end(res, status, content) {
  res.writeHead(status);
  res.write(content);
  res.end();
}

const templatePart1 = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>`;

const templatePart2 = `</title>
</head>
<body>`;

const templatePart3 = `</body>
</html>`;

function isDirectoryWithIndexFile(dir) {
  const stat = fs.statSync(dir);
  if (stat.isDirectory()) {
    const file = path.join(dir, 'index.html');
    return fs.existsSync(file);
  }
}

async function main() {
  const port = await getPort();
  const server = http.createServer((req, res) => {
    try {
      const now = new Date().toLocaleString();
      console.log(`[${now}]`, req.method, req.url);
      switch (req.method) {
        case 'GET': {
          let url = decodeURIComponent(req.url);
          let filename = url.replace(/^\//, './');
          let file = path.join(root, filename);
          if (!fs.existsSync(file) && filename.includes('?')) {
            url = decodeURIComponent(new URL('http://host' + req.url).pathname);
            filename = url.replace(/^\//, './');
            file = path.join(root, filename);
          }
          if (path.relative(root, file).startsWith('..')) {
            end(res, 404, `Escape above root: ${filename}`);
            break;
          }
          if (
            appMode &&
            !filename.endsWith('.html') &&
            fs.existsSync(file) &&
            isDirectoryWithIndexFile(file)
          ) {
            filename = 'index.html';
            file = path.join(file, filename);
          }
          if (!fs.existsSync(file)) {
            if (appMode) {
              filename = 'index.html';
              file = path.join(root, filename);
            } else {
              end(res, 404, `File not found: ${file}`);
              break;
            }
          }
          const stat = fs.statSync(file);
          if (stat.isDirectory()) {
            const dir = file;
            const files = fs.readdirSync(dir);
            res.setHeader('Content-Type', 'text/html');
            res.write(templatePart1);
            res.write(path.basename(filename));
            res.write(templatePart2);
            for (const file of files) {
              let href = `${url}/${file}`.replace(/^\/\//, '/');
              href = encodeURI(href);
              const text = file
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              const stat = fs.statSync(path.join(dir, file));
              const type = stat.isDirectory() ? 'D' : 'F';
              res.write(`[${type}] <a href="${href}">${text}</a><br>`);
            }
            if (files.length === 0) {
              res.write(`[empty directory]`);
            }
            res.write(templatePart3);
            res.end();
            break;
          }
          const ext = path.extname(filename);
          const contentType = contentTypes[ext];
          if (contentType) {
            res.setHeader('Content-Type', contentType);
          }
          fs.createReadStream(file).pipe(res);
          break;
        }
        default: {
          res.writeHead(405);
          res.write(`unknown method: ${req.method}`);
          res.end();
        }
      }
    } catch (error) {
      end(res, 500, String(error));
    }
  });
  server.listen(port, () => {
    const actualPort = port || server.address().port;
    console.log(`listening on http://localhost:${actualPort}`);
    Object.entries(os.networkInterfaces()).forEach(([name, addresses]) => {
      addresses.forEach(address => {
        let host = address.address;
        if (host.includes(':')) host = `[${host}]`;
        console.log(`listening on http://${host}:${actualPort} (${name})`);
      });
    });
  });
}

main();