import Phaser from "phaser";

type EffectName =
  | "jump"
  | "dash"
  | "seal"
  | "splash"
  | "checkpoint"
  | "hurt"
  | "rescue"
  | "victory"
  | "cheer"
  | "firework"
  | "select"
  | "deny";

type CelebrationStopper = () => void;

type Tone = {
  delay?: number;
  duration: number;
  endFrequency?: number;
  frequency: number;
  gain?: number;
  type?: OscillatorType;
};

const EFFECTS: Record<EffectName, Tone[]> = {
  jump: [
    { frequency: 420, endFrequency: 620, duration: 0.08, gain: 0.04, type: "square" },
    { delay: 0.05, frequency: 560, endFrequency: 420, duration: 0.06, gain: 0.025, type: "triangle" }
  ],
  dash: [
    { frequency: 180, endFrequency: 520, duration: 0.12, gain: 0.05, type: "sawtooth" }
  ],
  seal: [
    { frequency: 660, endFrequency: 990, duration: 0.11, gain: 0.045, type: "triangle" },
    { delay: 0.08, frequency: 880, endFrequency: 1320, duration: 0.16, gain: 0.035, type: "sine" }
  ],
  splash: [
    { frequency: 180, endFrequency: 120, duration: 0.12, gain: 0.045, type: "sawtooth" },
    { delay: 0.03, frequency: 280, endFrequency: 180, duration: 0.18, gain: 0.03, type: "triangle" }
  ],
  checkpoint: [
    { frequency: 360, endFrequency: 540, duration: 0.1, gain: 0.04, type: "square" },
    { delay: 0.09, frequency: 540, endFrequency: 720, duration: 0.12, gain: 0.04, type: "square" }
  ],
  hurt: [
    { frequency: 190, endFrequency: 120, duration: 0.18, gain: 0.055, type: "sawtooth" }
  ],
  rescue: [
    { frequency: 392, endFrequency: 523, duration: 0.16, gain: 0.04, type: "triangle" },
    { delay: 0.14, frequency: 523, endFrequency: 784, duration: 0.22, gain: 0.05, type: "triangle" },
    { delay: 0.3, frequency: 784, endFrequency: 988, duration: 0.3, gain: 0.04, type: "sine" }
  ],
  victory: [
    { frequency: 392, endFrequency: 392, duration: 0.18, gain: 0.045, type: "triangle" },
    { delay: 0.2, frequency: 523, endFrequency: 523, duration: 0.18, gain: 0.045, type: "triangle" },
    { delay: 0.4, frequency: 659, endFrequency: 659, duration: 0.22, gain: 0.05, type: "triangle" },
    { delay: 0.7, frequency: 784, endFrequency: 988, duration: 0.48, gain: 0.055, type: "sine" }
  ],
  cheer: [
    { frequency: 260, endFrequency: 420, duration: 0.3, gain: 0.018, type: "sawtooth" },
    { delay: 0.04, frequency: 330, endFrequency: 500, duration: 0.32, gain: 0.018, type: "triangle" },
    { delay: 0.08, frequency: 520, endFrequency: 680, duration: 0.22, gain: 0.016, type: "square" }
  ],
  firework: [
    { frequency: 240, endFrequency: 940, duration: 0.16, gain: 0.026, type: "sine" },
    { delay: 0.18, frequency: 820, endFrequency: 220, duration: 0.24, gain: 0.035, type: "triangle" },
    { delay: 0.2, frequency: 1200, endFrequency: 400, duration: 0.2, gain: 0.018, type: "square" }
  ],
  select: [
    { frequency: 520, endFrequency: 760, duration: 0.12, gain: 0.035, type: "triangle" }
  ],
  deny: [
    { frequency: 300, endFrequency: 220, duration: 0.12, gain: 0.04, type: "square" }
  ]
};

