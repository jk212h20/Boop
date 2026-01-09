import { useCallback, useRef, useEffect } from 'react';

type SoundName = 'place' | 'boop' | 'graduate' | 'win' | 'lose';

interface SoundOptions {
  volume?: number;
  playbackRate?: number;
}

// Simple Web Audio API based sound system
class SoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.5;

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  // Generate simple synthesized sounds
  play(name: SoundName, options: SoundOptions = {}) {
    if (!this.enabled) return;

    const ctx = this.getAudioContext();
    const vol = (options.volume ?? 1) * this.volume;

    switch (name) {
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
}

// Singleton instance
const soundManager = new SoundManager();

export function useSound() {
  const initialized = useRef(false);

  // Initialize audio context on first user interaction
  useEffect(() => {
    if (initialized.current) return;

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
