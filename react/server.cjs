const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 8080);
const host = '0.0.0.0';

const publicPath = '/customer-support-sla/react';
const distPath = path.resolve(__dirname, 'dist');
const indexFile = path.join(distPath, 'index.html');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

function sendFile(request, response, filePath) {
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendNotFound(response);
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    const contentType =
      mimeTypes[extension] || 'application/octet-stream';

    const isHtml = extension === '.html';

    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': isHtml
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=31536000, immutable'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    fs.createReadStream(filePath).pipe(response);
  });
}

function sendNotFound(response) {
  response.writeHead(404, {
    'Content-Type': 'text/plain; charset=utf-8'
  });

  response.end('404 Not Found');
}

const server = http.createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {
      Allow: 'GET, HEAD'
    });
    response.end('Method Not Allowed');
    return;
  }

  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || 'localhost'}`
  );

  const pathname = decodeURIComponent(requestUrl.pathname);

  // Redirect the Azure root to the React application.
  if (pathname === '/') {
    response.writeHead(302, {
      Location: `${publicPath}/`
    });
    response.end();
    return;
  }

  // Normalize the base URL to include its trailing slash.
  if (pathname === publicPath) {
    response.writeHead(308, {
      Location: `${publicPath}/${requestUrl.search}`
    });
    response.end();
    return;
  }

  if (!pathname.startsWith(`${publicPath}/`)) {
    sendNotFound(response);
    return;
  }

  let relativePath = pathname.slice(publicPath.length);

  if (relativePath === '/') {
    sendFile(request, response, indexFile);
    return;
  }

  relativePath = relativePath.replace(/^\/+/, '');

  const requestedFile = path.resolve(distPath, relativePath);

  // Prevent paths from escaping the dist directory.
  if (
    requestedFile !== distPath &&
    !requestedFile.startsWith(`${distPath}${path.sep}`)
  ) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(requestedFile, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(request, response, requestedFile);
      return;
    }

    const acceptsHtml = (
      request.headers.accept || ''
    ).includes('text/html');

    const hasFileExtension =
      path.extname(relativePath) !== '';

    // React Router fallback for application routes.
    if (acceptsHtml && !hasFileExtension) {
      sendFile(request, response, indexFile);
      return;
    }

    // Missing JS/CSS/image files must remain 404.
    sendNotFound(response);
  });
});

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`);
  console.log(`Serving ${distPath}`);
  console.log(`Public path: ${publicPath}/`);
});