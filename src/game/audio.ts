export interface AudioGate {
  muted: boolean;
  unlocked: boolean;
  context: 'none' | 'suspended' | 'running' | 'closed' | 'interrupted';
}

export interface AudioStatus extends AudioGate {
  voices: number;
  audible: boolean;
  level: number;
}

/** Sound is allowed only after a gesture unlocks a running context and mute is off. */
export function audioCanSound(gate: AudioGate): boolean {
  return gate.unlocked && !gate.muted && gate.context === 'running';
}

export class Sfx {
  muted = false;
  private unlocked = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private wind: GainNode | null = null;
  private voices = 0;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private readonly motif = [196, 247, 220, 294, 262, 330, 294, 220];

  status(): AudioStatus {
    const context = this.ctx?.state ?? 'none';
    const gate: AudioGate = { muted: this.muted, unlocked: this.unlocked, context };
    return { ...gate, voices: this.voices, audible: audioCanSound(gate), level: this.level() };
  }

  /** Call from a click, key, or touch. Creates the context synchronously inside that gesture. */
  unlock(): void {
    this.unlocked = true;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().then(() => this.onRunning());
    else this.onRunning();
  }

  resume(): void {
    this.unlock();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      const target = muted ? 0 : 0.9;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
    }
    if (!muted && this.unlocked) this.unlock();
  }

  setWind(intensity: number): void {
    if (!this.wind || !this.ctx) return;
    const amount = this.muted ? 0 : Math.max(0, Math.min(1, intensity));
    this.wind.gain.setTargetAtTime(amount * 0.55, this.ctx.currentTime, 0.08);
  }

  shot(power = 1): void {
    if (!this.canPlay()) return;
    this.voices += 1;
    this.tone(78, 0.2, 'square', 0.34 * power);
    this.tone(156, 0.11, 'sawtooth', 0.12 * power);
    this.noise(0.24, 680, 0.5 * power);
  }

  hit(): void {
    if (!this.canPlay()) return;
    this.voices += 1;
    this.tone(64, 0.16, 'sawtooth', 0.28);
    this.noise(0.18, 420, 0.36);
  }

  splash(): void {
    if (!this.canPlay()) return;
    this.voices += 1;
    this.noise(0.32, 900, 0.42);
  }

  pickup(): void {
    if (!this.canPlay()) return;
    this.voices += 1;
    this.tone(523, 0.09, 'triangle', 0.16);
    this.tone(784, 0.14, 'triangle', 0.12, 0.08);
  }

  /** Holds a tone long enough for an analyser to measure energy. */
  debugTone(): void {
    this.unlock();
    if (!this.canPlay()) return;
    this.voices += 1;
    this.tone(440, 0.45, 'triangle', 0.22);
  }

  private canPlay(): boolean {
    return audioCanSound(this.status());
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    try {
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.9;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 8;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.18;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      master.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.analyser = analyser;
      return ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  private onRunning(): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.startSea();
    this.startWind();
    this.startBed();
  }

  private startSea(): void {
    if (!this.ctx || !this.master || this.seaStarted) return;
    this.seaStarted = true;
    const seconds = 2;
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    const amp = this.ctx.createGain();
    amp.gain.value = 0.42;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
  }

  private seaStarted = false;

  private startWind(): void {
    if (!this.ctx || !this.master || this.wind) return;
    const seconds = 2;
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.6;
    const amp = this.ctx.createGain();
    amp.gain.value = 0;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
    this.wind = amp;
  }

  private startBed(): void {
    if (this.musicTimer !== null) return;
    this.musicTimer = window.setInterval(() => {
      if (!this.canPlay()) return;
      const freq = this.motif[this.musicStep % this.motif.length] ?? 220;
      this.musicStep += 1;
      this.tone(freq, 1.05, 'triangle', 0.05);
      this.tone(freq / 2, 1.3, 'sine', 0.035);
    }, 1500);
  }

  level(): number {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    return Math.sqrt(sum / data.length);
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const start = this.ctx.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(duration: number, cutoff: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, this.ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
  }
}
