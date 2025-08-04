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
const mods = "top_nav=false";

var app = (module.exports = express());

app.use(express.urlencoded({ extended: false }));

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
  },
  {
    firstName: 'Cecilia',
    lastName: 'Stark',
    email: 'cecilia@example.com',
    accountId: 132,
    accountName: 'Customer-Fake',
  },
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

app.get("/question", function (req, res) {
    const hash = decodeURIComponent(req.query.hash || "");
    const directUrl = `${METABASE_SITE_URL}/question#${hash}`;
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
        <title>Acme App</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background-color: #fefefe;
                height: 100vh;
                overflow: hidden;
            }
            
            .header {
                background: linear-gradient(to right, #f8fafc, #f1f5f9);
                color: #1f2937;
                padding: 1.25rem 2rem;
                border-bottom: 1px solid #e2e8f0;
                position: relative;
                z-index: 1000;
                box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
            }
            
            .header h1 {
                font-size: 1.5rem;
                font-weight: 700;
                color: #1e293b;
                letter-spacing: -0.025em;
            }
            
            .container {
                display: flex;
                height: calc(100vh - 70px);
            }
            
            .sidebar {
                width: 280px;
                background: #ffffff;
                border-right: 1px solid #e5e7eb;
                display: flex;
                flex-direction: column;
                overflow-y: auto;
            }
            
            .sidebar-content {
                flex: 1;
                padding: 2rem 0;
            }
            
            .sidebar-header {
                padding: 0 2rem 1.5rem;
                border-bottom: 1px solid #f3f4f6;
                margin-bottom: 1.5rem;
            }
            
            .sidebar-header h3 {
                color: #374151;
                font-size: 1rem;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            
            .menu-item {
                display: flex;
                align-items: center;
                padding: 0.75rem 2rem;
                color: #6b7280;
                text-decoration: none;
                transition: all 0.15s ease;
                font-weight: 500;
            }
            
            .menu-item:hover {
                background-color: #f9fafb;
                color: #374151;
            }
            
            .menu-item.active {
                background-color: #f3f4f6;
                color: #111827;
                border-right: 2px solid #d1d5db;
            }
            
            .menu-item-icon {
                width: 20px;
                height: 20px;
                margin-right: 12px;
                opacity: 0.7;
            }
            
            .main-content {
                flex: 1;
                padding: 2rem;
                background-color: #f9fafb;
                overflow: hidden;
            }
            
            .dashboard-container {
                background: #ffffff;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                height: 100%;
                overflow: hidden;
            }
            
            #metabase {
                width: 100%;
                height: 100%;
                border: none;
                border-radius: 8px;
            }
            
            .user-info {
                padding: 1.5rem 2rem;
                border-top: 1px solid #f3f4f6;
                background-color: #f9fafb;
                margin-top: auto;
            }
            
            .user-profile {
                display: flex;
                align-items: center;
                color: #6b7280;
                font-size: 0.875rem;
            }
            
            .user-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background-color: #d1d5db;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #374151;
                font-weight: 600;
                margin-right: 10px;
                font-size: 0.875rem;
            }
            
            .logout-link {
                color: #6b7280;
                text-decoration: none;
                font-size: 0.8rem;
                margin-top: 0.5rem;
                display: inline-block;
                font-weight: 500;
            }
            
            .logout-link:hover {
                color: #374151;
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Acme App</h1>
        </div>
        
        <div class="container">
            <div class="sidebar">
                <div class="sidebar-content">
                    
                    <a href="/analytics" class="menu-item ${activeMenuItem === 'dashboard' ? 'active' : ''}">
                        <svg class="menu-item-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"></path>
                        </svg>
                        Dashboard
                    </a>
                    
                    <a href="/editor" class="menu-item ${activeMenuItem === 'editor' ? 'active' : ''}">
                        <svg class="menu-item-icon" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
                        </svg>
                        Question Builder
                    </a>
                </div>
                
                <div class="user-info">
                    <div class="user-profile">
                        <div class="user-avatar">
                            ${req.session && req.session.user ? req.session.user.firstName.charAt(0).toUpperCase() : 'R'}
                        </div>
                        <div>
                            <div>${req.session && req.session.user ? req.session.user.firstName + ' ' + req.session.user.lastName : 'Rene Mueller'}</div>
                            <div style="font-size: 0.75rem; opacity: 0.7;">${req.session && req.session.user ? req.session.user.accountName : 'Customer-Acme'}</div>
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
