let test = require('node:test')
let assert = require('assert')
let fs = require('fs')
let http = require('http')
let os = require('os')
let path = require('path')
let { spawn } = require('child_process')
let { once } = require('events')

let serverFile = path.join(__dirname, '..', 'server.js')
let port = 18471
let ampName = 'amp&lt;x&copy.txt'
let tmp, root, child, url

// the cli takes the port and the root as plain arguments and prints one banner
// per address on start; the localhost line is the one worth waiting for
function launch(port, dir, extraArgs = []) {
  let child = spawn(
    process.execPath,
    [serverFile, String(port), dir, ...extraArgs],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let err = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => (err += chunk))
  return new Promise((resolve, reject) => {
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      out += chunk
      if (out.includes('listening on http://localhost:')) resolve(child)
    })
    // a taken port is the likeliest failure here, so keep its stderr in the message
    child.on('exit', code =>
      reject(Error(`server exited with code ${code}: ${err.trim()}`)),
    )
  })
}

// fetch (like curl without --path-as-is) resolves the dots away, so the
// traversal case has to ask with http.request to reach the guard at all
function rawGet(requestPath) {
  let opt = { host: 'localhost', port, path: requestPath }
  return new Promise((resolve, reject) => {
    let req = http.request(opt, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

let getText = url => fetch(url).then(res => res.text())

// the listing writes one anchor per entry, in the sorted order
let anchorTexts = html =>
  [...html.matchAll(/<a href="[^"]*">([^<]*)<\/a>/g)].map(match => match[1])

test.before(async () => {
  // one copy of the sample root holds every case; the entries git cannot keep
  // (a dangling symlink here, mode 000 below) are made in the copy
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-lite-'))
  root = path.join(tmp, 'root')
  fs.cpSync(path.join(__dirname, 'fixtures'), root, { recursive: true })
  fs.symlinkSync('missing-target', path.join(root, 'broken-link'))
  // the target is written into the listing too, so it needs the same escaping
  fs.symlinkSync('no&such<file', path.join(root, 'broken-amp-link'))
  // the parent holds a file that only a missing guard would serve
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"name": "outside"}\n')
  // one link resolves inside the root, the other through it
  fs.symlinkSync('hello.txt', path.join(root, 'inside-link'))
  fs.symlinkSync(path.join(tmp, 'package.json'), path.join(root, 'outside-link'))
  // a name that starts with two dots is a plain file, not the parent folder
  fs.writeFileSync(path.join(root, '..dots.txt'), 'a name starting with dots\n')
  // passes existsSync and statSync but cannot be opened (root ignores the mode)
  let secret = path.join(root, 'secret.txt')
  fs.copyFileSync(path.join(root, 'hello.txt'), secret)
  fs.chmodSync(secret, 0o000)
  child = await launch(port, root)
  url = `http://localhost:${port}`
})

test.after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    // SIGTERM is async: the next run would bind into a port this one still
    // holds, so wait for the exit before the temp folder goes away
    let exited = once(child, 'exit')
    child.kill()
    await exited
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

for (let [file, body] of [
  ['hello.txt', 'hello from the fixture root\n'],
  ['sub/inner.txt', 'inner file of the sub folder\n'],
  ['with space.txt', 'the name has a space\n'],
  [ampName, 'the name has an ampersand\n'],
]) {
  test(`GET /${file} serves it`, async () => {
    let res = await fetch(url + '/' + encodeURI(file))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.equal(await res.text(), body)
  })
}

// encodeURI leaves '&' alone in the href, so the browser would read '&lt;'
// and '&copy' as character references, request a different name and get a 404.
// The listing escapes '&' in the href as well now, so this guards that.
test('the listing escapes & in the href', async () => {
  let listing = await getText(url + '/')
  let href = '/' + ampName.replace(/&/g, '&amp;')
  assert.ok(listing.includes(`href="${href}"`), `expected href="${href}"`)
})

// The visible text escapes '&', '<' and '>' as entities, so no tag reaches
// the page whatever the file is called.
test('the listing escapes < and > in the visible text', async () => {
  let listing = await getText(url + '/')
  let name = 'q"uote<script>.txt'
  // the escaped form is written out rather than computed: rebuilding it with
  // the same replace chain would let a wrong escaping pass its own test
  assert.ok(listing.includes('q"uote&lt;script&gt;.txt'), 'the name is shown escaped')
  assert.ok(!listing.includes('<script'), 'no tag from a file name reaches the page')
  assert.ok(!listing.includes(name), 'the raw name never reaches the page')
})

test('the listing marks a dangling symlink', async () => {
  let listing = await getText(url + '/')
  assert.ok(
    listing.includes(
      '[L] <a href="/broken-link">broken-link → missing-target (broken symlink)</a>',
    ),
  )
})

// The link target is written into the page as well, so a raw '&' would be read
// as an entity and a raw '<' as the start of a tag.
test('the listing escapes & and < in a symlink target', async () => {
  let listing = await getText(url + '/')
  assert.ok(listing.includes('broken-amp-link → no&amp;such&lt;file (broken symlink)'))
  assert.ok(!listing.includes('no&such'), 'the raw target never reaches the page')
})

test('a path above the root is rejected', async () => {
  let res = await rawGet('/../package.json')
  assert.equal(res.status, 404)
  assert.match(res.body, /Escape above root/)
})

test('a symlink to a file inside the root is served', async () => {
  let res = await fetch(url + '/inside-link')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'hello from the fixture root\n')
  // it resolves inside the root, so the listing shows the file it is, not a
  // link with a target to explain
  let listing = await getText(url + '/')
  assert.ok(listing.includes('[F] <a href="/inside-link">inside-link</a>'))
})

// the link itself lives inside the root, so only the resolved target shows
// that it leaves it -- the guard compared the unresolved path and served it
test('a symlink to a file outside the root is refused', async () => {
  let res = await fetch(url + '/outside-link')
  assert.equal(res.status, 404)
  assert.match(await res.text(), /Escape above root/)
  // the listing must not offer a path the next request would refuse
  let listing = await getText(url + '/')
  assert.match(
    listing,
    /\[L\] <a href="\/outside-link">outside-link → [^<]* \(outside root\)<\/a>/,
  )
})

test('--symlink=outside serves a symlink outside the root', async () => {
  let allowedPort = port + 2
  let allowed = await launch(allowedPort, root, ['--symlink=outside'])
  try {
    let res = await fetch(`http://localhost:${allowedPort}/outside-link`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), '{"name": "outside"}\n')
    // servable now, so the listing shows it like the file it points at
    let listing = await getText(`http://localhost:${allowedPort}/`)
    assert.ok(listing.includes('[F] <a href="/outside-link">outside-link</a>'))
    assert.ok(!listing.includes('(outside root)'))
  } finally {
    let exited = once(allowed, 'exit')
    allowed.kill()
    await exited
  }
})

// --symlink=inside names the default, so it is accepted and refuses the same
// target the default refuses
test('--symlink=inside refuses a symlink outside the root', async () => {
  let insidePort = port + 4
  let inside = await launch(insidePort, root, ['--symlink=inside'])
  try {
    let res = await fetch(`http://localhost:${insidePort}/outside-link`)
    assert.equal(res.status, 404)
    assert.match(await res.text(), /Escape above root/)
  } finally {
    let exited = once(inside, 'exit')
    inside.kill()
    await exited
  }
})

// Regression test for the false positive: the old guard refused any name that
// started with '..', though only the parent folder itself is out of scope.
test('a name that starts with two dots is served', async () => {
  let res = await fetch(url + '/..dots.txt')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'a name starting with dots\n')
})

// the flag has exactly two values; a typo must fail instead of silently
// serving a different scope than the one asked for
test('an unknown --symlink value is a usage error', async () => {
  let child = spawn(
    process.execPath,
    [serverFile, String(port + 3), root, '--symlink=nope'],
    // a value that is wrongly accepted leaves a server running, so bound it
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 3000 },
  )
  let err = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => (err += chunk))
  let [code] = await once(child, 'exit')
  assert.notEqual(code, 0)
  assert.match(err, /--symlink accepts inside \(default\) or outside/)
})

