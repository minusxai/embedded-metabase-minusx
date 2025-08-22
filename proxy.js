require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');

// In-memory cache for static assets
const assetCache = new Map();

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

// Check cache first for static assets
app.use('/', (req, res, next) => {
  const contentType = req.headers.accept || '';
  const isStaticAsset = req.url.endsWith('.js') || req.url.endsWith('.css') ||
    req.url.endsWith('.js.map') || req.url.endsWith('.css.map') ||
    req.url.endsWith('.woff') || req.url.endsWith('.woff2') || 
    req.url.endsWith('.ttf') || req.url.endsWith('.eot') ||
    contentType.includes('text/css') || contentType.includes('application/javascript');
  
  if (isStaticAsset && assetCache.has(req.url)) {
    const cached = assetCache.get(req.url);
    console.log('📦 Serving from cache:', req.url);
    
    // Set browser cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Expires', new Date(Date.now() + 3600000).toUTCString());
    res.setHeader('Content-Type', cached.contentType);
    
    return res.send(cached.data);
  }
  
  next();
});

// Reject PUT and DELETE requests to /api/dashboard/:id with 403
app.put('/api/dashboard/:id', (req, res) => {
  res.status(403).json({ error: 'Dashboard updates are not allowed' });
});

app.delete('/api/dashboard/:id', (req, res) => {
  res.status(403).json({ error: 'Dashboard deletion is not allowed' });
});

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
  on: {
   proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
      const contentType = proxyRes.headers['content-type'] || '';
      console.log('Content type for url', req.url, 'is', contentType)
      
      // Cache static assets in memory
      const isStaticAsset = contentType.includes('application/javascript') || 
        contentType.includes('text/javascript') || 
        contentType.includes('text/css') ||
        contentType.includes('application/json') ||
        contentType.startsWith('font/') ||
        req.url.endsWith('.js') || 
        req.url.endsWith('.css') ||
        req.url.endsWith('.js.map') ||
        req.url.endsWith('.css.map') ||
        req.url.endsWith('.woff') || 
        req.url.endsWith('.woff2') || 
        req.url.endsWith('.ttf') || 
        req.url.endsWith('.eot');
        
      if (isStaticAsset) {
        console.log('💾 Caching asset:', req.url);
        assetCache.set(req.url, {
          data: responseBuffer,
          contentType: contentType,
          timestamp: Date.now()
        });
        
        // Set browser cache headers
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Expires', new Date(Date.now() + 3600000).toUTCString());
      }

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