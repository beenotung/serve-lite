# serve-lite

a lightweight http-server for static file-based web development

[![npm Package Version](https://img.shields.io/npm/v/serve-lite.svg?maxAge=2592000)](https://www.npmjs.com/package/serve-lite)

single js file (9 kB) · npm pkg 5 kB compressed

## Features

- zero dependencies
- zero code: launch from cli with npx
- support SPA (client-side routing) with (`--app` argument)
- auto open browser with (`--open=<browser>` argument)
- shows all network interface URLs for local network access
- dark mode support (follows system preference)
- smart numeric file sorting: numeric runs compare by value, so `file2` before `file10` and `1.0.10` before `1.0.11`
- supports various media formats (video/audio viewing in browser)
- UTF-8 charset support for text files (markdown, txt, etc.)
- HEAD method support (check file size and last modified time)
- CORS support with an origin allowlist (`--cors=<origin>`), or any origin (`--cors`, unsafe)
- Private Network Access (PNA) preflight support (`--cors-private-network`)
- refuses symlinks whose target is outside the root (`--symlink=outside` to allow them)

## Usage

```bash
npx serve-lite [options] [port] [rootDir]
```

### Options

| Option | What it does |
| --- | --- |
| `--app` | serve `index.html` for client-side routing when the requested path is not a file |
| `--open=<browser>` | open the server URL in `<browser>` after the server starts |
| `--cors[=<origin>]` | allow cross-origin reads from `<origin>`, repeatable; bare `--cors` allows any origin (unsafe) |
| `--cors-private-network` | answer the Private Network Access preflight, for a public page that calls this server; needs `--cors` |
| `--symlink=<scope>` | `inside` (default) refuses a symlink whose target is outside the root, `outside` allows it; any other value, or a bare `--symlink`, is a usage error |
| `[port]` | port to listen on; defaults to `$PORT`, else the first free port from 8080 |
| `[rootDir]` | directory to serve; defaults to the current directory |

### Usage Example

```bash
# listen on port 8100 and using ./public as root directory
npx serve-lite 8100 public

# the order can be flipped so you don't need to remember
npx serve-lite public 8100

# auto find available port from 8080 to 65530
npx serve-lite public

# serve react build directory with client-side routing
npx serve-lite --app build

# auto open browser after starting server
npx serve-lite --open=firefox public

# by default use current working directory as root directory
npx serve-lite

# allow cross-origin reads from one origin, with PNA preflight support
npx serve-lite --cors=https://portal.feelingss.ai --cors-private-network 8100 public

# allow any origin — unsafe: every website the visitor opens can read this server
npx serve-lite --cors public

# serve a symlink that points outside the root directory
npx serve-lite --symlink=outside 8100 public
```

### Notes

- Bare `--cors` allows any origin, so every website the user visits can read responses from this server. Pass an origin where possible (`--cors=https://app.example.com`), and repeat the flag for several origins.
- `--cors-private-network` answers Chrome's Private Network Access preflight with `Access-Control-Allow-Private-Network: true`, for a public page that calls this address; it needs `--cors` to have any effect.
- A symlink is resolved before it is served, so "outside the root" refers to where it finally points, not where the link sits.
- A link inside the root that points outside it is refused in the default scope, which `--symlink=inside` spells out (`404 Escape above root`). `--symlink=outside` allows it and prints `symlinks outside <root> are served` at startup, with `<root>` resolved so the line names the boundary actually enforced. An out-of-scope link is listed as `[L] … (outside root)`, so the listing does not offer a path the server refuses.
- A dangling symlink has no target to resolve: a directory listing marks it as a broken symlink, and requesting it answers `404 File not found`.
- `--symlink` takes `inside` or `outside`; any other value, or a bare `--symlink`, is a usage error.

### Sample output

```
listening on http://localhost:8100
listening on http://192.168.1.100:8100 (eth0)
```

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
