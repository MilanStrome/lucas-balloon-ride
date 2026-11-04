// Web Audio wiring: permission, device selection, analyser reads, and lifecycle.
import { DETECTOR } from '../config';

export type MicError = 'denied' | 'nodevice' | 'insecure' | 'unsupported' | 'other';

export const PROCESSING_OFF: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

export class MicStartError extends Error {
  constructor(
    readonly kind: MicError,
    message: string,
  ) {
    super(message);
  }
}

export function classifyMicError(e: unknown): MicError {
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError')
    return 'denied';
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  )
    return 'nodevice';
  return 'other';
}

export class MicInput {
  ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  analyser: AnalyserNode | null = null;
  readonly time = new Float32Array(DETECTOR.fftSize);
  readonly freq = new Float32Array(DETECTOR.fftSize / 2);
  deviceId = 'default';
  deviceLabel = '';
  usedFallbackConstraints = false;
  /** How often resume() had to wake a suspended context (iOS path), for diagnostics. */
  resumeCalls = 0;
  log: string[] = [];
  /** Called when the mic goes away (track ended, device unplugged). */
  onLost: () => void = () => undefined;
  private lostFired = false;
  private wantedDeviceId: string | null = null;
  private readonly onDeviceChange = () => void this.checkDevicePresent();

  get active(): boolean {
    return !!this.stream && this.stream.getAudioTracks().some((t) => t.readyState === 'live');
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000;
  }

  /** Must be called synchronously inside a user gesture (first tap). */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new MicStartError('unsupported', 'Web Audio not supported');
      this.ctx = new Ctor();
    }
    this.resume();
    return this.ctx;
  }

  /** Resume a suspended context. Call on every user gesture (iOS Safari needs this). */
  resume(): void {
    if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
      this.resumeCalls++;
      void this.ctx.resume().catch(() => undefined);
    }
  }

  private pushLog(s: string): void {
    this.log.push(s);
    if (this.log.length > 20) this.log.shift();
  }

  async start(deviceId: string | null): Promise<void> {
    if (!window.isSecureContext) throw new MicStartError('insecure', 'Microphone needs HTTPS');
    const md = navigator.mediaDevices as MediaDevices | undefined;
    if (!md?.getUserMedia) throw new MicStartError('unsupported', 'getUserMedia not supported');
    this.stopTracks();
    this.wantedDeviceId = deviceId;
    const base = PROCESSING_OFF.audio as MediaTrackConstraints;
    const withDevice: MediaStreamConstraints = {
      audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
    };
    let stream: MediaStream | null = null;
    if (deviceId) {
      try {
        stream = await md.getUserMedia(withDevice);
      } catch (e) {
        if (classifyMicError(e) === 'denied') throw new MicStartError('denied', String(e));
        this.pushLog('saved mic not found, using the default mic');
      }
    }
    try {
      stream ??= await md.getUserMedia(PROCESSING_OFF);
      this.usedFallbackConstraints = false;
    } catch (e) {
      const kind = classifyMicError(e);
      if (kind === 'denied') throw new MicStartError('denied', String(e));
      // The chosen device may be gone, or the browser rejected the constraints: fall back.
      this.pushLog(
        `constraints rejected (${(e as Error).name ?? 'error'}), retrying with {audio:true}`,
      );
      this.usedFallbackConstraints = true;
      try {
        stream = await md.getUserMedia({ audio: true });
      } catch (e2) {
        throw new MicStartError(classifyMicError(e2), String(e2));
      }
    }
    this.stream = stream;
    const ctx = this.ensureContext();
    this.source = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = DETECTOR.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    this.source.connect(this.analyser);
    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    this.deviceId = settings.deviceId || 'default';
    this.deviceLabel = track?.label ?? '';
    this.lostFired = false;
    if (track) {
      track.onended = () => this.fireLost('track ended');
    }
    md.removeEventListener?.('devicechange', this.onDeviceChange);
    md.addEventListener?.('devicechange', this.onDeviceChange);
    this.pushLog(`mic started: ${this.deviceLabel || this.deviceId} @ ${ctx.sampleRate} Hz`);
  }

  private fireLost(why: string): void {
    if (this.lostFired) return;
    this.lostFired = true;
    this.pushLog(`mic lost: ${why}`);
    this.onLost();
  }

  private async checkDevicePresent(): Promise<void> {
    if (!this.stream) return;
    const track = this.stream.getAudioTracks()[0];
    if (!track || track.readyState === 'ended') {
      this.fireLost('device change');
      return;
    }
    if (this.deviceId === 'default') return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((d) => d.kind === 'audioinput' && d.deviceId === this.deviceId))
        this.fireLost('device removed');
    } catch {
      // ignore
    }
  }

  /** Audio input devices (labels are only available after permission). */
  async listDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audioinput');
    } catch {
      return [];
    }
  }

  /** Read one frame into `time` and `freq`. Returns false if no analyser. */
  read(): boolean {
    const a = this.analyser;
    if (!a) return false;
    a.getFloatTimeDomainData(this.time);
    a.getFloatFrequencyData(this.freq);
    return true;
  }

  private stopTracks(): void {
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        t.onended = null;
        t.stop();
      }
    }
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }

  /** Page hidden: release the mic and suspend audio. */
  suspend(): void {
    this.stopTracks();
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.onDeviceChange);
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** Page visible again: re-acquire the same device. */
  async reacquire(): Promise<boolean> {
    try {
      await this.start(this.wantedDeviceId);
      return true;
    } catch {
      return false;
    }
  }

  /** Permission state if the Permissions API knows it. */
  static async permissionState(): Promise<PermissionState | 'unknown'> {
    try {
      const p = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return p.state;
    } catch {
      return 'unknown';
    }
  }
}
