const SUNNY_AUDIO_URL       = "https://qxrrstnreesgmpopzbzm.supabase.co/storage/v1/object/public/nightdrive/forest.mp4";
const RAIN_AUDIO_URL        = "https://qxrrstnreesgmpopzbzm.supabase.co/storage/v1/object/public/nightdrive/rain.mp4";
const INDOOR_RAIN_AUDIO_URL = "https://qxrrstnreesgmpopzbzm.supabase.co/storage/v1/object/public/nightdrive/Video%20Projects.mp4";

const VOL_OUTDOOR = 0.35;
const VOL_INDOOR  = 0.58;   // indoor louder
const FADE_MS     = 700;    // fade-out duration ms
const FADE_STEPS  = 24;

const ICON_RAIN = [
  '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"',
  ' stroke="currentColor" stroke-width="1.3" stroke-linecap="round">',
  '<path d="M3.5 9.5A3 3 0 1 1 7 6.5 3.5 3.5 0 1 1 12 9H3.5z"/>',
  '<line x1="4.5" y1="11.5" x2="4" y2="13.5"/>',
  '<line x1="7.5" y1="11.5" x2="7" y2="13.5"/>',
  '<line x1="10.5" y1="11.5" x2="10" y2="13.5"/>',
  '</svg>',
].join("");

const ICON_SUN = [
  '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"',
  ' stroke="currentColor" stroke-width="1.3" stroke-linecap="round">',
  '<circle cx="7.5" cy="7.5" r="2.5"/>',
  '<line x1="7.5" y1="1" x2="7.5" y2="2.5"/>',
  '<line x1="7.5" y1="12.5" x2="7.5" y2="14"/>',
  '<line x1="1" y1="7.5" x2="2.5" y2="7.5"/>',
  '<line x1="12.5" y1="7.5" x2="14" y2="7.5"/>',
  '<line x1="3.11" y1="3.11" x2="4.17" y2="4.17"/>',
  '<line x1="10.83" y1="10.83" x2="11.89" y2="11.89"/>',
  '<line x1="11.89" y1="3.11" x2="10.83" y2="4.17"/>',
  '<line x1="4.17" y1="10.83" x2="3.11" y2="11.89"/>',
  '</svg>',
].join("");

const ICON_VOL = [
  '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"',
  ' stroke="currentColor" stroke-width="1.3"',
  ' stroke-linecap="round" stroke-linejoin="round">',
  '<polygon points="1.5,5 4.5,5 7.5,2.5 7.5,12.5 4.5,10 1.5,10"/>',
  '<path d="M9.5 5.5a3.5 3.5 0 0 1 0 4"/>',
  '<path d="M11.5 3.5a6.5 6.5 0 0 1 0 8"/>',
  '</svg>',
].join("");

const ICON_MUTE = [
  '<svg width="15" height="15" viewBox="0 0 15 15" fill="none"',
  ' stroke="currentColor" stroke-width="1.3"',
  ' stroke-linecap="round" stroke-linejoin="round">',
  '<polygon points="1.5,5 4.5,5 7.5,2.5 7.5,12.5 4.5,10 1.5,10"/>',
  '<line x1="10" y1="6" x2="14" y2="10"/>',
  '<line x1="14" y1="6" x2="10" y2="10"/>',
  '</svg>',
].join("");

// ── State ─────────────────────────────────────────────────────────────────────
let _audio      = null;
let _muted      = false;
let _unlocked   = false;
let _currentUrl = "";
let _curMode    = "sunny";
let _isInside   = false;
let _fadeTimer  = null;
let _targetVol  = VOL_OUTDOOR;

// ── Helpers ───────────────────────────────────────────────────────────────────
function _urlFor(mode, inside) {
  if (mode !== "rain") return SUNNY_AUDIO_URL;
  return inside ? INDOOR_RAIN_AUDIO_URL : RAIN_AUDIO_URL;
}

function _volFor(mode, inside) {
  return (mode === "rain" && inside) ? VOL_INDOOR : VOL_OUTDOOR;
}

function _cancelFade() {
  if (_fadeTimer) { clearInterval(_fadeTimer); _fadeTimer = null; }
}

