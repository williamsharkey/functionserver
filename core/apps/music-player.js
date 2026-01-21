// System App: Music Player
ALGO.app.name = 'Music Player';
ALGO.app.icon = '🎵';

let _mp_state = { tracks: [], currentTrack: -1, isPlaying: false, audio: null, winId: null };

function _mp_open() {
  if (typeof hideStartMenu === 'function') hideStartMenu();
  const id = typeof winId !== 'undefined' ? winId : Date.now();
  _mp_state.winId = id;

  ALGO.createWindow({
    title: 'Music Player',
    icon: '🎵',
    width: 320,
    height: 400,
    content: '<div class="winamp-player">' +
      '<div class="winamp-header"><span class="title">🎵 Music Player</span></div>' +
      '<div class="winamp-display">' +
        '<div class="track-title" id="mp-title-' + id + '">No track loaded</div>' +
        '<div class="track-time" id="mp-time-' + id + '">--:-- / --:--</div>' +
      '</div>' +
      '<div class="winamp-controls">' +
        '<button class="winamp-btn" onclick="_mp_prev()" title="Previous">⏮</button>' +
        '<button class="winamp-btn" onclick="_mp_play()" id="mp-playbtn-' + id + '" title="Play">▶</button>' +
        '<button class="winamp-btn" onclick="_mp_pause()" title="Pause">⏸</button>' +
        '<button class="winamp-btn" onclick="_mp_stop()" title="Stop">⏹</button>' +
        '<button class="winamp-btn" onclick="_mp_next()" title="Next">⏭</button>' +
      '</div>' +
      '<div class="winamp-volume">' +
        '<span>🔊</span>' +
        '<input type="range" min="0" max="100" value="80" onchange="_mp_volume(this.value)">' +
        '<span id="mp-vol-' + id + '">80%</span>' +
      '</div>' +
      '<div id="mp-embed-' + id + '" style="display:none;background:#1a1a1a;margin:4px;padding:4px;border:2px inset #333;"></div>' +
      '<div class="winamp-playlist" id="mp-playlist-' + id + '">' +
        '<div style="padding:20px;text-align:center;color:#009900;">Loading tracks...</div>' +
      '</div>' +
      '<div class="winamp-status" id="mp-status-' + id + '">Loading...</div>' +
    '</div>',
    onClose: () => {
      _mp_stop();
      _mp_state.winId = null;
    }
  });

  _mp_loadTracks();
}

function _mp_loadTracks() {
  const id = _mp_state.winId;
  fetch('/api/media?type=audio')
    .then(r => r.json())
    .then(data => {
      _mp_state.tracks = data.audio || [];
      _mp_renderPlaylist();
      const status = document.getElementById('mp-status-' + id);
      if (status) status.textContent = _mp_state.tracks.length + ' track(s) found';
      _mp_updateMini();
    })
    .catch(e => {
      const status = document.getElementById('mp-status-' + id);
      if (status) status.textContent = 'Error loading tracks';
    });
}

function _mp_renderPlaylist() {
  const id = _mp_state.winId;
  const playlist = document.getElementById('mp-playlist-' + id);
  if (!playlist) return;

  if (_mp_state.tracks.length === 0) {
    playlist.innerHTML = '<div style="padding:20px;text-align:center;color:#009900;">No audio tracks found.<br>Upload .mp3 files to your public folder!</div>';
    return;
  }

  playlist.innerHTML = _mp_state.tracks.map((t, i) =>
    '<div class="winamp-track' + (i === _mp_state.currentTrack ? ' active' : '') + '" onclick="_mp_select(' + i + ')">' +
      '<span class="track-num">' + (i+1) + '.</span>' +
      '<span class="track-name">' + (typeof escapeHtml === 'function' ? escapeHtml(t.title || 'Track ' + (i+1)) : (t.title || 'Track ' + (i+1))) + '</span>' +
    '</div>'
  ).join('');
}

function _mp_select(idx) {
  _mp_state.currentTrack = idx;
  _mp_renderPlaylist();
  _mp_play();
}

