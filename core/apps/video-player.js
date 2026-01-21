// System App: Video Player
// YouTube/Vimeo video player with playlist
ALGO.app.name = 'Video Player';
ALGO.app.icon = '📺';

const _vp_state = { videos: [], currentVideo: -1, winId: null };

function _vp_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : 0;
  _vp_state.winId = id;

  ALGO.createWindow({
    title: 'Video Player',
    icon: '📺',
    width: 480,
    height: 420,
    content: '<div class="video-player">' +
      '<div class="video-display" id="vp-display-' + id + '">' +
        '<span class="no-video">No video loaded</span>' +
      '</div>' +
      '<div class="video-controls">' +
        '<button class="video-btn" onclick="_vp_prev(' + id + ')">Prev</button>' +
        '<button class="video-btn" onclick="_vp_next(' + id + ')">Next</button>' +
        '<span style="flex:1;"></span>' +
        '<span id="vp-info-' + id + '" style="font-size:10px;color:#666;">0 / 0</span>' +
      '</div>' +
      '<div class="video-playlist" id="vp-playlist-' + id + '">' +
        '<div style="padding:10px;text-align:center;color:#666;">Loading videos...</div>' +
      '</div>' +
    '</div>',
    onClose: () => { _vp_state.winId = null; }
  });

  _vp_load(id);
}

function _vp_load(id) {
  fetch('/api/media?type=video')
    .then(r => r.json())
    .then(data => {
      _vp_state.videos = data.video || [];
      _vp_render(id);
      _vp_updateInfo(id);
    })
    .catch(e => {
      const playlist = document.getElementById('vp-playlist-' + id);
      if (playlist) playlist.innerHTML = '<div style="padding:10px;text-align:center;color:#f00;">Error loading videos</div>';
    });
}

function _vp_render(id) {
  const playlist = document.getElementById('vp-playlist-' + id);
  if (!playlist) return;
  const esc = typeof escapeHtml === 'function' ? escapeHtml : (s => s);

  if (_vp_state.videos.length === 0) {
    playlist.innerHTML = '<div style="padding:10px;text-align:center;color:#666;">No videos found.<br>Post YouTube/Vimeo links!</div>';
    return;
  }

  playlist.innerHTML = _vp_state.videos.map((v, i) =>
    '<div class="video-item' + (i === _vp_state.currentVideo ? ' active' : '') + '" onclick="_vp_select(' + i + ',' + id + ')">' +
      (v.thumbUrl ? '<img class="video-thumb" src="' + v.thumbUrl + '" alt="">' : '<div class="video-thumb">📺</div>') +
      '<div class="video-info">' +
        '<div class="video-title">' + esc(v.title || 'Video ' + (i+1)) + '</div>' +
        '<div class="video-source">' + esc(v.platform || v.source || 'Unknown') + '</div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function _vp_select(idx, id) {
  _vp_state.currentVideo = idx;
  _vp_render(id);
  _vp_play(id);
}

function _vp_play(id) {
  const display = document.getElementById('vp-display-' + id);
  if (!display) return;

  if (_vp_state.currentVideo < 0 || _vp_state.currentVideo >= _vp_state.videos.length) {
    display.innerHTML = '<span class="no-video">No video selected</span>';
    return;
  }

  const video = _vp_state.videos[_vp_state.currentVideo];
  if (!video.embedUrl) {
    display.innerHTML = '<span class="no-video">Cannot embed this video</span>';
    return;
  }

  display.innerHTML = '<iframe src="' + video.embedUrl + '" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
  _vp_updateInfo(id);
}

function _vp_prev(id) {
  if (_vp_state.videos.length === 0) return;
  _vp_state.currentVideo--;
  if (_vp_state.currentVideo < 0) _vp_state.currentVideo = _vp_state.videos.length - 1;
  _vp_render(id);
  _vp_play(id);
}

function _vp_next(id) {
  if (_vp_state.videos.length === 0) return;
  _vp_state.currentVideo++;
  if (_vp_state.currentVideo >= _vp_state.videos.length) _vp_state.currentVideo = 0;
  _vp_render(id);
  _vp_play(id);
}

function _vp_updateInfo(id) {
  const info = document.getElementById('vp-info-' + id);
  if (info) {
    const current = _vp_state.currentVideo >= 0 ? _vp_state.currentVideo + 1 : 0;
    info.textContent = current + ' / ' + _vp_state.videos.length;
  }
}

// Run the app
_vp_open();
