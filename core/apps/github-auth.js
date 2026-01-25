// GitHub Auth - Manage GitHub credentials for FunctionServer

const W = 450, H = 400;
const STORAGE_KEY = "fs_github_auth";

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

function render() {
  const auth = loadAuth();
  const configured = !!(auth.token && auth.username);
  const username = auth.username || "";
  const token = auth.token || "";

  var html = "<div style=\"font:14px system-ui;padding:15px;\">";
  html += "<h3 style=\"margin:0 0 15px 0;\">GitHub Authentication</h3>";

  if (configured) {
    html += "<div style=\"background:#1a3a1a;border:1px solid #2a5a2a;padding:10px;border-radius:6px;margin-bottom:15px;\">";
    html += "<b>Configured</b><br>Username: <code>" + username + "</code></div>";
  } else {
    html += "<div style=\"background:#3a1a1a;border:1px solid #5a2a2a;padding:10px;border-radius:6px;margin-bottom:15px;\">";
    html += "<b>Not configured</b><br>Enter your GitHub credentials below.</div>";
  }

  html += "<div style=\"margin-bottom:12px;\">";
  html += "<label style=\"display:block;margin-bottom:4px;color:#aaa;\">GitHub Username:</label>";
  html += "<input type=\"text\" id=\"gh-username\" value=\"" + username + "\" ";
  html += "style=\"width:100%;padding:8px;background:#1a1a2e;border:1px solid #444;border-radius:4px;color:#fff;\">";
  html += "</div>";

  html += "<div style=\"margin-bottom:12px;\">";
  html += "<label style=\"display:block;margin-bottom:4px;color:#aaa;\">Personal Access Token:</label>";
  html += "<input type=\"password\" id=\"gh-token\" value=\"" + token + "\" ";
  html += "style=\"width:100%;padding:8px;background:#1a1a2e;border:1px solid #444;border-radius:4px;color:#fff;\">";
  html += "<div style=\"font-size:11px;color:#888;margin-top:4px;\">";
  html += "Create at: <a href=\"https://github.com/settings/tokens/new\" target=\"_blank\" style=\"color:#88f;\">github.com/settings/tokens</a> (needs repo scope)";
  html += "</div></div>";

  html += "<div style=\"display:flex;gap:8px;margin-top:15px;\">";
  html += "<button onclick=\"GHAuthUI.save()\" style=\"flex:1;padding:10px;background:#238636;border:none;border-radius:4px;color:#fff;cursor:pointer;\">Save</button>";
  html += "<button onclick=\"GHAuthUI.test()\" style=\"flex:1;padding:10px;background:#1a1a2e;border:1px solid #444;border-radius:4px;color:#fff;cursor:pointer;\">Test</button>";
  html += "<button onclick=\"GHAuthUI.clear()\" style=\"padding:10px;background:#5a1a1a;border:none;border-radius:4px;color:#fff;cursor:pointer;\">Clear</button>";
  html += "</div>";

  html += "<pre id=\"gh-output\" style=\"margin-top:12px;background:#1a1a2e;padding:10px;border-radius:4px;min-height:80px;font-size:12px;overflow:auto;white-space:pre-wrap;\"></pre>";
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
    if (!GitHubAuth.isConfigured()) { output("Please save credentials first"); return; }
    output("Testing authentication...");
    var result = await Studio.github._exec("curl -s -H \"Authorization: token " + GitHubAuth.getToken() + "\" https://api.github.com/user");
    try {
      var data = JSON.parse(result);
      if (data.login) {
        output("Authenticated as: " + data.login + "\nName: " + (data.name || "N/A") + "\nPublic repos: " + data.public_repos);
      } else {
        output("Auth failed: " + (data.message || "Unknown error"));
      }
    } catch(e) {
      output("Response: " + result.slice(0, 300));
    }
  },
  clear: function() {
    if (confirm("Clear saved GitHub credentials?")) {
      localStorage.removeItem(STORAGE_KEY);
      output("Credentials cleared");
      render();
    }
  }
};

ALGO.createWindow({
  title: "GitHub Auth",
  icon: "🔐",
  width: W,
  height: H,
  content: "<div id=\"gh-auth-content\" style=\"width:100%;height:100%;overflow:auto;\"></div>"
});

render();
