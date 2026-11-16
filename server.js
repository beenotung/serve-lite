#!/usr/bin/env node

let net = require('net')
let http = require('http')
let fs = require('fs')
let path = require('path')
let os = require('os')
let { spawn } = require('child_process')

let args = process.argv
let port = +process.env.PORT
let appMode = false
let openBrowser = null
// corsOrigins is an allowlist of origins; '*' (from the bare --cors) allows any
let corsOrigins = []
let corsPna = false
let symlinkScope = 'inside'

let root = './'
for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  if (arg == '--app') {
    appMode = true
    continue
  }
  if (arg.startsWith('--open=')) {
    openBrowser = arg.substring('--open='.length)
    continue
  }
  if (arg == '--cors') {
    corsOrigins.push('*')
    continue
  }
  if (arg.startsWith('--cors=')) {
    corsOrigins.push(arg.substring('--cors='.length))
    continue
  }
  if (arg == '--cors-private-network') {
    corsPna = true
    continue
  }
  // A bare --symlink and any value other than inside/outside are usage
  // errors: a typo must not quietly fall back to a different scope than the
  // one asked for.
  if (arg == '--symlink' || arg.startsWith('--symlink=')) {
    // the bare form has no value, so it is '' and reaches the usage error
    let value = arg.substring('--symlink='.length)
    if (value !== 'inside' && value !== 'outside') {
      console.error('usage: --symlink accepts inside (default) or outside')
      process.exit(1)
    }
    symlinkScope = value
    continue
  }
  port = +arg || port
  if (fs.existsSync(arg)) {
    root = arg
  }
}

// Resolved once: every request is compared against it, so a symlink cannot
// make a path look like it is inside the root when its target is not.
let realRoot = fs.realpathSync(root)

if (corsPna && corsOrigins.length === 0) {
  console.error(
    'warning: --cors-private-network has no effect without --cors; ignoring it',
  )
  corsPna = false
}

