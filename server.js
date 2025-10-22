#!/usr/bin/env node

let net = require('net')
let http = require('http')
let fs = require('fs')
let path = require('path')
let os = require('os')

let args = process.argv
let port = +process.env.PORT
let appMode = false

let root = './'
for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  if (arg == '--app') {
    appMode = true
    continue
  }
  port = +arg || port
  if (fs.existsSync(arg)) {
    root = arg
  }
}

let contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.php': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
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
}

function checkPort(port) {
  return new Promise(resolve => {
    let server = net.createServer(socket => {
      socket.end()
    })
    server.on('error', () => {
      server.close()
      resolve('used')
    })
    server.listen(port, () => {
      server.close()
      resolve('not used')
    })
  })
}

async function getPort() {
  if (port) return port
  for (port = 8080; port < 65535; port += 10) {
    let res = await checkPort(port)
    if (res === 'not used') return port
  }
  return 0
}

function end(res, status, content) {
  res.writeHead(status)
  res.write(content)
  res.end()
}

let templatePart1 = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>
`.trim()

let templatePart2 = /* html */ `
  </title>
</head>
<body>
`.trim()

let templatePart3 = /* html */ `
</body>
</html>
`.trim()

function isDirectoryWithIndexFile(dir) {
  let stat = fs.statSync(dir)
  if (stat.isDirectory()) {
    let file = path.join(dir, 'index.html')
    return fs.existsSync(file)
  }
}

function parseNumber(s) {
  if (s.length === 0) return NaN
  if (s[0] === '-') return NaN
  return parseFloat(s.replace('e', ' ').replace('.', ' '))
}

function removeNumberPrefix(s, num) {
  if (num === 0) {
    return s.replace(/^0+/, '')
  }
  return s.replace(/^0+/, '').slice(String(num).length)
}

function countCommonSuffix(a, b) {
  let n = Math.min(a.length, b.length)
  let tail = 0
  for (let i = 0; i < n; i++) {
    if (a[a.length - 1 - i] === b[b.length - 1 - i]) {
      tail++
    } else {
      break
    }
  }
  return tail
}

function countCommonPrefix(a, b) {
  let n = Math.min(a.length, b.length)
  let prefix = 0
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) {
      prefix++
    } else {
      break
    }
  }
  return prefix
}

function prettyCompare(a, b) {
  let suffix = countCommonSuffix(a, b)
  a = a.substring(0, a.length - suffix)
  b = b.substring(0, b.length - suffix)

  for (;;) {
    let prefix = countCommonPrefix(a, b)
    a = a.substring(prefix)
    b = b.substring(prefix)

    let aNum = parseNumber(a)
    let bNum = parseNumber(b)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum < bNum) return -1
      if (aNum > bNum) return 1
      a = removeNumberPrefix(a, aNum)
      b = removeNumberPrefix(b, bNum)
      continue
    }
    return a < b ? -1 : a > b ? 1 : 0
  }
}

async function main() {
  let port = await getPort()
  let server = http.createServer((req, res) => {
    try {
      let now = new Date().toLocaleString()
      console.log(`[${now}]`, req.method, req.url)
      switch (req.method) {
        case 'HEAD':
        case 'GET': {
          let url = decodeURIComponent(req.url)
          let filename = url.replace(/^\//, './')
          let file = path.join(root, filename)
          // fallback to use pathname (without search query) if file not found
          if (!fs.existsSync(file) && filename.includes('?')) {
            url = decodeURIComponent(new URL('http://host' + req.url).pathname)
            filename = url.replace(/^\//, './')
            file = path.join(root, filename)
          }
          if (path.relative(root, file).startsWith('..')) {
            end(res, 404, `Escape above root: ${filename}`)
            break
          }
          if (
            appMode &&
            !filename.endsWith('.html') &&
            fs.existsSync(file) &&
            isDirectoryWithIndexFile(file)
          ) {
            filename = 'index.html'
            file = path.join(file, filename)
          }
          if (!fs.existsSync(file)) {
            if (appMode) {
              filename = 'index.html'
              file = path.join(root, filename)
            } else {
              end(res, 404, `File not found: ${file}`)
              break
            }
          }
          let stat = fs.statSync(file)
          if (stat.isDirectory()) {
            let dir = file
            let files = fs.readdirSync(dir)
            files.sort(prettyCompare)
            res.setHeader('Content-Type', 'text/html')
            res.write(templatePart1)
            res.write(path.basename(filename))
            res.write(templatePart2)
            for (let file of files) {
              let href = `${url}/${file}`.replace(/^\/\//, '/')
              href = encodeURI(href)
              let text = file
                .replace(/&/g, '&amp')
                .replace(/</g, '&lt')
                .replace(/>/g, '&gt')
              let stat = fs.statSync(path.join(dir, file))
              let type = stat.isDirectory() ? 'D' : 'F'
              res.write(`[${type}] <a href="${href}">${text}</a><br>`)
            }
            if (files.length === 0) {
              res.write(`[empty directory]`)
            }
            res.write(templatePart3)
            res.end()
            break
          }
          res.setHeader('Content-Length', stat.size)
          res.setHeader('Last-Modified', stat.mtime.toUTCString())
          res.setHeader('ETag', `W/${stat.mtime.getTime()}`)
          let ext = path.extname(filename)
          let contentType = contentTypes[ext]
          if (contentType) {
            res.setHeader('Content-Type', contentType)
          }
          if (req.method === 'HEAD') {
            res.end()
          } else {
            fs.createReadStream(file).pipe(res)
          }
          break
        }
        default: {
          res.writeHead(405)
          res.write(`unknown method: ${req.method}`)
          res.end()
        }
      }
    } catch (error) {
      end(res, 500, String(error))
    }
  })
  server.listen(port, () => {
    port = port || server.address().port
    console.log(`listening on http://localhost:${port}`)
    Object.entries(os.networkInterfaces()).forEach(([name, addresses]) => {
      addresses.forEach(address => {
        let host = address.address
        if (host.includes(':')) host = `[${host}]`
        console.log(`listening on http://${host}:${port} (${name})`)
      })
    })
  })
}

main()
