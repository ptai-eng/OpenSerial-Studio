/**
 * Closed-Loop Virtual MCU Simulator for OpenSerial-Studio v3.0.0
 * 
 * Simulates microcontrollers streaming real-time hardware telemetry with microsecond timebase (t_us),
 * while responding dynamically in real time to incoming control commands (PID tuning, frequency modulation, PWM).
 */

export type SimulationScenario = 'dsp_harmonics' | 'pid_motor' | 'iot_env';

export interface VirtualMcuOptions {
  scenario?: SimulationScenario;
  sampleRateHz?: number;
  onTxData?: (line: string, rawBytes: Uint8Array) => void;
}

export class VirtualMcuSimulator {
  public scenario: SimulationScenario;
  public sampleRateHz: number;
  public isRunning = false;

  private timer: NodeJS.Timeout | null = null;
  private onTxData?: (line: string, rawBytes: Uint8Array) => void;
  private baseEpochMicros: number;
  private tickCount = 0;

  // --- Scenario 1: DSP Harmonics State ---
  public dsp = {
    f1Hz: 4.0,
    f2Hz: 9.5,
    a1: 2.0,
    a2: 0.85,
    dcOffset: 2.5,
    noiseAmp: 0.05,
    get f1() { return this.f1Hz; },
    set f1(v: number) { this.f1Hz = v; },
  };

  // --- Scenario 2: Closed-Loop PID Motor State ---
  public pid = {
    setpointRpm: 1000.0,
    currentRpm: 0.0,
    velocity: 0.0,
    integral: 0.0,
    lastError: 0.0,
    kp: 0.45,
    ki: 0.08,
    kd: 0.02,
    get rpm() { return this.currentRpm; },
    set rpm(v: number) { this.currentRpm = v; },
    get setpoint() { return this.setpointRpm; },
    set setpoint(v: number) { this.setpointRpm = v; },
  };

  // --- Scenario 3: IoT Environmental Station State ---
  public iot = {
    tempC: 28.5,
    humidityPct: 62.0,
    vbatV: 3.84,
    fanPwm: 0,
    relay1: 0,
  };

  constructor(optionsOrScenario: VirtualMcuOptions | SimulationScenario = 'dsp_harmonics', sampleRateHz?: number) {
    if (typeof optionsOrScenario === 'string') {
      this.scenario = optionsOrScenario;
      this.sampleRateHz = sampleRateHz ?? (this.scenario === 'dsp_harmonics' ? 50 : 20);
    } else {
      this.scenario = optionsOrScenario.scenario ?? 'dsp_harmonics';
      this.sampleRateHz = sampleRateHz ?? optionsOrScenario.sampleRateHz ?? (this.scenario === 'dsp_harmonics' ? 50 : 20);
      this.onTxData = optionsOrScenario.onTxData;
    }
    this.baseEpochMicros = Date.now() * 1000;
  }

  public setTxCallback(cb: (line: string, rawBytes: Uint8Array) => void): void {
    this.onTxData = cb;
  }

  public start(cb?: (line: string, rawBytes: Uint8Array) => void): void {
    if (cb) this.onTxData = cb;
    if (this.isRunning) return;
    this.isRunning = true;
    this.tickCount = 0;
    this.baseEpochMicros = Date.now() * 1000;

    // Emit initial frame immediately at t=0
    this.step();

    const intervalMs = Math.max(5, Math.floor(1000 / this.sampleRateHz));
    this.timer = setInterval(() => this.step(), intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Processes incoming command lines or JSON commands sent from Web UI or AI Agent via MCP.
   */
  public receiveCommand(commandText: string): void {
    const trimmed = commandText.trim();
    if (!trimmed) return;

    // 1. Try parsing JSON command (e.g. {"Kp": 0.5, "Setpoint_rpm": 1200})
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        this.applyParsedCommand(parsed);
        return;
      } catch {
        // Fall through to plain text parsing
      }
    }

    // 2. Try parsing Key:Value or Key=Value pairs (e.g. "Kp=0.5,Setpoint=1200")
    const pairs = trimmed.split(/[,;\s]+/);
    const parsedObj: Record<string, unknown> = {};
    for (const pair of pairs) {
      const match = pair.match(/^([A-Za-z0-9_]+)[:=](.+)$/);
      if (match) {
        const k = match[1];
        const v = match[2];
        const num = Number(v);
        parsedObj[k] = Number.isFinite(num) ? num : v;
      }
    }
    if (Object.keys(parsedObj).length > 0) {
      this.applyParsedCommand(parsedObj);
    }
  }

