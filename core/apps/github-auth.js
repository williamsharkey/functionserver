// GitHub Auth - Manage GitHub credentials for FunctionServer
// Supports GitHub Device Flow for easy sign-in

const W = 480, H = 500;
const STORAGE_KEY = "fs_github_auth";
const GITHUB_CLIENT_ID = "Ov23liMPasWyBKlzGUDT";

function loadAuth() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}

function saveAuth(auth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

window.GitHubAuth = {
  getToken() { return loadAuth().token || null; },
  getUsername() { return loadAuth().username || null; },
  isConfigured() {
    const auth = loadAuth();
    return !!(auth.token && auth.username);
  },
  getAuthUrl(repoUrl) {
    const auth = loadAuth();
    if (!auth.token) return repoUrl;
    const match = repoUrl.match(/git@github\.com:(.+)\.git/);
    if (match) return "https://" + auth.token + "@github.com/" + match[1] + ".git";
    const httpsMatch = repoUrl.match(/https:\/\/github\.com\/(.+)/);
    if (httpsMatch) return "https://" + auth.token + "@github.com/" + httpsMatch[1];
    return repoUrl;
  },
  async push(repoPath) {
    const remote = await Studio.github._exec("git -C " + repoPath + " remote get-url origin 2>/dev/null");
    if (!remote.trim()) return "No remote configured";
    const authUrl = this.getAuthUrl(remote.trim());
    return await Studio.github._exec("git -C " + repoPath + " push " + authUrl + " HEAD 2>&1");
  },
  async pull(repoPath) {
    const remote = await Studio.github._exec("git -C " + repoPath + " remote get-url origin 2>/dev/null");
    if (!remote.trim()) return "No remote configured";
    const authUrl = this.getAuthUrl(remote.trim());
    return await Studio.github._exec("git -C " + repoPath + " pull " + authUrl + " 2>&1");
  },
  async clone(repoUrl, destPath) {
    const authUrl = this.getAuthUrl(repoUrl);
    return await Studio.github._exec("git clone " + authUrl + " " + destPath + " 2>&1");
  }
};

// Device Flow state
let pollInterval = null;

window.startDeviceFlow = async function() {
  output("Starting GitHub sign-in...");

  // Step 1: Request device code
  const codeResult = await Studio.github._exec(
    'curl -s -X POST "https://github.com/login/device/code" ' +
    '-H "Accept: application/json" ' +
    '-d "client_id=' + GITHUB_CLIENT_ID + '&scope=repo"'
  );

  let codeData;
  try {
    codeData = JSON.parse(codeResult);
  } catch(e) {
    output("Error: " + codeResult);
    return;
  }

  if (codeData.error) {
    output("Error: " + codeData.error_description);
    return;
  }

  const { device_code, user_code, verification_uri, interval } = codeData;

  // Step 2: Show code and open GitHub
  output("Enter this code on GitHub:\n\n    " + user_code + "\n\nOpening GitHub in new tab...\nWaiting for approval...");
  window.open(verification_uri, '_blank');

  // Step 3: Poll for token
  const pollMs = (interval || 5) * 1000;
  pollInterval = setInterval(async () => {
    const tokenResult = await Studio.github._exec(
      'curl -s -X POST "https://github.com/login/oauth/access_token" ' +
      '-H "Accept: application/json" ' +
      '-d "client_id=' + GITHUB_CLIENT_ID + '&device_code=' + device_code + '&grant_type=urn:ietf:params:oauth:grant-type:device_code"'
    );

    let tokenData;
    try {
      tokenData = JSON.parse(tokenResult);
    } catch(e) {
      return; // Keep polling
    }

    if (tokenData.error === 'authorization_pending') {
      return; // Keep polling
    }

    if (tokenData.error === 'slow_down') {
      return; // Keep polling (GitHub wants us to slow down)
    }

    if (tokenData.error) {
      clearInterval(pollInterval);
      output("Error: " + tokenData.error_description);
      return;
    }

    if (tokenData.access_token) {
      clearInterval(pollInterval);

      // Get username
      const userResult = await Studio.github._exec(
        'curl -s -H "Authorization: token ' + tokenData.access_token + '" https://api.github.com/user'
      );
      let userData;
      try {
        userData = JSON.parse(userResult);
      } catch(e) {
        userData = { login: 'unknown' };
      }

      saveAuth({ token: tokenData.access_token, username: userData.login });
      output("Signed in as: " + userData.login);
      render();
    }
  }, pollMs);
}

window.cancelDeviceFlow = function() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    output("Sign-in cancelled.");
  }
}

