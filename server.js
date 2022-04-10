#!/usr/bin/env node

let net = require('net')
let http = require('http')
let fs = require('fs')
let path = require('path')

let args = process.argv
let port = +process.env.PORT

let root = './'
for (let i = 2; i < args.length; i++) {
  let arg = args[i]
  port = +arg || port
  if (fs.existsSync(arg)) {
    root = arg
  }
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

async function main() {
  let port = await getPort()
  let server = http.createServer((req, res) => {
    try {
      let now = new Date().toLocaleString()
      console.log(`[${now}]`, req.method, req.url)
      switch (req.method) {
        case 'GET': {
          let filename = decodeURIComponent(req.url).replace(/^\//, './')
          let file = path.join(root, filename)
          if (!fs.existsSync(file)) {
            end(res, 404, `File not found: ${file}`)
            break
          }
          let stat = fs.statSync(file)
          if (stat.isDirectory()) {
            let dir = file
            let files = fs.readdirSync(dir)
            res.setHeader('Content-Type', 'text/html')
            res.write(templatePart1)
            res.write(path.basename(filename))
            res.write(templatePart2)
            for (let file of files) {
              let href = `${req.url}/${file}`.replace(/^\/\//, '/')
              let stat = fs.statSync(path.join(dir, file))
              let type = stat.isDirectory() ? 'D' : 'F'
              res.write(`[${type}] <a href="${href}">${file}</a><br>`)
            }
            if (files.length === 0) {
              res.write(`[empty directory]`)
            }
            res.write(templatePart3)
            res.end()
            break
          }
          if (file.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html')
          } else if (file.endsWith('.js')) {
            res.setHeader('Content-Type', 'text/javascript')
          } else if (file.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css')
          } else if (file.endsWith('.csv')) {
            res.setHeader('Content-Type', 'text/csv')
          } else if (file.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json')
          }
          fs.createReadStream(file).pipe(res)
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
  })
}

main()