  private applyParsedCommand(cmd: Record<string, unknown>): void {
    // DSP parameters
    if (typeof cmd.f1 === 'number') this.dsp.f1Hz = cmd.f1;
    if (typeof cmd.f1Hz === 'number') this.dsp.f1Hz = cmd.f1Hz;
    if (typeof cmd.f1_hz === 'number') this.dsp.f1Hz = cmd.f1_hz;
    if (typeof cmd.harm_amp === 'number') this.dsp.a2 = cmd.harm_amp;
    if (typeof cmd.noise === 'number') this.dsp.noiseAmp = cmd.noise;
    if (typeof cmd.noise_v === 'number') this.dsp.noiseAmp = cmd.noise_v;

    // PID parameters
    if (typeof cmd.Kp === 'number') this.pid.kp = cmd.Kp;
    if (typeof cmd.kp === 'number') this.pid.kp = cmd.kp;
    if (typeof cmd.Ki === 'number') this.pid.ki = cmd.Ki;
    if (typeof cmd.ki === 'number') this.pid.ki = cmd.ki;
    if (typeof cmd.Kd === 'number') this.pid.kd = cmd.Kd;
    if (typeof cmd.kd === 'number') this.pid.kd = cmd.kd;
    if (typeof cmd.Setpoint_rpm === 'number') this.pid.setpointRpm = cmd.Setpoint_rpm;
    if (typeof cmd.setpoint === 'number') this.pid.setpointRpm = cmd.setpoint;

    // IoT parameters
    if (typeof cmd.FAN_PWM === 'number') this.iot.fanPwm = Math.max(0, Math.min(255, cmd.FAN_PWM));
    if (typeof cmd.RELAY_1 === 'number') this.iot.relay1 = cmd.RELAY_1 ? 1 : 0;
  }

  /**
   * Advances simulation physics by one step and emits telemetry frame.
   */
  public step(): void {
    this.tickCount++;
    const dt = 1.0 / this.sampleRateHz;
    const currentMicros = this.baseEpochMicros + Math.floor(this.tickCount * dt * 1000000);
    const tSec = this.tickCount * dt;

    let payloadString = '';

    if (this.scenario === 'dsp_harmonics') {
      // Dual-tone harmonic signal with microsecond hardware timebase
      const noise = (Math.random() - 0.5) * 2.0 * this.dsp.noiseAmp;
      const sigV =
        this.dsp.dcOffset +
        this.dsp.a1 * Math.sin(2 * Math.PI * this.dsp.f1Hz * tSec) +
        this.dsp.a2 * Math.sin(2 * Math.PI * this.dsp.f2Hz * tSec) +
        noise;

      const vibG = 1.2 * Math.sin(2 * Math.PI * 6.25 * tSec);

      const payload = {
        t_us: currentMicros,
        Signal_V: Number(sigV.toFixed(4)),
        Vibration_g: Number(vibG.toFixed(4)),
      };
      payloadString = JSON.stringify(payload);
    } else if (this.scenario === 'pid_motor') {
      // Discrete-time 2nd-order closed-loop motor model
      const error = this.pid.setpointRpm - this.pid.currentRpm;
      this.pid.integral = Math.max(-500, Math.min(500, this.pid.integral + error * dt));
      const derivative = (error - this.pid.lastError) / dt;
      this.pid.lastError = error;

      const pidOutput = this.pid.kp * error + this.pid.ki * this.pid.integral + this.pid.kd * derivative;
      // Mechanical inertia and damping
      this.pid.velocity = 0.85 * this.pid.velocity + 0.15 * pidOutput;
      this.pid.currentRpm = Math.max(0, this.pid.currentRpm + this.pid.velocity * dt * 8.0);
      const currentMa = Math.max(40, 120 + Math.abs(this.pid.velocity) * 1.5 + this.pid.currentRpm * 0.08);

      const payload = {
        t_us: currentMicros,
        Setpoint_rpm: Number(this.pid.setpointRpm.toFixed(1)),
        Rotor_rpm: Number(this.pid.currentRpm.toFixed(1)),
        Current_mA: Number(currentMa.toFixed(1)),
      };
      payloadString = JSON.stringify(payload);
    } else {
      // IoT Environmental Station (Plotter Key:Value format)
      // Cooling effect if FAN_PWM is high
      const cooling = (this.iot.fanPwm / 255.0) * 3.5;
      const targetTemp = 24.0 + Math.sin(tSec * 0.1) * 2.0 - cooling;
      this.iot.tempC = 0.95 * this.iot.tempC + 0.05 * targetTemp;
      this.iot.humidityPct = 58.0 + Math.cos(tSec * 0.08) * 6.0;
      this.iot.vbatV = 3.82 + Math.sin(tSec * 0.02) * 0.08;

      payloadString = `t_us:${currentMicros},Temp:${this.iot.tempC.toFixed(2)}C,Humidity:${this.iot.humidityPct.toFixed(1)}%,Vbat:${this.iot.vbatV.toFixed(2)}V,FanPwm:${this.iot.fanPwm},Relay:${this.iot.relay1}`;
    }

    if (this.onTxData) {
      const lineWithEnding = `${payloadString}\n`;
      const rawBytes = new TextEncoder().encode(lineWithEnding);
      this.onTxData(lineWithEnding, rawBytes);
    }
  }
}
