# serve-lite

a lightweight http-server for static file-based web development

[![npm Package Version](https://img.shields.io/npm/v/serve-lite.svg?maxAge=2592000)](https://www.npmjs.com/package/serve-lite)

## Features

- zero dependencies
- zero code: launch from cli with npx

## Usage

```bash
npx serve-lite [port] [rootDir]
```

The port and rootDir are optionals

### Usage Example

```bash
# listen on port 8100 and using ./public as root directory
npx serve-lite 8100 public

# the order can be flipped so you don't need to remember
npx serve-lite public 8100

# auto find available port from 8080 to 65530
npx serve-lite public

# by default use current working directory as root directory
npx serve-lite
```

Sample output:

```
listening on http://localhost:8100
```

## License

This project is licensed with [BSD-2-Clause](./LICENSE)

This is free, libre, and open-source software. It comes down to four essential freedoms [[ref]](https://seirdy.one/2021/01/27/whatsapp-and-the-domestication-of-users.html#fnref:2):

- The freedom to run the program as you wish, for any purpose
- The freedom to study how the program works, and change it so it does your computing as you wish
- The freedom to redistribute copies so you can help others
- The freedom to distribute copies of your modified versions to others
