// Web Audio API Synthesizer - Zero External Dependencies

class SoundEngine {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Play an uplifting 4-note victory chime when funded wallet is found:
   * Notes: C5 (523.25Hz) -> E5 (659.25Hz) -> G5 (783.99Hz) -> C6 (1046.50Hz)
   */
  public playSuccessChime() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.50];
      const now = ctx.currentTime;

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        // Gentle attack and decay
        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.28, now + idx * 0.12 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.55);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.6);
      });

      // Extra shimmering bell harmonic on the final high note
      setTimeout(() => {
        if (!ctx) return;
        const oscHigh = ctx.createOscillator();
        const gainHigh = ctx.createGain();
        oscHigh.type = "triangle";
        oscHigh.frequency.setValueAtTime(2093.0, ctx.currentTime);
        gainHigh.gain.setValueAtTime(0.12, ctx.currentTime);
        gainHigh.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
        oscHigh.connect(gainHigh);
        gainHigh.connect(ctx.destination);
        oscHigh.start();
        oscHigh.stop(ctx.currentTime + 0.85);
      }, 380);
    } catch (e) {
      console.warn("Audio playback not supported or user has not interacted yet", e);
    }
  }

  public playJackpotChime() {
    this.playSuccessChime();
  }

  /**
   * Subtle click ping feedback
   */
  public playClickPing() {
    try {
      const ctx = this.initCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch {
      // ignore
    }
  }
}

export const sound = new SoundEngine();
