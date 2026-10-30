/**
 * Procedural ambient soundscape, generated in the browser without audio files:
 * wind through grass, birdsong by day, crickets at night, a muffled hearth indoors
 * and dripping stone underground. Everything is optional and starts only on user request.
 */
export type SoundMood = { daylight: number; outdoors: boolean; underground: boolean; rain: number };

export interface Soundscape {
  update(mood: SoundMood): void;
  stop(): void;
}

function noiseBuffer(context: AudioContext, seconds: number, brown = false): AudioBuffer {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + .02 * white) / 1.02; data[i] = last * 3.2; } else data[i] = white;
  }
  return buffer;
}

export function startSoundscape(context: AudioContext): Soundscape {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  master.gain.linearRampToValueAtTime(.9, context.currentTime + 2.5);

  // Wind: looped brown noise through a slowly breathing band-pass filter.
  const wind = context.createBufferSource();
  wind.buffer = noiseBuffer(context, 6, true); wind.loop = true;
  const windFilter = context.createBiquadFilter(); windFilter.type = "bandpass"; windFilter.frequency.value = 420; windFilter.Q.value = .6;
  const windGain = context.createGain(); windGain.gain.value = .0;
  const windLfo = context.createOscillator(); windLfo.frequency.value = .07;
  const windLfoDepth = context.createGain(); windLfoDepth.gain.value = 180;
  windLfo.connect(windLfoDepth).connect(windFilter.frequency);
  wind.connect(windFilter).connect(windGain).connect(master);
  wind.start(); windLfo.start();

  // Rain: white noise, high-passed, mixed in only during wet weather.
  const rain = context.createBufferSource();
  rain.buffer = noiseBuffer(context, 3); rain.loop = true;
  const rainFilter = context.createBiquadFilter(); rainFilter.type = "highpass"; rainFilter.frequency.value = 1800;
  const rainGain = context.createGain(); rainGain.gain.value = 0;
  rain.connect(rainFilter).connect(rainGain).connect(master); rain.start();

  // Hearth: low crackle bed used indoors.
  const hearth = context.createBufferSource();
  hearth.buffer = noiseBuffer(context, 4, true); hearth.loop = true;
  const hearthFilter = context.createBiquadFilter(); hearthFilter.type = "lowpass"; hearthFilter.frequency.value = 260;
  const hearthGain = context.createGain(); hearthGain.gain.value = 0;
  hearth.connect(hearthFilter).connect(hearthGain).connect(master); hearth.start();

  let mood: SoundMood = { daylight: 1, outdoors: true, underground: false, rain: 0 };
  let stopped = false;
  const timers: number[] = [];

  const chirp = () => {
    const now = context.currentTime, base = 2300 + Math.random() * 1900, notes = 2 + Math.floor(Math.random() * 4);
    const gain = context.createGain(); gain.gain.value = 0; gain.connect(master);
    const osc = context.createOscillator(); osc.type = "sine"; osc.connect(gain);
    for (let n = 0; n < notes; n++) {
      const t = now + n * (.09 + Math.random() * .05);
      osc.frequency.setValueAtTime(base * (1 + Math.random() * .25), t);
      osc.frequency.exponentialRampToValueAtTime(base * (.7 + Math.random() * .6), t + .07);
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.022, t + .012); gain.gain.linearRampToValueAtTime(0, t + .08);
    }
    osc.start(now); osc.stop(now + notes * .15 + .1);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  };
  const cricket = () => {
    const now = context.currentTime, pulses = 3 + Math.floor(Math.random() * 3), freq = 4200 + Math.random() * 500;
    const gain = context.createGain(); gain.gain.value = 0; gain.connect(master);
    const osc = context.createOscillator(); osc.type = "triangle"; osc.frequency.value = freq; osc.connect(gain);
    for (let p = 0; p < pulses; p++) {
      const t = now + p * .055;
      gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.009, t + .008); gain.gain.linearRampToValueAtTime(0, t + .035);
    }
    osc.start(now); osc.stop(now + pulses * .06 + .05);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  };
  const drip = () => {
    const now = context.currentTime, gain = context.createGain(), osc = context.createOscillator();
    osc.type = "sine"; osc.frequency.setValueAtTime(900 + Math.random() * 500, now); osc.frequency.exponentialRampToValueAtTime(300, now + .12);
    gain.gain.setValueAtTime(.03, now); gain.gain.exponentialRampToValueAtTime(.0001, now + .25);
    osc.connect(gain).connect(master); osc.start(now); osc.stop(now + .3);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  };
  const schedule = () => {
    if (stopped) return;
    const night = mood.daylight < .12;
    if (mood.underground) { if (Math.random() < .5) drip(); }
    else if (mood.outdoors && mood.rain < .5) {
      if (!night && Math.random() < .55 + mood.daylight * .3) chirp();
      if (night) for (let i = 0; i < 2; i++) if (Math.random() < .8) timers.push(window.setTimeout(cricket, Math.random() * 600));
    }
    timers.push(window.setTimeout(schedule, mood.underground ? 1400 + Math.random() * 2600 : night ? 700 + Math.random() * 600 : 1600 + Math.random() * 3400));
    if (timers.length > 40) timers.splice(0, 20);
  };
  schedule();

  return {
    update(next) {
      if (stopped) return;
      mood = next;
      const t = context.currentTime + .8;
      const outdoorWind = mood.outdoors ? .05 + (1 - mood.daylight) * .015 + mood.rain * .04 : .012;
      windGain.gain.linearRampToValueAtTime(mood.underground ? .03 : outdoorWind, t);
      windFilter.frequency.linearRampToValueAtTime(mood.outdoors ? 420 : 220, t);
      rainGain.gain.linearRampToValueAtTime(mood.outdoors ? mood.rain * .05 : mood.rain * .012, t);
      hearthGain.gain.linearRampToValueAtTime(!mood.outdoors && !mood.underground ? .05 : 0, t);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      timers.forEach(clearTimeout); timers.length = 0;
      for (const source of [wind, rain, hearth, windLfo]) { try { source.stop(); } catch { /* already stopped */ } }
      master.disconnect();
    },
  };
}