// Gradually change _audio.volume from current to `to`, then call onDone
function _fadeTo(to, onDone) {
  _cancelFade();
  if (!_audio) { if (onDone) onDone(); return; }
  const from  = _audio.volume;
  const delta = to - from;
  if (Math.abs(delta) < 0.005) { _audio.volume = to; if (onDone) onDone(); return; }
  const step = FADE_MS / FADE_STEPS;
  let i = 0;
  _fadeTimer = setInterval(() => {
    i++;
    _audio.volume = Math.max(0, Math.min(1, from + delta * (i / FADE_STEPS)));
    if (i >= FADE_STEPS) {
      _cancelFade();
      _audio.volume = to;
      if (onDone) onDone();
    }
  }, step);
}

// Immediate hard switch (for weather-mode changes — no fade needed)
function _switchNow(url, targetVol, debugInfo) {
  _cancelFade();
  if (url === _currentUrl) { _targetVol = targetVol; return; }
  console.log("[AUDIO SWITCH]", { ...debugInfo, url });
  _currentUrl = url;
  _targetVol  = targetVol;
  _audio.pause();
  _audio.src    = url;
  _audio.load();
  _audio.volume = _muted ? 0 : targetVol;
  if (_unlocked && !_muted) _audio.play().catch(e => console.warn("[AUDIO]", e));
}

// Fade-out current → swap src → fade-in (for location transitions)
function _crossfade(url, targetVol, debugInfo) {
  if (url === _currentUrl) return;
  _targetVol = targetVol;
  _fadeTo(0, () => {
    console.log("[AUDIO SWITCH]", { ...debugInfo, url });
    _currentUrl   = url;
    _audio.pause();
    _audio.src    = url;
    _audio.load();
    _audio.volume = 0;
    if (_unlocked && !_muted) {
      _audio.play().catch(e => console.warn("[AUDIO]", e));
    }
    _fadeTo(targetVol, null);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────
export function initAudio(onWeatherToggle) {
  _audio        = new Audio();
  _audio.loop   = true;
  _audio.volume = VOL_OUTDOOR;

  const EVENTS = ["scroll", "click", "touchstart", "keydown"];
  const unlock = () => {
    if (_unlocked) return;
    _unlocked = true;
    EVENTS.forEach(e => window.removeEventListener(e, unlock));
    if (!_muted && _currentUrl) {
      _audio.volume = _targetVol;
      _audio.play().catch(e => console.warn("[AUDIO] unlock:", e));
    }
  };
  EVENTS.forEach(e => window.addEventListener(e, unlock, { passive: true }));

  let wxBtn = null, muteBtn = null;
  const panel = document.createElement("div");
  panel.id = "soundPanel";

  wxBtn = document.createElement("button");
  wxBtn.className = "sound-btn";
  wxBtn.title     = "Toggle weather";
  wxBtn.innerHTML = ICON_SUN;
  wxBtn.onclick   = () => onWeatherToggle(_curMode === "rain" ? "sunny" : "rain");
  panel.appendChild(wxBtn);

  muteBtn = document.createElement("button");
  muteBtn.className = "sound-btn";
  muteBtn.title     = "Toggle sound";
  muteBtn.innerHTML = ICON_VOL;
  muteBtn.onclick = () => {
    _muted = !_muted;
    _cancelFade();
    if (_muted) {
      _audio.pause();
    } else if (_unlocked && _currentUrl) {
      _audio.volume = _targetVol;
      _audio.play().catch(() => {});
    }
    muteBtn.innerHTML = _muted ? ICON_MUTE : ICON_VOL;
    muteBtn.classList.toggle("muted", _muted);
  };
  panel.appendChild(muteBtn);
  document.body.appendChild(panel);

  return {
    // Called on weather toggle — hard switch, no fade
    setMode(mode) {
      _curMode = mode;
      const url = _urlFor(_curMode, _isInside);
      const vol = _volFor(_curMode, _isInside);
      _switchNow(url, vol, { mode: _curMode, inside: _isInside });
      if (wxBtn) wxBtn.innerHTML = _curMode === "rain" ? ICON_RAIN : ICON_SUN;
    },

    // Called on inside/outside state change — crossfade
    setLocation(inside) {
      if (inside === _isInside) return;
      _isInside = inside;
      if (_curMode !== "rain") return;
      const url = _urlFor(_curMode, _isInside);
      const vol = _volFor(_curMode, _isInside);
      _crossfade(url, vol, { mode: _curMode, inside: _isInside });
    },
  };
}
