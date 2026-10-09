import { AUDIO } from '../config';
import { SOUND_DESIGN, type SfxKind, type Timbre } from '../data/audio';

/** One combat sound: an optional filtered noise burst and an optional pitch-swept tone. */
interface SfxDef {
  readonly noise?: {
    readonly type: BiquadFilterType;
    readonly hz: number;
    readonly decay: number;
    readonly gain: number;
  };
  readonly tone?: {
    readonly type: OscillatorType;
    readonly from: number;
    readonly to: number;
    readonly decay: number;
    readonly gain: number;
  };
}
import type { BiomeVisual } from '../data/biomeVisuals';
import { WEATHER } from '../data/weather';
import {
  ambienceLevels,
  createMusicMix,
  emptyLevels,
  midiToHz,
  musicMix,
  nextDegree,
  scaleNote,
  type AudioInputs,
} from './mix';

const NOISE_SECONDS = 2;
type Range = readonly [number, number];
const rand = (r: Range) => r[0] + Math.random() * (r[1] - r[0]);

interface MusicVoice {
  /** Index into the visuals list this voice plays. */
  index: number;
  gain: GainNode;
  nextBeat: number;
  beat: number;
  degree: number;
}

/**
 * Procedural ambience and music (plan 3.6) until real recordings are approved: a wind bed, rain,
 * low rumble, and synthesized birds, crickets, drips and chimes, all blended by where the camera
 * is; thunder after lightning; and generative music per place (pads + a sparse melody from the
 * place's scale), crossfading between the two most present places. Cosmetic only: nothing here
 * affects the simulation. Browsers start audio after the first click (Phaser unlocks the context).
 */