function render() {
  const auth = loadAuth();
  const configured = !!(auth.token && auth.username);
  const username = auth.username || "";
  const token = auth.token || "";

  var html = "<div style=\"font:14px system-ui;padding:15px;\">";
  html += "<h3 style=\"margin:0 0 15px 0;\">GitHub Authentication</h3>";

  if (configured) {
    html += "<div style=\"background:#1a3a1a;border:1px solid #2a5a2a;padding:12px;border-radius:6px;margin-bottom:15px;\">";
    html += "<b style=\"color:#4ade80;\">✓ Signed in as " + username + "</b></div>";

    html += "<div style=\"display:flex;gap:8px;margin-bottom:20px;\">";
    html += "<button onclick=\"GHAuthUI.test()\" style=\"flex:1;padding:10px;background:#238636;border:none;border-radius:4px;color:#fff;cursor:pointer;\">Test Connection</button>";
    html += "<button onclick=\"GHAuthUI.signOut()\" style=\"padding:10px 20px;background:#5a1a1a;border:none;border-radius:4px;color:#fff;cursor:pointer;\">Sign Out</button>";
    html += "</div>";
  } else {
    html += "<div style=\"background:#1a1a3a;border:1px solid #3a3a6a;padding:15px;border-radius:8px;margin-bottom:15px;text-align:center;\">";
    html += "<p style=\"margin:0 0 12px 0;color:#aaa;\">Sign in with your GitHub account</p>";
    html += "<button onclick=\"startDeviceFlow()\" style=\"padding:12px 24px;background:#238636;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:15px;font-weight:500;\">";
    html += "Sign in with GitHub</button>";
    html += "</div>";

    html += "<div style=\"border-top:1px solid #333;padding-top:15px;margin-top:10px;\">";
    html += "<p style=\"color:#666;font-size:12px;margin-bottom:10px;\">Or enter credentials manually:</p>";

    html += "<div style=\"margin-bottom:10px;\">";
    html += "<input type=\"text\" id=\"gh-username\" placeholder=\"GitHub username\" value=\"" + username + "\" ";
    html += "style=\"width:100%;padding:8px;background:#fff;border:1px solid #ccc;border-radius:4px;color:#000;margin-bottom:8px;\">";
    html += "<input type=\"password\" id=\"gh-token\" placeholder=\"Personal Access Token\" value=\"" + token + "\" ";
    html += "style=\"width:100%;padding:8px;background:#fff;border:1px solid #ccc;border-radius:4px;color:#000;\">";
    html += "<div style=\"font-size:11px;color:#666;margin-top:4px;\">";
    html += "<a href=\"https://github.com/settings/tokens/new?scopes=repo&description=FunctionServer\" target=\"_blank\" style=\"color:#88f;\">Create token</a> (needs repo scope)";
    html += "</div></div>";

    html += "<button onclick=\"GHAuthUI.save()\" style=\"width:100%;padding:8px;background:#333;border:1px solid #444;border-radius:4px;color:#fff;cursor:pointer;\">Save Manual Credentials</button>";
    html += "</div>";
  }

  html += "<pre id=\"gh-output\" style=\"margin-top:15px;background:#0d0d0d;padding:12px;border-radius:6px;min-height:60px;font-size:12px;overflow:auto;white-space:pre-wrap;color:#aaa;\"></pre>";
  html += "</div>";

  document.getElementById("gh-auth-content").innerHTML = html;
}

function output(text) {
  var el = document.getElementById("gh-output");
  if (el) el.textContent = text;
}

window.GHAuthUI = {
  save: function() {
    var username = document.getElementById("gh-username").value.trim();
    var token = document.getElementById("gh-token").value.trim();
    if (!username || !token) { output("Please enter both username and token"); return; }
    saveAuth({ username: username, token: token });
    output("Credentials saved!");
    render();
  },
  test: async function() {
    if (!GitHubAuth.isConfigured()) { output("Please sign in first"); return; }
    output("Testing connection...");
    var result = await Studio.github._exec("curl -s -H \"Authorization: token " + GitHubAuth.getToken() + "\" https://api.github.com/user");
    try {
      var data = JSON.parse(result);
      if (data.login) {
        output("✓ Connected as: " + data.login + "\nName: " + (data.name || "N/A") + "\nPublic repos: " + data.public_repos);
      } else {
        output("Auth failed: " + (data.message || "Unknown error"));
      }
    } catch(e) {
      output("Error: " + result.slice(0, 300));
    }
  },
  signOut: function() {
    if (confirm("Sign out of GitHub?")) {
      cancelDeviceFlow();
      localStorage.removeItem(STORAGE_KEY);
      output("Signed out.");
      render();
    }
  }
};

ALGO.createWindow({
  title: "GitHub Auth",
  icon: "🔐",
  width: W,
  height: H,
  content: "<div id=\"gh-auth-content\" style=\"width:100%;height:100%;overflow:auto;background:#1a1a2e;color:#fff;\"></div>"
});

render();
