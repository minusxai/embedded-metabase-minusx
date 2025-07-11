require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

const app = express();
app.set('trust proxy', 1);
const TARGET = process.env.TARGET || 'https://minusx.metabaseapp.com';
const EXTENSION_TARGET = process.env.EXTENSION_TARGET || 'https://web.minusxapi.com/extension-build';


// Proxy bundle files and assets from web.minusxapi.com or serve from filesystem in DEV mode
const rewriteUrls = [
  '/contentScript.bundle.js',
  '/content.styles.css',
  '/logo_x.svg',
  '/metabase.bundle.js',
]

for (const url of rewriteUrls) {
  app.use(createProxyMiddleware({
    target: EXTENSION_TARGET,
    changeOrigin: true,
    pathFilter: url,
  }));
}

// Serve custom.css for /minusx.css requests
app.get('/minusx.css', (req, res) => {
  res.sendFile(__dirname + '/custom.css');
});

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
  on: {
   proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const contentType = proxyRes.headers['content-type'] || '';

      if (contentType.includes('text/html')) {
        console.log('🔧 Intercepting HTML response', req.url);
        let response = responseBuffer.toString('utf8');
        console.log('🔧 Intercepting HTML response, done');

        // Inject script
        response = response.replace('</head>', `
    <script src="/contentScript.bundle.js"></script>
    </head>`);

        // Modify CSP header safely
        let csp = proxyRes.headers['content-security-policy'];

        if (csp) {
          if (csp.includes('frame-src')) {
            csp = csp.replace(/frame-src\s+([^;]+)/, (match, value) => {
              const sources = value.trim().split(/\s+/);
              if (!sources.includes('https://web.minusxapi.com')) {
                sources.push('https://web.minusxapi.com');
              }
              return `frame-src ${sources.join(' ')}`;
            });
          } else {
            csp += `; frame-src https://web.minusxapi.com`;
          }

          // 🔥 Important: apply to final response
          res.setHeader('Content-Security-Policy', csp);
        }

        return response;
      }

      // For non-HTML, return raw buffer
      return responseBuffer;
    }), 
  },
}));

app.listen(9091, () => {
  console.log('🚀 Proxy running at http://localhost:9091');
});