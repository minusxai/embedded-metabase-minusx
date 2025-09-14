"use strict";

require('dotenv').config();
const express = require("express");
const session = require("express-session");
const jwt = require("jsonwebtoken");

const METABASE_SITE_URL = process.env.PROXY_URL || "http://localhost:9091";
const METABASE_JWT_SHARED_SECRET = process.env.METABASE_JWT_SHARED_SECRET;
const MX_JWT_SHARED_SECRET = process.env.MX_JWT_SHARED_SECRET;
// const METABASE_DASHBOARD_PATH = process.env.METABASE_DASHBOARD_PATH || "/dashboard/1-e-commerce-insights";
// const METABASE_EDITOR_PATH = process.env.METABASE_EDITOR_PATH || "/question/139-demo-mbql/notebook";
const mods = "header=false&action_buttons=false&top_nav=false&side_nav=false";

// Demo pages configuration
const demoPages = [
  {
    name: 'Dashboard Q&A',
    path: '/dashboard',
    iframePath: '/dashboard/36-sales-overview',
    icon: 'bar-chart-2'
  },
  {
    name: 'Question Builder',
    path: '/mbql',
    iframePath: '/question/139-demo-mbql',
    icon: 'edit-3'
  },
  {
    name: 'Edit SQL Query',
    path: '/sql-edit',
    iframePath: '/question/138-demo-sql',
    icon: 'database'
  },
  {
    name: 'New SQL Query',
    path: '/sql-new',
    iframePath: '/question#eyJkYXRhc2V0X3F1ZXJ5Ijp7ImRhdGFiYXNlIjoxLCJ0eXBlIjoibmF0aXZlIiwibmF0aXZlIjp7InF1ZXJ5IjoiIiwidGVtcGxhdGUtdGFncyI6e319fSwiZGlzcGxheSI6InRhYmxlIiwidmlzdWFsaXphdGlvbl9zZXR0aW5ncyI6e30sInR5cGUiOiJxdWVzdGlvbiJ9',
    icon: 'plus-circle'
  }
];

var app = (module.exports = express());

app.use(express.urlencoded({ extended: false }));
app.use(express.static('.'));

// Configure session middleware
app.use(session({
  resave: false,
  saveUninitialized: false,
  secret: 'shhhh, very secret',
}));


// Mock user database for development
const users = [
  {
    firstName: 'Rene',
    lastName: 'Mueller',
    email: 'rene2@minusx.ai',
    accountId: 28,
    accountName: 'Customer-Acme',
  }
];


// JWT token signing function
const signUserToken = (user) =>
  jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      account_id: user.accountId,
      groups: [user.accountName],
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minute expiration
    },
    METABASE_JWT_SHARED_SECRET
  );

// MX JWT token signing function
const signMXToken = (username) =>
  jwt.sign(
    {
    //   username, // username is supported as well
      email: `${username}@domain.com`, // OR email should be provided
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minute expiration
    },
    MX_JWT_SHARED_SECRET
  );



app.get("/", function (req, res) {
    res.redirect("/dashboard");
});

demoPages.forEach(page => {
    app.get(page.path, function (req, res) {
        res.send(generatePage(req, page.iframePath, page.path.replace('/', '')));
    });
});

app.get("/question/:id?", function (req, res) {
    const questionId = req.params.id;
    const hash = decodeURIComponent(req.query.hash || "");
    
    let directUrl;
    if (questionId && questionId.trim()) {
        directUrl = `${METABASE_SITE_URL}/question/${questionId}`;
    } else if (hash) {
        directUrl = `${METABASE_SITE_URL}/question#${hash}`;
    } else {
        directUrl = `${METABASE_SITE_URL}/question`;
    }
    
    res.send(generatePage(req, directUrl, 'question', true));
});

// SSO route for Metabase authentication
app.get('/sso/metabase', (req, res) => {
  // Auto-login as first user for development (no session checking)
  if (!req.session.user) {
    req.session.user = users[0]; // Use Rene as default user
  }
  // Create username from email
  const username = req.session.user.email.split('@')[0];
  
  const ssoUrl = new URL('/auth/sso', METABASE_SITE_URL);
  ssoUrl.searchParams.set('jwt', signUserToken(req.session.user));
  ssoUrl.searchParams.set('mx_jwt', signMXToken(username));
  ssoUrl.searchParams.set('return_to', `${req.query.return_to ?? '/'}?${mods}`);
  
  res.redirect(ssoUrl);
});