function _mp_play() {
  const id = _mp_state.winId;
  if (_mp_state.tracks.length === 0) return;
  if (_mp_state.currentTrack < 0) _mp_state.currentTrack = 0;

  const track = _mp_state.tracks[_mp_state.currentTrack];
  if (!track) return;

  const title = document.getElementById('mp-title-' + id);
  const time = document.getElementById('mp-time-' + id);
  const embed = document.getElementById('mp-embed-' + id);

  if (title) title.textContent = track.title || 'Track ' + (_mp_state.currentTrack + 1);

  // Handle embedded players (Bandcamp, SoundCloud)
  if (track.type === 'bandcamp' || track.type === 'soundcloud') {
    if (_mp_state.audio) {
      _mp_state.audio.pause();
      _mp_state.audio.src = '';
    }
    if (embed) {
      embed.style.display = 'block';
      if (track.type === 'bandcamp') {
        embed.innerHTML = '<iframe style="border:0;width:100%;height:120px;" src="https://bandcamp.com/EmbeddedPlayer/' +
          (track.url.includes('/album/') ? 'album' : 'track') + '=0/size=large/bgcol=232323/linkcol=00ff00/tracklist=false/artwork=small/" seamless></iframe>';
      } else {
        embed.innerHTML = '<iframe width="100%" height="120" scrolling="no" frameborder="no" allow="autoplay" src="' + track.embedUrl + '"></iframe>';
      }
    }
    if (time) time.textContent = track.type === 'bandcamp' ? '🎸 Bandcamp' : '☁️ SoundCloud';
    _mp_state.isPlaying = true;
    _mp_renderPlaylist();
    _mp_updateMini();
    return;
  }

  // Regular audio file
  if (embed) {
    embed.style.display = 'none';
    embed.innerHTML = '';
  }

  if (!_mp_state.audio) {
    _mp_state.audio = new Audio();
    _mp_state.audio.addEventListener('timeupdate', _mp_updateTime);
    _mp_state.audio.addEventListener('ended', _mp_next);
  }

  if (_mp_state.audio.src !== track.url) {
    _mp_state.audio.src = track.url;
  }

  _mp_state.audio.play().then(() => {
    _mp_state.isPlaying = true;
    _mp_renderPlaylist();
    _mp_updateMini();
  }).catch(e => {
    const status = document.getElementById('mp-status-' + id);
    if (status) status.textContent = 'Cannot play: ' + (e.message || 'blocked');
  });
}

function _mp_pause() {
  if (_mp_state.audio) {
    _mp_state.audio.pause();
    _mp_state.isPlaying = false;
    _mp_updateMini();
  }
}

function _mp_stop() {
  if (_mp_state.audio) {
    _mp_state.audio.pause();
    _mp_state.audio.currentTime = 0;
    _mp_state.isPlaying = false;
    _mp_updateMini();
  }
  const time = document.getElementById('mp-time-' + _mp_state.winId);
  if (time) time.textContent = '--:-- / --:--';
}

function _mp_prev() {
  if (_mp_state.tracks.length === 0) return;
  _mp_state.currentTrack--;
  if (_mp_state.currentTrack < 0) _mp_state.currentTrack = _mp_state.tracks.length - 1;
  _mp_renderPlaylist();
  if (_mp_state.isPlaying) _mp_play();
}

function _mp_next() {
  if (_mp_state.tracks.length === 0) return;
  _mp_state.currentTrack++;
  if (_mp_state.currentTrack >= _mp_state.tracks.length) _mp_state.currentTrack = 0;
  _mp_renderPlaylist();
  if (_mp_state.isPlaying) _mp_play();
}

function _mp_volume(val) {
  if (_mp_state.audio) _mp_state.audio.volume = val / 100;
  const volVal = document.getElementById('mp-vol-' + _mp_state.winId);
  if (volVal) volVal.textContent = val + '%';
}

function _mp_updateTime() {
  const audio = _mp_state.audio;
  if (!audio) return;
  const time = document.getElementById('mp-time-' + _mp_state.winId);
  if (!time) return;
  const fmt = (s) => Math.floor(s/60) + ':' + (Math.floor(s%60) < 10 ? '0' : '') + Math.floor(s%60);
  time.textContent = fmt(audio.currentTime || 0) + ' / ' + fmt(audio.duration || 0);
}

function _mp_updateMini() {
  // Update taskbar mini player if available
  const miniPlayer = document.getElementById('mini-player');
  const miniTitle = document.getElementById('mini-player-title');
  const miniPlayBtn = document.getElementById('mini-play-btn');
  if (!miniPlayer) return;

  if (_mp_state.tracks.length > 0) {
    miniPlayer.classList.add('visible');
    const track = _mp_state.tracks[_mp_state.currentTrack];
    if (track && miniTitle) {
      miniTitle.textContent = '🎵 ' + (track.title || 'Track ' + (_mp_state.currentTrack + 1));
    }
    if (miniPlayBtn) miniPlayBtn.textContent = _mp_state.isPlaying ? '⏸' : '▶';
  }
}

// Export for global access (mini player controls)
window._mp_state = _mp_state;
window._mp_play = _mp_play;
window._mp_pause = _mp_pause;
window._mp_prev = _mp_prev;
window._mp_next = _mp_next;
window._mp_open = _mp_open;

// Auto-open
_mp_open();
