"use strict";

require('dotenv').config();
const express = require("express");
const session = require("express-session");
const jwt = require("jsonwebtoken");

const METABASE_SITE_URL = process.env.PROXY_URL || "http://localhost:9091";
const METABASE_JWT_SHARED_SECRET = process.env.METABASE_JWT_SHARED_SECRET;
const MX_JWT_SHARED_SECRET = process.env.MX_JWT_SHARED_SECRET;
const METABASE_DASHBOARD_PATH = process.env.METABASE_DASHBOARD_PATH || "/dashboard/1-e-commerce-insights";
const METABASE_EDITOR_PATH = process.env.METABASE_EDITOR_PATH || "/question/139-demo-mbql/notebook";
const mods = "header=false&action_buttons=false&top_nav=false&side_nav=false";

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
    res.redirect("/analytics");
});

app.get("/analytics", function (req, res) {
    res.send(generatePage(req, METABASE_DASHBOARD_PATH, 'dashboard'));
});

app.get("/editor", function (req, res) {
    res.send(generatePage(req, METABASE_EDITOR_PATH, 'editor'));
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
        <title>MinusX Embedded Analytics</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background-color: #ffffff;
                height: 100vh;
                overflow: hidden;
                color: #1f2937;
            }
            
            .header {
                background: #ffffff;
                color: #1f2937;
                padding: 1.5rem 2.5rem;
                border-bottom: 1px solid #f1f5f9;
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
                background: #1f2937;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 1rem;
                color: white;
            }
            
            .header h1 {
                font-size: 1.25rem;
                font-weight: 600;
                color: #1f2937;
                letter-spacing: -0.02em;
            }
            
            .header-right {
                display: flex;
                align-items: center;
                gap: 1.5rem;
                font-size: 0.875rem;
                color: #6b7280;
            }
            
            .container {
                display: flex;
                height: calc(100vh - 88px);
            }
            
            .sidebar {
                width: 260px;
                background: #fafafa;
                border-right: 1px solid #f1f5f9;
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
                color: #9ca3af;
                font-size: 0.75rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                padding: 0 1.5rem;
                margin-bottom: 0.75rem;
            }
            
            .menu-item {
                display: flex;
                align-items: center;
                padding: 0.75rem 1.5rem;
                color: #6b7280;
                text-decoration: none;
                transition: all 0.2s ease;
                font-weight: 500;
                font-size: 0.875rem;
            }
            
            .menu-item:hover {
                background-color: #ffffff;
                color: #1f2937;
            }
            
            .menu-item.active {
                background-color: #ffffff;
                color: #1f2937;
                border-right: 2px solid #1f2937;
                font-weight: 600;
            }
            
            .menu-item-icon {
                width: 18px;
                height: 18px;
                margin-right: 0.75rem;
                opacity: 0.6;
            }
            
            .menu-item:hover .menu-item-icon,
            .menu-item.active .menu-item-icon {
                opacity: 1;
            }
            
            .main-content {
                flex: 1;
                padding: 2rem;
                background-color: #ffffff;
                overflow: hidden;
            }
            
            .dashboard-container {
                background: #ffffff;
                border-radius: 8px;
                border: 1px solid #f1f5f9;
                height: 100%;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            }
            
            #metabase {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 8px;
            }
            
            .user-info {
                padding: 1.5rem;
                border-top: 1px solid #f1f5f9;
                background-color: #ffffff;
                margin-top: auto;
            }
            
            .user-profile {
                display: flex;
                align-items: center;
                color: #6b7280;
                font-size: 0.875rem;
            }
            
            .user-avatar {
                width: 36px;
                height: 36px;
                border-radius: 8px;
                background-color: #1f2937;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 600;
                margin-right: 0.75rem;
                font-size: 0.875rem;
            }
            
            .user-name {
                font-weight: 500;
                color: #1f2937;
                margin-bottom: 0.125rem;
            }
            
            .user-company {
                font-size: 0.75rem;
                color: #9ca3af;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="header-left">
                <img src="/temp_logo.svg" alt="Logo" style="height: 32px; width: auto;" />
                <h1>MinusX Embedded Analytics</h1>
            </div>
            <div class="header-right">
                <span>Enterprise Plan</span>
            </div>
        </div>
        
        <div class="container">
            <div class="sidebar">
                <div class="sidebar-content">
                    <div class="nav-section">
                        <h3>Analytics</h3>
                        <a href="/analytics" class="menu-item ${activeMenuItem === 'dashboard' ? 'active' : ''}">
                            <svg class="menu-item-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"></path>
                            </svg>
                            Dashboard
                        </a>
                        
                        <a href="/editor" class="menu-item ${activeMenuItem === 'editor' ? 'active' : ''}">
                            <svg class="menu-item-icon" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path>
                            </svg>
                            Query Builder
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
    </body>
</html>`;
};

const PORT =
    process.env.PORT || 9090;
if (!module.parent) {
    app.listen(PORT);
    console.log(`Express started serving on port ${PORT}`);
}