export class AudioDirector {
  private readonly master: GainNode;
  private readonly musicBus: GainNode;
  private readonly ambienceBus: GainNode;
  private readonly noise: AudioBuffer;
  private readonly beds: { wind: GainNode; rain: GainNode; rumble: GainNode };
  private readonly windFilter: BiquadFilterNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly levels = emptyLevels();
  private readonly mix = createMusicMix();
  private readonly voices: MusicVoice[] = [];
  /** Next time (audio clock) each event layer may fire. */
  private readonly nextEvent = { birds: 0, crickets: 0, drips: 0, chimes: 0 };
  private paused = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly visuals: readonly BiomeVisual[],
  ) {
    this.master = this.gain(AUDIO.master, destination);
    this.musicBus = this.gain(AUDIO.music, this.master);
    this.ambienceBus = this.gain(AUDIO.ambience, this.master);
    this.noise = this.makeNoise();

    const d = SOUND_DESIGN;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = d.wind.filterLow;
    this.windFilter.Q.value = d.wind.q;
    const wind = this.gain(0, this.ambienceBus);
    this.windFilter.connect(wind);
    this.loopNoise(this.windFilter);

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'bandpass';
    rainFilter.frequency.value = d.rain.filter;
    rainFilter.Q.value = d.rain.q;
    const rain = this.gain(0, this.ambienceBus);
    rainFilter.connect(rain);
    this.loopNoise(rainFilter);

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = d.rumble.filter;
    const rumble = this.gain(0, this.ambienceBus);
    rumbleFilter.connect(rumble);
    this.loopNoise(rumbleFilter);
    const tone = ctx.createOscillator();
    tone.frequency.value = d.rumble.toneHz;
    tone.connect(this.gain(d.rumble.toneGain, rumble));
    tone.start();
    this.sources.push(tone);

    this.beds = { wind, rain, rumble };
  }

  /** Call once per frame with the current visual state. */
  update(input: AudioInputs, wind: number): void {
    if (this.paused || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const l = ambienceLevels(input, this.visuals, this.levels);
    const d = SOUND_DESIGN;
    const s = AUDIO.smoothing;
    this.beds.wind.gain.setTargetAtTime(l.wind * d.wind.gain, now, s);
    this.beds.rain.gain.setTargetAtTime(l.rain * d.rain.gain, now, s);
    this.beds.rumble.gain.setTargetAtTime(l.rumble * d.rumble.gain, now, s);
    const gust = Math.abs(wind);
    this.windFilter.frequency.setTargetAtTime(
      d.wind.filterLow + (d.wind.filterHigh - d.wind.filterLow) * gust,
      now,
      s,
    );

    const horizon = now + AUDIO.lookahead;
    this.events(horizon, l);
    this.music(input.weights, now, horizon);
  }

  /** Thunder after a lightning flash (the delay is how far away it struck). */
  thunder(): void {
    if (this.paused || this.ctx.state !== 'running') return;
    const t =
      this.ctx.currentTime +
      WEATHER.lightning.thunderDelay *
        (1 -
          SOUND_DESIGN.thunder.delayJitter / 2 +
          Math.random() * SOUND_DESIGN.thunder.delayJitter);
    const d = SOUND_DESIGN.thunder;
    this.noiseBurst(t, 'lowpass', d.filter, d.decay, d.gain);
    this.noiseBurst(t, 'bandpass', d.crackFilter, d.decay * d.crackDecayFactor, d.crackGain);
  }

  /** A short combat sound (src/data/audio.ts SOUND_DESIGN.sfx). */
  effect(kind: SfxKind): void {
    if (this.paused || this.ctx.state !== 'running') return;
    const d: SfxDef = SOUND_DESIGN.sfx[kind];
    const t = this.ctx.currentTime;
    if (d.noise)
      this.noiseBurst(t, d.noise.type, d.noise.hz, d.noise.decay, d.noise.gain, this.master);
    if (d.tone) {
      const osc = this.ctx.createOscillator();
      osc.type = d.tone.type;
      osc.frequency.setValueAtTime(d.tone.from, t);
      osc.frequency.exponentialRampToValueAtTime(d.tone.to, t + d.tone.decay);
      this.envelope(osc, t, SOUND_DESIGN.sfxAttack, d.tone.decay, d.tone.gain, this.master);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.master.gain.setTargetAtTime(
      paused ? 0 : AUDIO.master,
      this.ctx.currentTime,
      AUDIO.pauseFade,
    );
  }

  destroy(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // Already stopped.
      }
    }
    this.master.disconnect();
  }

  private events(horizon: number, l: ReturnType<typeof emptyLevels>): void {
    const d = SOUND_DESIGN;
    const due = (layer: keyof typeof this.nextEvent, level: number, rate: number) => {
      if (level <= AUDIO.minEventLevel) return null;
      const next = this.nextEvent[layer];
      const now = this.ctx.currentTime;
      if (next > horizon) return null;
      const at = Math.max(now, next);
      // Exponential gaps: on average `rate × level` events per second.
      this.nextEvent[layer] = at + -Math.log(1 - Math.random()) / (rate * level);
      return next === 0 ? null : at; // the first call only arms the timer
    };
    let t = due('birds', l.birds, d.birds.rate);
    if (t !== null) this.birdSong(t, l.birds);
    t = due('crickets', l.crickets, d.crickets.rate);
    if (t !== null) this.cricket(t, l.crickets);
    t = due('drips', l.drips, d.drips.rate);
    if (t !== null) this.drip(t, l.drips);
    t = due('chimes', l.chimes, d.chimes.rate);
    if (t !== null) this.chime(t, l.chimes);
  }

  private birdSong(t: number, level: number): void {
    const b = SOUND_DESIGN.birds;
    const chirps = Math.round(rand(b.chirps));
    let at = t;
    for (let i = 0; i < chirps; i++) {
      const length = rand(b.length);
      const osc = this.ctx.createOscillator();
      osc.frequency.setValueAtTime(rand(b.from), at);
      osc.frequency.exponentialRampToValueAtTime(rand(b.to), at + length);
      this.envelope(osc, at, b.attack, length, b.gain * level, this.panned(this.ambienceBus));
      at += length + b.gap;
    }
  }

  private cricket(t: number, level: number): void {
    const c = SOUND_DESIGN.crickets;
    const length = rand(c.length);
    const osc = this.ctx.createOscillator();
    osc.frequency.value = rand(c.hz);
    const am = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = c.pulseHz;
    lfo.connect(am.gain);
    lfo.start(t);
    lfo.stop(t + length);
    osc.connect(am);
    this.envelope(am, t, c.attack, length, c.gain * level, this.panned(this.ambienceBus), osc);
  }

  private drip(t: number, level: number): void {
    const p = SOUND_DESIGN.drips;
    const hz = rand(p.hz);
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(hz, t);
    osc.frequency.exponentialRampToValueAtTime(hz * p.drop, t + p.decay);
    const out = this.panned(this.ambienceBus);
    this.envelope(osc, t, p.attack, p.decay, p.gain * level, out);
    // A soft echo, as if in a cave.
    const echo = this.ctx.createOscillator();
    echo.frequency.setValueAtTime(hz, t + p.echo);
    echo.frequency.exponentialRampToValueAtTime(hz * p.drop, t + p.echo + p.decay);
    this.envelope(echo, t + p.echo, p.attack, p.decay, p.gain * level * p.echoGain, out);
  }

  private chime(t: number, level: number): void {
    const c = SOUND_DESIGN.chimes;
    const v = this.dominantVisual();
    if (!v) return;
    const degree = Math.floor(Math.random() * v.music.scale.length);
    const note = scaleNote(v.music.root + c.octaveUp, v.music.scale, degree);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = midiToHz(note);
    this.envelope(osc, t, c.attack, c.decay, c.gain * level, this.panned(this.ambienceBus));
  }

  private music(weights: Float32Array, now: number, horizon: number): void {
    const mix = musicMix(weights, this.mix);
    // Fade out voices whose place left the mix; fade the others to their share.
    for (const voice of this.voices) {
      let share = 0;
      for (let k = 0; k < mix.count; k++) {
        if (mix.shares[k]!.index === voice.index) share = mix.shares[k]!.gain;
      }
      voice.gain.gain.setTargetAtTime(share, now, AUDIO.smoothing * AUDIO.musicFadeFactor);
    }
    for (let k = 0; k < mix.count; k++) {
      const m = mix.shares[k]!;
      if (this.hasVoice(m.index)) continue;
      const gain = this.gain(0, this.musicBus);
      this.voices.push({
        index: m.index,
        gain,
        nextBeat: now + SOUND_DESIGN.music.firstBeatDelay,
        beat: 0,
        degree: 0,
      });
    }
    // Drop silent voices that are no longer in the mix.
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const voice = this.voices[i]!;
      let inMix = false;
      for (let k = 0; k < mix.count; k++) if (mix.shares[k]!.index === voice.index) inMix = true;
      if (!inMix && voice.gain.gain.value < AUDIO.silentVoiceGain) {
        voice.gain.disconnect();
        this.voices.splice(i, 1);
      }
    }
    for (const voice of this.voices) {
      const v = this.visuals[voice.index];
      if (!v) continue;
      const beatSeconds = 60 / v.music.bpm;
      // Beats missed while paused (or while the tab slept) are skipped, not played all at once.
      if (voice.nextBeat < now) voice.nextBeat = now;
      while (voice.nextBeat < horizon) {
        this.musicBeat(voice, v, voice.nextBeat, beatSeconds);
        voice.nextBeat += beatSeconds;
        voice.beat++;
      }
    }
  }

  private hasVoice(index: number): boolean {
    for (const voice of this.voices) if (voice.index === index) return true;
    return false;
  }

  private musicBeat(voice: MusicVoice, v: BiomeVisual, t: number, beatSeconds: number): void {
    const m = SOUND_DESIGN.music;
    const timbre = SOUND_DESIGN.timbres[v.music.timbre as Timbre];
    if (voice.beat % m.chordBeats === 0) {
      // A new pad chord rooted on a scale degree near the tonic.
      const rootDegrees = m.chordRootDegrees;
      const rootDegree = rootDegrees[Math.floor(Math.random() * rootDegrees.length)] ?? 0;
      const chord = m.chordTones.map((k) =>
        scaleNote(v.music.root - 12, v.music.scale, rootDegree + k),
      );
      const length = m.chordBeats * beatSeconds;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = timbre.cutoff;
      filter.connect(voice.gain);
      for (const note of chord) {
        const osc = this.ctx.createOscillator();
        osc.type = timbre.pad;
        osc.frequency.value = midiToHz(note);
        osc.detune.value = (Math.random() - 0.5) * m.padDetuneCents;
        this.envelope(osc, t, m.padAttack, length + m.padRelease, m.padGain, filter);
      }
    }
    if (Math.random() < m.melodyChance) {
      voice.degree = nextDegree(voice.degree, Math.random);
      const note = scaleNote(v.music.root + m.melodyOctave - 12, v.music.scale, voice.degree);
      const osc = this.ctx.createOscillator();
      osc.type = timbre.lead;
      osc.frequency.value = midiToHz(note);
      this.envelope(
        osc,
        t,
        m.melodyAttack,
        Math.max(m.melodyDecay, m.melodyBeats * beatSeconds),
        m.melodyGain,
        voice.gain,
      );
    }
  }

  private dominantVisual(): BiomeVisual | undefined {
    const voice = this.voices[0];
    return voice ? this.visuals[voice.index] : this.visuals[0];
  }

  /**
   * Plays `source` through a gain envelope: rise over `attack`, then decay to silence by
   * `length`. Extra sources (e.g. an oscillator feeding an AM gain) start/stop with it.
   */
  private envelope(
    source: AudioNode,
    t: number,
    attack: number,
    length: number,
    peak: number,
    out: AudioNode,
    driver?: AudioScheduledSourceNode,
  ): void {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(
      SOUND_DESIGN.envelope.floor,
      t + Math.max(attack + SOUND_DESIGN.envelope.minDecay, length),
    );
    source.connect(env);
    env.connect(out);
    const end = t + length + SOUND_DESIGN.envelope.tail;
    const scheduled = source instanceof AudioScheduledSourceNode ? source : driver;
    if (driver && scheduled !== driver) {
      driver.start(t);
      driver.stop(end);
    }
    if (scheduled) {
      scheduled.start(t);
      scheduled.stop(end);
      // Free the envelope (and the nodes feeding it) once the sound has finished.
      scheduled.onended = () => env.disconnect();
    }
  }

  private noiseBurst(
    t: number,
    type: BiquadFilterType,
    hz: number,
    decay: number,
    peak: number,
    out: AudioNode = this.ambienceBus,
  ): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    src.connect(filter);
    this.envelope(filter, t, SOUND_DESIGN.thunder.attack, decay, peak, out, src);
  }

  private panned(out: AudioNode): AudioNode {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * SOUND_DESIGN.panSpread;
    pan.connect(out);
    return pan;
  }

  private loopNoise(into: AudioNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    // Different start offsets so the beds don't share the same noise phase.
    src.connect(into);
    src.start(0, Math.random() * NOISE_SECONDS);
    this.sources.push(src);
  }

  private gain(value: number, out: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(out);
    return g;
  }

  private makeNoise(): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * NOISE_SECONDS);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}
