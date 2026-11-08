export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  resume(): void {
    try {
      if (!this.ctx) {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 0.2;
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.2;
  }

  shot(): void {
    this.blip(140, 0.09, 'square', 0.2);
    this.noise(0.12, 900);
  }

  hit(): void {
    this.blip(90, 0.08, 'sawtooth', 0.12);
  }

  splash(): void {
    this.noise(0.16, 1800);
  }

  pickup(): void {
    this.blip(520, 0.07, 'triangle', 0.08);
    window.setTimeout(() => this.blip(760, 0.09, 'triangle', 0.07), 70);
  }

  private blip(freq: number, duration: number, type: OscillatorType, gain: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, this.ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private noise(duration: number, cutoff: number): void {
    if (!this.ctx || !this.master || this.muted) return;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const amp = this.ctx.createGain();
    amp.gain.value = 0.18;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
  }
}