// serving a target outside the root is a permission, not a detail, so say so on
// every start: the operator may not be the one who passed the flag; realRoot
// rather than root, because that is the boundary the guard enforces
if (symlinkScope === 'outside') {
  console.log(`symlinks outside ${realRoot} are served`)
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

// CORS and Private Network Access (PNA) are one feature, not three: Chrome
// only grants a public origin access to a private-network address after a
// successful preflight, so PNA needs OPTIONS handling *and* an
// Access-Control-Allow-Origin reply. A --cors that only echoed Allow-Origin
// would still fail that preflight, hence --cors-private-network implies both.
function setCorsHeaders(req, res) {
  if (corsOrigins.length === 0) return
  let origin = req.headers.origin
  if (corsOrigins.includes('*')) {
    // unsafe by design: any website can read responses from this server
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else {
    // The response is selected based on Origin, so caches must key on it --
    // including for rejected origins, which would otherwise poison the cache
    // with a response that lacks Access-Control-Allow-Origin.
    res.setHeader('Vary', 'Origin')
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
  }
  // Only echo the private-network grant when the preflight actually asked for
  // it, otherwise a public page would be told it has private access.
  if (
    corsPna &&
    req.headers['access-control-request-private-network'] === 'true'
  ) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
}

function end(res, status, content) {
  res.writeHead(status)
  res.write(content)
  res.end()
}

// '..' alone is the parent of the directory itself, the separator is what
// keeps a name that merely starts with '..' (e.g. '..dots.txt') inside it
function isAbove(base, target) {
  let rel = path.relative(base, target)
  return rel === '..' || rel.startsWith('..' + path.sep)
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
  <style>
    @media (prefers-color-scheme: dark) {
      body {
        background-color: #1a1a1a;
        color: #ffffff;
      }
      a {
        color: #6ba3ff;
      }
      a:visited {
        color: #d4a5ff;
      }
    }
  </style>
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

// The comparison is vendored from pretty-sort (src/index.ts). Its for(;;) walk
// had a fixed point on '.0' and ' 0.' (both parse to 0, neither starts with
// '0', so nothing was stripped) and never returned; a key per name makes the
// comparison a pure function of its arguments, so the order is total.

// The extension is split off first so that a shared suffix does not decide the
// order of the versions above it: '1.0.10.txt' sorts by '1.0.10', not by '.txt'.
// A leading dot belongs to the stem, it marks a dotfile ('.bashrc') instead of
// starting an extension.
function parseSortKey(name) {
  let dot = name.lastIndexOf('.')
  // -1 is a name without an extension, 0 is a dotfile like '.bashrc'
  if (dot < 1) dot = name.length
  return {
    stem: splitRuns(name.substring(0, dot)),
    ext: splitRuns(name.substring(dot)),
  }
}

// split one part into numeric and non-numeric runs: 'file10' -> [file, 10]
function splitRuns(part) {
  let runs = []
  let i = 0
  while (i < part.length) {
    let digit = part[i] >= '0' && part[i] <= '9'
    let end = i + 1
    while (end < part.length) {
      if ((part[end] >= '0' && part[end] <= '9') !== digit) break
      end++
    }
    let text = part.substring(i, end)
    runs.push(digit ? { num: +text, text } : { text })
    i = end
  }
  return runs
}

function compareRun(a, b) {
  // runs of digits compare by value, so file2 comes before file10
  if (a.num !== undefined && b.num !== undefined && a.num !== b.num) {
    return a.num < b.num ? -1 : 1
  }
  // a digit run next to a word, or two equal numbers ('1' and '01'), compare by
  // their characters, which keeps '.hidden' and 'A.txt' where they were
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0
}

function compareRuns(a, b) {
  let n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    let diff = compareRun(a[i], b[i])
    if (diff !== 0) return diff
  }
  // '1' and '1.0' share the prefix, the shorter key comes first
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0
}

function prettyCompare(a, b) {
  if (a === b) return 0
  let aKey = parseSortKey(a)
  let bKey = parseSortKey(b)
  let diff = compareRuns(aKey.stem, bKey.stem)
  if (diff !== 0) return diff
  diff = compareRuns(aKey.ext, bKey.ext)
  if (diff !== 0) return diff
  // the runs spell the name out, so only the same name reaches this line
  return 0
}

function statToType(stat) {
  if (stat.isDirectory()) return 'D'
  if (stat.isFile()) return 'F'
  if (stat.isSymbolicLink()) return 'L'
  if (stat.isCharacterDevice()) return 'C'
  if (stat.isBlockDevice()) return 'B'
  if (stat.isFIFO()) return 'P'
  if (stat.isSocket()) return 'S'
}

async function main() {
  let port = await getPort()
  let server = http.createServer((req, res) => {
    setCorsHeaders(req, res)
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
          // The target, not the requested path, decides the scope: a symlink
          // inside the root that points outside it passes a check on the
          // unresolved path and would be served. A dangling link has no target
          // to resolve (realpathSync throws), and it must stay a plain "File
          // not found", so only an existing file is resolved.
          let traversal = isAbove(root, file)
          let outside =
            fs.existsSync(file) && isAbove(realRoot, fs.realpathSync(file))
          // --symlink=outside relaxes only the resolved target; a literal '..'
          // in the url is still a traversal attempt, so it stays refused.
          if (traversal || (outside && symlinkScope !== 'outside')) {
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
              href = encodeURI(href).replaceAll('#', '%23').replaceAll('&', '&amp;')
              let text = file
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
              let filePath = path.join(dir, file)
              // lstat is the only way to know an entry is a link, and it is
              // the only syscall a regular entry costs: the stat and realpath
              // below are paid by links alone, so a large directory adds no
              // calls compared to the stat this replaces.
              let type = '?'
              try {
                type = statToType(fs.lstatSync(filePath))
              } catch (err) {
                // the entry vanished between readdir and here
              }
              if (type === 'L') {
                // the target is written into the page too, so escape it like
                // the name: '&' or '<' would otherwise start an entity or tag
                let target = fs
                  .readlinkSync(filePath)
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                try {
                  // a link is listed as what it resolves to, unless the target
                  // is outside the root and that target is refused
                  type = statToType(fs.statSync(filePath))
                  if (
                    symlinkScope !== 'outside' &&
                    isAbove(realRoot, fs.realpathSync(filePath))
                  ) {
                    type = 'L'
                    text = `${text} → ${target} (outside root)`
                  }
                } catch (err) {
                  // the target is gone: it is a dangling link, not a file
                  type = 'L'
                  text = `${text} → ${target} (broken symlink)`
                }
              }
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
            // The file can pass the checks above and still fail to open
            // (chmod 000, removed in between, EACCES on a network mount).
            // An unhandled 'error' here would kill the whole server, so answer
            // with a 500 when the headers are still ours to send.
            let stream = fs.createReadStream(file)
            stream.on('error', error => {
              if (res.headersSent) {
                res.destroy()
                return
              }
              // the length of the file never sent would truncate the reply
              res.removeHeader('Content-Length')
              end(res, 500, String(error))
            })
            stream.pipe(res)
          }
          break
        }
        case 'OPTIONS': {
          // Handled only when CORS is enabled; otherwise fall through to the
          // 405 reply below, keeping the default behaviour unchanged.
          if (corsOrigins.length > 0) {
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
            res.setHeader(
              'Access-Control-Allow-Headers',
              req.headers['access-control-request-headers'] || 'Content-Type',
            )
            res.setHeader('Access-Control-Max-Age', '600')
            res.writeHead(204)
            res.end()
            break
          }
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
    if (openBrowser) {
      let url = `http://localhost:${port}`
      spawn(openBrowser, [url], { detached: true, stdio: 'ignore' })
    }
  })
}

main()