function getAudioContext(scene: Phaser.Scene): AudioContext | null {
  return (
    (
      scene.sound as Phaser.Sound.WebAudioSoundManager & {
        context?: AudioContext;
      }
    ).context ?? null
  );
}

function scheduleTone(
  ctx: AudioContext,
  start: number,
  duration: number,
  frequency: number,
  gain: number,
  type: OscillatorType,
  destination: AudioNode
): void {
  const end = start + duration;
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gainNode);
  gainNode.connect(destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

export function unlockAudio(scene: Phaser.Scene): void {
  const ctx = getAudioContext(scene);

  if (!ctx) {
    return;
  }

  const resume = () => {
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
  };

  scene.input.once("pointerdown", resume);
  scene.input.keyboard?.once("keydown", resume);
}

export function playSound(scene: Phaser.Scene, effect: EffectName): void {
  const ctx = getAudioContext(scene);

  if (!ctx || ctx.state !== "running") {
    return;
  }

  const now = ctx.currentTime;

  EFFECTS[effect].forEach((tone) => {
    const start = now + (tone.delay ?? 0);
    const end = start + tone.duration;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = tone.type ?? "triangle";
    oscillator.frequency.setValueAtTime(tone.frequency, start);

    if (tone.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, tone.endFrequency), end);
    }

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(tone.gain ?? 0.035, start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
}

export function startCelebrationMusic(scene: Phaser.Scene): CelebrationStopper {
  const ctx = getAudioContext(scene);

  if (!ctx || ctx.state !== "running") {
    return () => {};
  }

  const beat = 60 / 116;
  const loopDuration = beat * 16;
  let active = true;

  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(ctx.destination);

  const scheduleLoop = () => {
    if (!active) {
      return;
    }

    const startAt = ctx.currentTime + 0.06;

    const melody: Array<[number, number, number]> = [
      [0, 1, 523.25],
      [1, 1, 659.25],
      [2, 1, 783.99],
      [3, 1, 659.25],
      [4, 1.5, 698.46],
      [5.5, 0.5, 659.25],
      [6, 1, 587.33],
      [7, 1, 523.25],
      [8, 1, 587.33],
      [9, 1, 698.46],
      [10, 1, 880],
      [11, 1, 783.99],
      [12, 1.5, 698.46],
      [13.5, 0.5, 783.99],
      [14, 2, 1046.5]
    ];

    const harmony: Array<[number, number, number]> = [
      [0, 2, 392],
      [2, 2, 440],
      [4, 2, 349.23],
      [6, 2, 392],
      [8, 2, 440],
      [10, 2, 523.25],
      [12, 2, 493.88],
      [14, 2, 523.25]
    ];

    const bass: Array<[number, number, number]> = [
      [0, 2, 130.81],
      [2, 2, 146.83],
      [4, 2, 116.54],
      [6, 2, 130.81],
      [8, 2, 146.83],
      [10, 2, 174.61],
      [12, 2, 164.81],
      [14, 2, 130.81]
    ];

    melody.forEach(([offset, length, freq]) => {
      scheduleTone(ctx, startAt + offset * beat, length * beat, freq, 0.05, "triangle", master);
    });

    harmony.forEach(([offset, length, freq]) => {
      scheduleTone(ctx, startAt + offset * beat, length * beat, freq, 0.025, "sine", master);
      scheduleTone(ctx, startAt + offset * beat, length * beat, freq * 1.25, 0.018, "triangle", master);
    });

    bass.forEach(([offset, length, freq]) => {
      scheduleTone(ctx, startAt + offset * beat, length * beat, freq, 0.03, "square", master);
    });
  };

  scheduleLoop();

  const timer = scene.time.addEvent({
    delay: loopDuration * 1000,
    loop: true,
    callback: scheduleLoop
  });

  const stop = () => {
    if (!active) {
      return;
    }

    active = false;
    timer.remove(false);
    master.disconnect();
  };

  scene.events.once("shutdown", stop);
  scene.events.once("destroy", stop);
  return stop;
}