const generatePage = (req, urlOrPath, activeMenuItem, isDirectUrl = false) => {
    const iframeUrl = isDirectUrl ? urlOrPath : `/sso/metabase?return_to=${urlOrPath}`;
    return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>MinusX Embedded Demo</title>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
        <script src="https://unpkg.com/feather-icons"></script>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'JetBrains Mono', monospace;
                background-color: #0a0a0a;
                height: 100vh;
                overflow: hidden;
                color: #f5f5f5;
            }
            
            .header {
                background: #111111;
                color: #f5f5f5;
                padding: 1.25rem 2rem;
                border-bottom: 1px solid #333333;
                position: relative;
                z-index: 1000;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .header-left {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .logo {
                width: 32px;
                height: 32px;
                background: #00ff00;
                border: 1px solid #00ff00;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 0.875rem;
                color: #000000;
            }
            
            .header h1 {
                font-size: 1.125rem;
                font-weight: 500;
                color: #f5f5f5;
                letter-spacing: 0.02em;
                text-transform: uppercase;
            }
            
            .header-right {
                display: flex;
                align-items: center;
                gap: 1.5rem;
                font-size: 0.875rem;
                color: #a0a0a0;
            }
            
            .container {
                display: flex;
                height: calc(100vh - 88px);
            }
            
            .sidebar {
                width: 240px;
                background: #0f0f0f;
                border-right: 1px solid #333333;
                display: flex;
                flex-direction: column;
                overflow-y: auto;
            }
            
            .sidebar-content {
                flex: 1;
                padding: 2rem 0;
            }
            
            .nav-section {
                margin-bottom: 2rem;
            }
            
            .nav-section h3 {
                color: #00ff00;
                font-size: 0.75rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.15em;
                padding: 0 1.5rem;
                margin-bottom: 0.75rem;
            }
            
            .menu-item {
                display: flex;
                align-items: center;
                padding: 0.75rem 1.5rem;
                color: #a0a0a0;
                text-decoration: none;
                transition: all 0.15s ease;
                font-weight: 400;
                font-size: 0.8rem;
                border-left: 2px solid transparent;
            }
            
            .menu-item:hover {
                background-color: #1a1a1a;
                color: #f5f5f5;
                border-left: 2px solid #00ff00;
            }
            
            .menu-item.active {
                background-color: #1a1a1a;
                color: #00ff00;
                border-left: 2px solid #00ff00;
                font-weight: 600;
            }
            
            .menu-item-icon {
                width: 16px;
                height: 16px;
                margin-right: 0.75rem;
                opacity: 0.6;
                stroke-width: 2;
            }
            
            .menu-item:hover .menu-item-icon,
            .menu-item.active .menu-item-icon {
                opacity: 1;
            }
            
            .main-content {
                flex: 1;
                padding: 1.5rem;
                background-color: #0a0a0a;
                overflow: hidden;
            }
            
            .dashboard-container {
                background: #111111;
                border-radius: 4px;
                border: 1px solid #333333;
                height: 100%;
                overflow: hidden;
                box-shadow: 0 0 20px rgba(0, 255, 0, 0.1);
            }
            
            #metabase {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 4px;
                filter: contrast(1.1) brightness(0.95);
            }
            
            .user-info {
                padding: 1.25rem 1.5rem;
                border-top: 1px solid #333333;
                background-color: #0f0f0f;
                margin-top: auto;
            }
            
            .user-profile {
                display: flex;
                align-items: center;
                color: #a0a0a0;
                font-size: 0.8rem;
            }
            
            .user-avatar {
                width: 32px;
                height: 32px;
                border: 1px solid #00ff00;
                background-color: #000000;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #00ff00;
                font-weight: 600;
                margin-right: 0.75rem;
                font-size: 0.75rem;
            }
            
            .user-name {
                font-weight: 500;
                color: #f5f5f5;
                margin-bottom: 0.125rem;
            }
            
            .user-company {
                font-size: 0.7rem;
                color: #666666;
            }
            
            .cta-button {
                background: transparent;
                color: #00ff00;
                padding: 0.625rem 1.25rem;
                border: 1px solid #00ff00;
                border-radius: 2px;
                font-size: 0.8rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.15s ease;
                text-decoration: none;
                display: inline-block;
                font-family: 'JetBrains Mono', monospace;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            
            .cta-button:hover {
                background: #00ff00;
                color: #000000;
                box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="header-left">
                <img src="https://web.minusxapi.com/logo_x_light.svg" alt="Logo" style="height: 32px; width: auto;" />
                <h1>MinusX Embedded Demo</h1>
            </div>
            <div class="header-right">
                <button class="cta-button" onclick="window.open('https://cal.com/vivek-aithal/minusx-embedded-demo', '_blank')">Add MinusX to Your App</button>
            </div>
        </div>
        
        <div class="container">
            <div class="sidebar">
                <div class="sidebar-content">
                    <div class="nav-section">
                        <h3>Demo Pages</h3>
                        ${demoPages.map(page => `
                        <a href="${page.path}" class="menu-item ${activeMenuItem === page.path.replace('/', '') ? 'active' : ''}">
                            <i data-feather="${page.icon}" class="menu-item-icon"></i>
                            ${page.name}
                        </a>`).join('')}
                    </div>
                    
                    <div class="nav-section">
                        <h3>Additional Info</h3>
                        <a href="#" onclick="window.open('https://minusx.ai/embedded-metabase-ai/', '_blank')" class="menu-item">
                            <i data-feather="info" class="menu-item-icon"></i>
                            Website
                        </a>
                        <a href="#" onclick="window.open('https://docs.minusx.ai/en/collections/10790008-minusx-in-metabase', '_blank')" class="menu-item">
                            <i data-feather="book" class="menu-item-icon"></i>
                            MinusX Docs
                        </a>
                        <a href="#" onclick="window.open('https://cal.com/vivek-aithal/minusx-embedded-demo', '_blank')" class="menu-item">
                            <i data-feather="users" class="menu-item-icon"></i>
                            Talk to CoFounders
                        </a>
                    </div>
                </div>
                
                <div class="user-info">
                    <div class="user-profile">
                        <div class="user-avatar">
                            MX
                        </div>
                        <div>
                            <div class="user-name">MinusX User</div>
                            <div class="user-company">Embedded Analytics</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="main-content">
                <div class="dashboard-container">
                    <iframe id='metabase' src="${iframeUrl}" allowtransparency></iframe>
                </div>
            </div>
        </div>
        
        <script>
            // Initialize Feather icons
            feather.replace();
        </script>
    </body>
</html>`;
};

const PORT =
    process.env.PORT || 9090;
if (!module.parent) {
    app.listen(PORT);
    console.log(`Express started serving on port ${PORT}`);
}
