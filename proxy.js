require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
const EMBED_HOST = process.env.EMBED_HOST || 'http://localhost:9090';
const TARGET = process.env.TARGET || 'https://minusx.metabaseapp.com';
const EXTENSION_TARGET = process.env.EXTENSION_TARGET || 'https://web.minusxapi.com/extension-build';
const MX_DEV_MODE = process.env.NODE_ENV === 'MX_DEV';
const MX_DEV_BUILD_PATH = '../minusx/extension/build';


// Proxy bundle files and assets from web.minusxapi.com or serve from filesystem in MX_DEV mode
const rewriteUrls = [
  '/contentScript.bundle.js',
  '/content.styles.css',
//   '/logo_x.svg',
  '/metabase.bundle.js',
]

if (MX_DEV_MODE) {
  console.log('🔧 MX_DEV MODE: Serving files from filesystem at', MX_DEV_BUILD_PATH);
  for (const url of rewriteUrls) {
    const fullPath = path.resolve(__dirname, MX_DEV_BUILD_PATH, url.slice(1));
    app.use(url, express.static(fullPath));
  }
} else {
  console.log('🔧 PROD MODE: Proxying requests to', EXTENSION_TARGET);
  for (const url of rewriteUrls) {
    app.use(createProxyMiddleware({
      target: EXTENSION_TARGET,
      changeOrigin: true,
      pathFilter: url,
    }));
  }
}

// Serve custom configs for /minusx.json requests
app.get('/minusx.json', cors(), (req, res) => {
  // Returns {}
  res.json({
    "embed_host": EMBED_HOST
  });
});

// Serve custom.css for /minusx.css requests
app.get('/minusx.css', (req, res) => {
  res.sendFile(__dirname + '/custom.css');
});

// Serve local logo instead of from EXTENSION_TARGET
app.get('/logo_x.svg', (req, res) => {
  res.sendFile(__dirname + '/temp_logo.svg');
});

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
  on: {
   proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      // Handle JWT cookie setting for /auth/sso requests
      if (req.url.startsWith('/auth/sso')) {
        const mx_jwt = req.query.mx_jwt;
        if (mx_jwt) {
          console.log('🔐 Setting mx_jwt cookie for /auth/sso');
          res.cookie('mx_jwt', mx_jwt, {
            httpOnly: false,
            secure: true,
            sameSite: 'None'
          });
        }
      }

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
              if (!sources.includes('https://*.minusxapi.com')) {
                sources.push('https://*.minusxapi.com');
              }
              if (MX_DEV_MODE && !sources.includes('http://localhost:3005')) {
                sources.push('http://localhost:3005');
              }
              return `frame-src ${sources.join(' ')}`;
            });
          } else {
            if (MX_DEV_MODE) {
              csp += `; frame-src https://*.minusxapi.com http://localhost:3005`;
            } else {
              csp += `; frame-src https://*.minusxapi.com`;
            }
          }

          // Handle connect-src CSP modification
          if (csp.includes('connect-src')) {
            csp = csp.replace(/connect-src\s+([^;]+)/, (match, value) => {
              const sources = value.trim().split(/\s+/);
              if (!sources.includes('https://*.minusxapi.com')) {
                sources.push('https://*.minusxapi.com');
              }
              return `connect-src ${sources.join(' ')}`;
            });
          } else {
            csp += `; connect-src https://*.minusxapi.com`;
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