require('dotenv').config();
const express = require('express');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// In-memory cache for static assets
const assetCache = new Map();

const app = express();
app.set('trust proxy', 1);
const EMBED_HOST = process.env.EMBED_HOST || 'http://localhost:9090';
const TARGET = process.env.TARGET || 'https://minusx.metabaseapp.com';
const EXTENSION_TARGET = process.env.EXTENSION_TARGET || 'https://web.minusxapi.com/extension-build';
const MX_DEV_MODE = process.env.NODE_ENV === 'MX_DEV';
const MX_DEV_BUILD_PATH = '../minusx/extension/build';
const AUTH_SECRET_TOKEN2 = process.env.AUTH_SECRET_TOKEN2;
const AUTH_SECRET_TOKEN = process.env.AUTH_SECRET_TOKEN;


// Proxy bundle files and assets from web.minusxapi.com or serve from filesystem in MX_DEV mode
const rewriteUrls = [
  '/contentScript.bundle.js',
  '/content.styles.css',
  '/logo_x.svg',
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
  res.sendFile(__dirname + '/css_blog.css');
});

// Serve local logo instead of from EXTENSION_TARGET
// app.get('/logo_x.svg', (req, res) => {
//   res.sendFile(__dirname + '/temp_logo.svg');
// });

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

// Intercept /auth/login and serve custom auto-login page
app.get('/auth/login', (req, res) => {
  const redirectUrl = req.query.redirect || '/';
  const authToken = req.query.auth_token || '';
  console.log('🔐 Serving auto-login page, will redirect to:', redirectUrl);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Logging in...</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: #f5f5f5;
        }
        .container {
          text-align: center;
        }
        .spinner {
          border: 3px solid #e0e0e0;
          border-top: 3px solid #333;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        h2 { color: #333; margin: 0 0 0.5rem; font-weight: 400; }
        p { color: #666; margin: 0; }
        .error {
          color: #d32f2f;
          margin-top: 1rem;
          display: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="spinner"></div>
        <h2>Logging you in...</h2>
        <p>Please wait a moment</p>
        <p class="error" id="error">Authentication failed. Please try again.</p>
      </div>
      <script>
        (async function() {
          try {
            const response = await fetch('/api/session', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ auth_token: '${authToken}' })
            });

            if (response.ok) {
              // Redirect to the original destination
              window.location.href = '${redirectUrl}';
            } else {
              document.getElementById('error').style.display = 'block';
            }
          } catch (error) {
            console.error('Login failed:', error);
            document.getElementById('error').style.display = 'block';
          }
        })();
      </script>
    </body>
    </html>
  `);
});

// Intercept POST to /api/session and inject credentials
app.post('/api/session', express.json(), async (req, res) => {
  console.log('🔐 Intercepting /api/session, decoding auth_token...');

  try {
    const { auth_token } = req.body;

    if (!auth_token) {
      return res.status(400).json({ error: 'Missing auth_token' });
    }

    // Step 1: Decode outer JWT using AUTH_SECRET_TOKEN2
    let outerDecoded;
    try {
      outerDecoded = jwt.verify(auth_token, AUTH_SECRET_TOKEN2);
      console.log('✅ Outer JWT decoded successfully');
    } catch (error) {
      console.error('❌ Failed to decode outer JWT:', error.message);
      return res.status(401).json({ error: 'Invalid auth_token (outer)' });
    }

    // Step 2: Extract inner token
    const innerToken = outerDecoded.token;
    if (!innerToken) {
      console.error('❌ No token field in outer JWT');
      return res.status(401).json({ error: 'Invalid auth_token structure' });
    }

    // Step 3: Decode inner JWT using AUTH_SECRET_TOKEN
    let innerDecoded;
    try {
      innerDecoded = jwt.verify(innerToken, AUTH_SECRET_TOKEN);
      console.log('✅ Inner JWT decoded successfully');
    } catch (error) {
      console.error('❌ Failed to decode inner JWT:', error.message);
      return res.status(401).json({ error: 'Invalid auth_token (inner)' });
    }

    // Step 4: Extract username and password
    const { username, password } = innerDecoded;
    if (!username || !password) {
      console.error('❌ Missing username or password in inner JWT');
      return res.status(401).json({ error: 'Invalid credentials in auth_token' });
    }

    console.log('🔐 Extracted credentials for user:', username);

    // Step 5: Make POST request to Metabase with extracted credentials
    const response = await axios.post(`${TARGET}/api/session`, {
      username,
      password,
      remember: true
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Extract Set-Cookie headers from response
    const setCookieHeaders = response.headers['set-cookie'];
    if (setCookieHeaders) {
      // Forward cookies to client
      setCookieHeaders.forEach(cookie => {
        res.append('Set-Cookie', cookie);
      });
      console.log('✅ Auto-authentication successful');
    }

    // Return Metabase's response
    res.json(response.data);
  } catch (error) {
    console.error('❌ Auto-authentication failed:', error.message);
    res.status(error.response?.status || 500).json(error.response?.data || { error: error.message });
  }
});

app.use('/', createProxyMiddleware({
  target: TARGET,
  changeOrigin: true,
  selfHandleResponse: true,
  timeout: 30000, // 30 second timeout
  proxyTimeout: 30000,
  onProxyReq: (proxyReq, req, res) => {
    console.log('🔄 Proxying request:', req.method, req.url, 'to', TARGET);
    // Override Origin and Referer headers to match TARGET
    proxyReq.setHeader('Origin', TARGET);
    if (req.headers.referer) {
      const refererPath = req.headers.referer.replace(/^https?:\/\/[^\/]+/, '');
      proxyReq.setHeader('Referer', `${TARGET}${refererPath}`);
    }
  },
  onError: (err, req, res) => {
    console.error('❌ Proxy error for', req.url, ':', err.message);
    res.status(504).send('Gateway Timeout');
  },
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

          // Handle frame-ancestors to allow embedding
          if (csp.includes('frame-ancestors')) {
            csp = csp.replace(/frame-ancestors\s+([^;]+)/, () => {
              return `frame-ancestors *`;
            });
          } else {
            csp += `; frame-ancestors *`;
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