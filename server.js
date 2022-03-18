#!/usr/bin/env node

let net = require('net')
let http = require('http')
let fs = require('fs')

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
  let port = +process.env.PORT
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

async function main() {
  let port = await getPort()
  let server = http.createServer((req, res) => {
    try {
      let now = new Date().toLocaleString()
      console.log(`[${now}]`, req.method, req.url)
      switch (req.method) {
        case 'GET': {
          let file = req.url.replace(/^\//, './')
          if (!fs.existsSync(file)) {
            end(res, 404, `File not found: ${file}`)
            break
          }
          let stat = fs.statSync(file)
          if (stat.isDirectory()) {
            let dir = file
            let files = fs.readdirSync(dir)
            for (let file of files) {
              let href = `${req.url}/${file}`.replace(/^\/\//, '/')
              res.write(`<a href="${href}">${file}</a><br>`)
            }
            res.end()
            break
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
