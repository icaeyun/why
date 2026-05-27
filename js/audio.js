const SUNNY_AUDIO_URL = "https://qxrrstnreesgmpopzbzm.supabase.co/storage/v1/object/public/nightdrive/forest.mp4";
const RAIN_AUDIO_URL  = "https://qxrrstnreesgmpopzbzm.supabase.co/storage/v1/object/public/nightdrive/rain.mp4";

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

let _audio    = null;
let _muted    = false;
let _unlocked = false;

function _tryPlay() {
  if (!_audio || _muted || !_unlocked) return;
  _audio.play().catch(() => {});
}

// onWeatherToggle(mode) is called by the weather button with the new mode string
export function initAudio(onWeatherToggle) {
  _audio = new Audio();
  _audio.loop   = true;
  _audio.volume = 0.35;
  _audio.src    = RAIN_AUDIO_URL;

  // Autoplay unlock: play after first user gesture
  const EVENTS = ["scroll", "click", "touchstart", "keydown"];
  const unlock = () => {
    if (_unlocked) return;
    _unlocked = true;
    _tryPlay();
    EVENTS.forEach(e => window.removeEventListener(e, unlock));
  };
  EVENTS.forEach(e => window.addEventListener(e, unlock, { passive: true }));

  // Build sound panel UI
  let curMode = "rain";
  let wxBtn   = null;
  let muteBtn = null;

  const panel = document.createElement("div");
  panel.id = "soundPanel";

  wxBtn = document.createElement("button");
  wxBtn.className   = "sound-btn";
  wxBtn.title       = "Toggle weather";
  wxBtn.innerHTML   = ICON_RAIN;
  wxBtn.onclick     = () => onWeatherToggle(curMode === "rain" ? "sunny" : "rain");
  panel.appendChild(wxBtn);

  muteBtn = document.createElement("button");
  muteBtn.className   = "sound-btn";
  muteBtn.title       = "Toggle sound";
  muteBtn.innerHTML   = ICON_VOL;
  muteBtn.onclick     = () => {
    _muted = !_muted;
    if (_muted) {
      if (_audio) _audio.pause();
    } else {
      _tryPlay();
    }
    muteBtn.innerHTML = _muted ? ICON_MUTE : ICON_VOL;
    muteBtn.classList.toggle("muted", _muted);
  };
  panel.appendChild(muteBtn);

  document.body.appendChild(panel);

  // Return controller so main.js can sync mode changes
  return {
    setMode(mode) {
      curMode = mode;
      if (_audio) {
        _audio.src = mode === "rain" ? RAIN_AUDIO_URL : SUNNY_AUDIO_URL;
        _tryPlay();
      }
      if (wxBtn) wxBtn.innerHTML = mode === "rain" ? ICON_RAIN : ICON_SUN;
    },
  };
}
