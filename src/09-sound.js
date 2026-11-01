const sfx = (() => {
  let ac = null, master = null, noiseBuf = null, comp = null;
  const loops = {};
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5;
    master = ac.createGain();
    master.gain.value = S.sound ? 0.8 : 0;
    master.connect(comp); comp.connect(ac.destination);
    const len = ac.sampleRate * 2;
    noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.15 * w; d[i] = w * 0.45 + b * 0.55; }
    makeLoop('wind', 'bandpass', 420, 0.6);
    makeLoop('rain', 'highpass', 1800, 0.3);
    makeLoop('fire', 'bandpass', 900, 1.4);
    makeLoop('rumble', 'lowpass', 90, 0.8);
    makeLoop('roar', 'lowpass', 260, 0.9);
  }
  function noise(dur) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = dur > 1.9; return s; }
  function makeLoop(name, type, freq, q) {
    const src = noise(10); src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(0, Math.random() * 1.5);
    loops[name] = { g, f, cur: 0 };
  }
  function setLoop(name, v, freq) {
    const l = loops[name];
    if (!l) return;
    if (Math.abs(v - l.cur) > 0.004) { l.g.gain.setTargetAtTime(v, ac.currentTime, 0.25); l.cur = v; }
    if (freq) l.f.frequency.setTargetAtTime(freq, ac.currentTime, 0.3);
  }
  function dist(x, y, z) { return camera.position.distanceTo(tmpV.set(x, y, z)); }
  function spatial(x, y, z) {
    const d = dist(x, y, z);
    return { gain: 1 / (1 + d / 260), delay: Math.min(2.4, d / 343) * (S.slowmo ? 2.5 : 1), d };
  }
  function boom(x, y, z, size) {
    if (!ac || !S.sound) return;
    const sp = spatial(x, y, z), t0 = ac.currentTime + sp.delay;
    const g = sp.gain * (0.6 + size * 0.9);
    const src = noise(3);
    const f = ac.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2400 * (1 - Math.min(0.75, sp.d / 2400)), t0);
    f.frequency.exponentialRampToValueAtTime(110, t0 + 1.4 + size);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(g, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 2 + size * 2.2);
    src.connect(f); f.connect(env); env.connect(master);
    src.start(t0); src.stop(t0 + 4.5 + size * 2);
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(72, t0); o.frequency.exponentialRampToValueAtTime(26, t0 + 1.2);
    const og = ac.createGain();
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(g * 1.3, t0 + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4 + size);
    o.connect(og); og.connect(master); o.start(t0); o.stop(t0 + 3 + size);
  }
  function whistle(dur) {
    if (!ac || !S.sound) return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2100, t0); o.frequency.exponentialRampToValueAtTime(380, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function roarFor(v) { if (ac) setLoop('roar', v * (S.sound ? 1 : 0)); }
  function collapse(x, y, z, size) {
    if (!ac || !S.sound) return;
    const sp = spatial(x, y, z), t0 = ac.currentTime + sp.delay;
    const src = noise(3);
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(sp.gain * (0.35 + size * 0.5), t0 + 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
    src.connect(f); f.connect(env); env.connect(master);
    src.start(t0, Math.random()); src.stop(t0 + 2.8);
  }
  function thunder(x, y, z) {
    if (!ac || !S.sound) return;
    const sp = spatial(x, y, z), t0 = ac.currentTime + sp.delay;
    const src = noise(3);
    const f = ac.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t0); f.frequency.exponentialRampToValueAtTime(140, t0 + 2.5);
    const env = ac.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(sp.gain * 1.2 + 0.15, t0 + 0.02);
    env.gain.setTargetAtTime(sp.gain * 0.4, t0 + 0.1, 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
    src.connect(f); f.connect(env); env.connect(master);
    src.start(t0); src.stop(t0 + 3.8);
  }
  let sirenNode = null;
  function siren(on) {
    if (!ac) return;
    if (on && !sirenNode && S.sound) {
      const o = ac.createOscillator(); o.type = 'triangle';
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.7;
      const lg = ac.createGain(); lg.gain.value = 230;
      o.frequency.value = 820;
      lfo.connect(lg); lg.connect(o.frequency);
      const g = ac.createGain(); g.gain.value = 0.018;
      o.connect(g); g.connect(master);
      o.start(); lfo.start();
      sirenNode = { o, lfo, g };
    } else if ((!on || !S.sound) && sirenNode) {
      sirenNode.g.gain.setTargetAtTime(0, ac.currentTime, 0.2);
      const n = sirenNode; sirenNode = null;
      setTimeout(() => { try { n.o.stop(); n.lfo.stop(); } catch (e) {} }, 800);
    }
  }
  function ambience(fireCount, quakeK) {
    if (!ac) return;
    const on = S.sound ? 1 : 0;
    const ws = S.wind.length();
    setLoop('wind', on * Math.min(0.5, 0.012 + ws * ws * 0.0006), 300 + ws * 18);
    setLoop('rain', on * S.storm * 0.22);
    setLoop('fire', on * Math.min(0.28, fireCount * 0.004));
    setLoop('rumble', on * Math.min(1, quakeK) * 0.9);
  }
  function setEnabled(v) {
    if (!ac) return;
    master.gain.setTargetAtTime(v ? 0.8 : 0, ac.currentTime, 0.1);
    if (!v) siren(false);
  }
  return { init, boom, whistle, collapse, thunder, siren, ambience, roarFor, setEnabled, get ready() { return !!ac; } };
})();
