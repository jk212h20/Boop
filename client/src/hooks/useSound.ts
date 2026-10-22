import { useCallback, useRef, useEffect } from 'react';

type SoundName = 'place' | 'boop' | 'graduate' | 'win' | 'lose' | 'meow' | 'winVoice';

interface SoundOptions {
  volume?: number;
  playbackRate?: number;
}

// Simple Web Audio API based sound system
class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.5;
  private lastMeow = -1;
  private winVoice: Promise<AudioBuffer> | null = null;

  private loadWinVoice(ctx: AudioContext): Promise<AudioBuffer> {
    if (!this.winVoice) {
      this.winVoice = fetch('/assets/audio/win-meow.mp3')
        .then(response => {
          if (!response.ok) throw new Error(`Win voice: HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(bytes => ctx.decodeAudioData(bytes))
        .catch(error => { this.winVoice = null; throw error; });
    }
    return this.winVoice;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  preloadWinVoice() {
    void this.loadWinVoice(this.getAudioContext()).catch(error => console.warn('Could not load win voice', error));
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Generate simple synthesized sounds
  play(name: SoundName, options: SoundOptions = {}) {
    if (!this.enabled || document.hidden) return;

    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(console.warn);
    const vol = (options.volume ?? 1) * this.volume;

    switch (name) {
      case 'winVoice':
        void this.loadWinVoice(ctx).then(buffer => {
          if (!this.enabled || document.hidden) return;
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.value = vol;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.onended = () => { source.disconnect(); gain.disconnect(); };
          source.start();
        }).catch(error => console.warn('Could not play win voice', error));
        break;
      case 'place':
        this.playPlop(ctx, vol);
        break;
      case 'boop':
        this.playWhoosh(ctx, vol);
        break;
      case 'graduate':
        this.playChime(ctx, vol);
        break;
      case 'win':
        this.playFanfare(ctx, vol);
        break;
      case 'lose':
        this.playSadSound(ctx, vol);
        break;
      case 'meow':
        this.playMeow(ctx, vol);
        break;
    }
  }

  // Soft "plop" sound for placing a piece
  private playPlop(ctx: AudioContext, volume: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  // Whoosh sound for booping
  private playWhoosh(ctx: AudioContext, volume: number) {
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * Math.sin(t * Math.PI);
    }
    
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
    filter.Q.value = 1;
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    gain.gain.setValueAtTime(volume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    source.start(ctx.currentTime);
  }

  // Sparkly chime for graduation
  private playChime(ctx: AudioContext, volume: number) {
    const frequencies = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume * 0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  // Victory fanfare
  private playFanfare(ctx: AudioContext, volume: number) {
    const notes = [
      { freq: 392, time: 0 },      // G4
      { freq: 523.25, time: 0.12 }, // C5
      { freq: 659.25, time: 0.24 }, // E5
      { freq: 783.99, time: 0.36 }, // G5
      { freq: 1046.5, time: 0.5 },  // C6
    ];
    
    notes.forEach(({ freq, time }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'square';
      osc.frequency.value = freq;
      
      const startTime = ctx.currentTime + time;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume * 0.15, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  // Sad descending sound
  private playSadSound(ctx: AudioContext, volume: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
    
    gain.gain.setValueAtTime(volume * 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  }

  private playMeow(ctx: AudioContext, volume: number) {
    let index = Math.floor(Math.random() * MEOWS.length);
    if (index === this.lastMeow) index = (index + 1) % MEOWS.length;
    this.lastMeow = index;
    playMeow(ctx, volume, index);
  }
}

// A cat meow. Nothing is sampled, so it is built the way a voice is: a
// buzzing glottal source whose pitch rises and falls, shaped by two moving
// formants, with a breathy edge. Each variant is a different cat, and the
// same cat never meows twice in a row.
export function playMeow(ctx: BaseAudioContext, volume: number, index: number) {
  const meow = MEOWS[index % MEOWS.length];
  const t0 = ctx.currentTime;
  const dur = meow.duration;

  const source = ctx.createOscillator();
  source.type = 'sawtooth';
  const pitch = meow.pitch * (0.96 + Math.random() * 0.08);
  source.frequency.setValueAtTime(pitch * 0.9, t0);
  source.frequency.linearRampToValueAtTime(pitch * meow.peak, t0 + dur * 0.28);
  source.frequency.exponentialRampToValueAtTime(pitch * meow.tail, t0 + dur);

  // A slow wobble on the pitch is most of what makes it sound alive.
  const vibrato = ctx.createOscillator();
  const vibratoDepth = ctx.createGain();
  vibrato.frequency.value = 5.2 + Math.random();
  vibratoDepth.gain.value = pitch * 0.02;
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(source.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.linearRampToValueAtTime(volume * 0.5, t0 + 0.035);
  env.gain.linearRampToValueAtTime(volume * 0.34, t0 + dur * 0.45);
  env.gain.linearRampToValueAtTime(volume * 0.46, t0 + dur * 0.72);
  env.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  env.connect(ctx.destination);

  // Two formants: the vowel closes on "mi" and opens into "aow".
  const formants = [
    { from: meow.f1[0], to: meow.f1[1], q: 7, gain: 1 },
    { from: meow.f2[0], to: meow.f2[1], q: 11, gain: 0.55 },
  ];
  formants.forEach(({ from, to, q, gain }) => {
    const filter = ctx.createBiquadFilter();
    const level = ctx.createGain();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.75);
    level.gain.value = gain * 2.6;
    source.connect(filter);
    filter.connect(level);
    level.connect(env);
  });

  // A little breath over the top so it is not a pure buzz.
  const breathLength = Math.floor(ctx.sampleRate * dur);
  const breathBuffer = ctx.createBuffer(1, breathLength, ctx.sampleRate);
  const breathData = breathBuffer.getChannelData(0);
  for (let i = 0; i < breathLength; i++) breathData[i] = (Math.random() * 2 - 1) * 0.16;
  const breath = ctx.createBufferSource();
  const breathFilter = ctx.createBiquadFilter();
  const breathGain = ctx.createGain();
  breath.buffer = breathBuffer;
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = 2400;
  breathFilter.Q.value = 0.8;
  breathGain.gain.value = volume * 0.35;
  breath.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(env);
  breath.start(t0);
  breath.stop(t0 + dur);

  source.start(t0);
  vibrato.start(t0);
  source.stop(t0 + dur + 0.02);
  vibrato.stop(t0 + dur + 0.02);
}

// The voices of a handful of cats: pitch, how far it climbs, how it falls
// away, and the two formant pairs that shape the vowel.
const MEOWS = [
  { pitch: 430, peak: 1.5, tail: 0.72, duration: 0.62, f1: [640, 1000], f2: [2100, 1500] },
  { pitch: 520, peak: 1.35, tail: 0.8, duration: 0.5, f1: [760, 1080], f2: [2400, 1750] },
  { pitch: 360, peak: 1.65, tail: 0.66, duration: 0.78, f1: [560, 900], f2: [1850, 1300] },
  { pitch: 610, peak: 1.25, tail: 0.85, duration: 0.42, f1: [880, 1200], f2: [2650, 1950] },
  { pitch: 300, peak: 1.4, tail: 0.62, duration: 0.9, f1: [500, 820], f2: [1700, 1200] },
  { pitch: 470, peak: 1.55, tail: 0.7, duration: 0.55, f1: [700, 1020], f2: [2250, 1600] },
];

// Singleton instance
const soundManager = new SoundManager();

export function useSound() {
  const initialized = useRef(false);

  // Initialize audio context on first user interaction
  useEffect(() => {
    if (initialized.current) return;

    // Warm the recording before the win; Web Audio is unlocked by the gesture.
    soundManager.preloadWinVoice();
    const initAudio = () => {
      soundManager.play('place', { volume: 0 }); // Silent play to init
      initialized.current = true;
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };

    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

    return () => {
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
  }, []);

  const playSound = useCallback((name: SoundName, options?: SoundOptions) => {
    soundManager.play(name, options);
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    soundManager.setEnabled(enabled);
  }, []);

  const setVolume = useCallback((volume: number) => {
    soundManager.setVolume(volume);
  }, []);

  return {
    playSound,
    setEnabled,
    setVolume,
  };
}

export type { SoundName };