// The '.0' and ' 0.' pair lives in hang/ on purpose: the old prefix/suffix walk
// reached a fixed point there (both parse to 0, neither starts with '0', so
// nothing was stripped) and never returned, so the listing never answered and
// the whole server stopped answering.
test('the listing sorts names by number, including .0 and " 0."', async () => {
  let hang = await launch(port + 1, path.join(root, 'hang'))
  let hangUrl = `http://localhost:${port + 1}/`
  let listing = fetch(hangUrl)
    .then(res => res.text())
    .catch(() => 'aborted')
  let timer
  let wait = new Promise(resolve => {
    timer = setTimeout(resolve, 2000, 'timeout')
  })
  try {
    let body = await Promise.race([listing, wait])
    assert.notEqual(body, 'timeout')
    // ' ' sorts before '.', so the pair comes out in that order
    assert.deepEqual(anchorTexts(body), [' 0.', '.0'])
  } finally {
    // the losing side of the race must not hold the event loop open for 2s
    clearTimeout(timer)
    // kill outright: a blocked loop cannot be relied on to run the default
    // signal handler
    let exited = once(hang, 'exit')
    hang.kill('SIGKILL')
    await exited
  }

  // one sequence covers numeric and version order at once: a digit run compares
  // by value (file2 before file10) and a version by its stem first (1.0.10
  // before 1.0.11); the plain string order would put file10 before file2
  let order = await getText(url + '/order/')
  let names = [...order.matchAll(/<a href="([^"]*)"/g)].map(match =>
    match[1].split('/').pop(),
  )
  assert.equal(names.join(' '), '1.0.10 1.0.11 file2 file10')
})

// Regression test for the unhandled read stream 'error': a file that passes
// existsSync and statSync but cannot be opened used to kill the whole process
// with one request. Root ignores the file mode, so the case is skipped there.
test('an unreadable file answers 500 and leaves the server alive', async t => {
  if (process.getuid?.() === 0) return t.skip('root ignores file permissions')
  let res = await fetch(url + '/secret.txt')
  assert.equal(res.status, 500)
  assert.match(await res.text(), /EACCES|permission denied/)
  // the point of the fix: the process survived, so the next request is served
  let next = await fetch(url + '/hello.txt')
  assert.equal(next.status, 200)
  assert.equal(await next.text(), 'hello from the fixture root\n')
  assert.equal(child.exitCode, null, 'the server is still running')
})
