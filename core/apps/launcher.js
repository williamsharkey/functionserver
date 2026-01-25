// FunctionServer Launcher - Quick access to all tools
// Load this first in fresh sessions

const W = 350, H = 320;

const apps = [
  { name: "Studio", icon: "⚡", file: "studio.js", desc: "Code editor with Lens" },
  { name: "Project Manager", icon: "📁", file: "project-manager.js", desc: "Git repos & projects" },
  { name: "GitHub Auth", icon: "🔐", file: "github-auth.js", desc: "Configure GitHub token" },
  { name: "Code Metrics", icon: "📊", file: "code-metrics.js", desc: "Analyze code stats" }
];

function render() {
  var html = "<div style=\"font:14px system-ui;padding:15px;\">";
  html += "<h3 style=\"margin:0 0 10px 0;\">FunctionServer Tools</h3>";
  html += "<div style=\"font-size:12px;color:#888;margin-bottom:15px;\">Click to launch. For AI: use Lens.help()</div>";

  apps.forEach(function(app) {
    html += "<div onclick=\"Launcher.open('" + app.file + "')\" style=\"padding:12px;margin-bottom:8px;background:#1a1a2e;border:1px solid #333;border-radius:6px;cursor:pointer;\">";
    html += "<div style=\"font-size:18px;float:left;margin-right:12px;\">" + app.icon + "</div>";
    html += "<div><b>" + app.name + "</b><br><span style=\"font-size:12px;color:#888;\">" + app.desc + "</span></div>";
    html += "<div style=\"clear:both;\"></div></div>";
  });

  html += "<div style=\"margin-top:15px;padding-top:10px;border-top:1px solid #333;font-size:11px;color:#666;\">";
  html += "Tip: <code>Lens.help()</code> for AI commands<br>";
  html += "Docs: <a href=\"https://functionserver.com/thehappypath.html\" target=\"_blank\" style=\"color:#88f;\">The Happy Path</a>";
  html += "</div></div>";

  document.getElementById("launcher-content").innerHTML = html;
}

window.Launcher = {
  open: function(file) {
    getFileFromDisk("~/" + file).then(function(code) {
      runApp(code, file);
    }).catch(function(e) {
      alert("Could not load " + file);
    });
  },
  loadAll: function() {
    apps.forEach(function(app) {
      Launcher.open(app.file);
    });
  }
};

ALGO.createWindow({
  title: "Launcher",
  icon: "🚀",
  width: W,
  height: H,
  content: "<div id=\"launcher-content\" style=\"width:100%;height:100%;overflow:auto;\"></div>"
});

render();

// Enhanced setupHappyPath - loads tools OR creates/opens a project
window.setupHappyPath = async function(projectName) {
  // Load core tools first
  if (typeof Studio === 'undefined') {
    await getFileFromDisk("~/studio.js").then(code => runApp(code, "studio.js"));
  }
  if (typeof PM === 'undefined') {
    await getFileFromDisk("~/project-manager.js").then(code => runApp(code, "project-manager.js"));
  }

  // If no project name, just return after loading tools
  if (!projectName) {
    console.log("Tools loaded. Use Lens.help() for commands.");
    return "Happy path ready!";
  }

  // Slugify project name: "pixel draw" -> "pixel-draw"
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const repoPath = "~/repos/" + slug;

  // Check if project exists
  const exists = await Studio.github._exec("ls " + repoPath + " 2>/dev/null && echo yes || echo no");

  if (exists.trim() === "no") {
    console.log("Creating new project: " + slug);

    // Create folder and init
    await Studio.github._exec("mkdir -p " + repoPath);
    await Studio.github._exec("git -C " + repoPath + " init");

    // Create skeleton app files
    const appCode = `// ${projectName}
ALGO.app.name = "${projectName}";
ALGO.app.icon = "*";

ALGO.createWindow({
  title: "${projectName}",
  width: 400,
  height: 300,
  content: "<div style='padding:20px'>Hello from ${projectName}!</div>"
});`;
    const readmeCode = `# ${projectName}

A FunctionServer app.

## Run

Open main.js in Studio and use Lens.run()`;

    await saveFileToDisk('repos/' + slug + '/main.js', appCode);
    await saveFileToDisk('repos/' + slug + '/README.md', readmeCode);

    // Initial commit
    await Studio.github._exec("git -C " + repoPath + " add -A");
    await Studio.github._exec("git -C " + repoPath + " commit -m \"Initial commit: " + projectName + " skeleton\"");

    // If GitHub auth configured, create repo and push
    if (typeof GitHubAuth !== 'undefined' && GitHubAuth.isConfigured()) {
      const username = GitHubAuth.getUsername();
      const token = GitHubAuth.getToken();
      console.log("Creating GitHub repo: " + username + "/" + slug);

      // Create repo via GitHub API
      const createCmd = "curl -s -X POST -H \"Authorization: token " + token + "\" " +
        "-H \"Accept: application/vnd.github.v3+json\" " +
        "https://api.github.com/user/repos -d '{\"name\":\"" + slug + "\",\"private\":false}'";
      await Studio.github._exec(createCmd);

      // Set remote and push
      const remoteUrl = "https://" + token + "@github.com/" + username + "/" + slug + ".git";
      await Studio.github._exec("git -C " + repoPath + " remote add origin " + remoteUrl);
      await Studio.github._exec("git -C " + repoPath + " push -u origin master 2>&1 || git -C " + repoPath + " push -u origin main 2>&1");
      console.log("Pushed to GitHub: github.com/" + username + "/" + slug);
    } else {
      console.log("GitHub not configured. Run GitHubAuth to enable push.");
    }
  } else {
    console.log("Opening existing project: " + slug);
  }

  // Open main.js in Studio
  Studio.close(repoPath + '/main.js'); Studio.open(repoPath + '/main.js');
  return "Project ready: " + slug;
};

console.log("[Launcher] Loaded. Use Launcher.open(file) or setupHappyPath()");
