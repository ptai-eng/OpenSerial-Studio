import { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Header } from './components/layout/Header';
import { TerminalLog, type TerminalLogItem } from './components/widgets/TerminalLog';
import { ChartWidget } from './components/widgets/ChartWidget';
import { TextWidget } from './components/widgets/TextWidget';
import { CanvasWidget } from './components/widgets/CanvasWidget';
import { ButtonControl } from './components/controls/ButtonControl';
import { SliderControl } from './components/controls/SliderControl';
import { CodeGeneratorModal } from './components/widgets/CodeGeneratorModal';
import { SettingsModal } from './components/widgets/SettingsModal';
import { useWebSerial } from './hooks/useWebSerial';
import { useDataLogger } from './hooks/useDataLogger';
import {
  parseSerialPayloadDetailed,
  extractWidgetsFromBatch,
  type WidgetConfig,
  type ParsedTelemetryFrame,
  type SerialProtocol,
} from './lib/parser';
import {
  loadWorkspaceFromStorage,
  saveWorkspaceToStorage,
  serializeWorkspaceProfile,
  parseWorkspaceProfile,
  DEFAULT_BUFFER_SIZE,
  type ChartType,
  type DemoPreset,
  type ControlConfig,
} from './lib/workspace';
import {
  StatefulBinaryDemuxer,
  extractPixelsFromJson,
  raymarchPixel,
  type PixelData,
} from './lib/framebuffer';
import { PlusCircle, Trash2, Waves, Cpu, Thermometer, RotateCcw, Sparkles, Boxes } from 'lucide-react';

export type { DemoPreset };

function App() {
  const {
    status,
    transportMode,
    setTransportMode,
    bridgeStatus,
    selectBridgePort,
    releaseBridgePort,
    connect,
    disconnect,
    readLoop,
    write,
    writeBytes,
    error,
  } = useWebSerial();
  const { isRecording, startRecording, stopRecording, clearLog, exportCSV, logData, logCount } =
    useDataLogger();

  // Initialize workspace state from localStorage (v2.2 persistence, lazy once on mount)
  const [initialProfile] = useState(() => loadWorkspaceFromStorage());

  const [logs, setLogs] = useState<TerminalLogItem[]>([]);
  const [widgets, setWidgets] = useState<Map<string, WidgetConfig>>(new Map());
  const [controls, setControls] = useState<ControlConfig[]>(
    () => initialProfile?.controls ?? []
  );
  const [widgetPrefs, setWidgetPrefs] = useState<Record<string, ChartType>>(
    () => initialProfile?.widgetPrefs ?? {}
  );
  const [activeProtocol, setActiveProtocol] = useState<SerialProtocol | null>(null);

  // Form state for new control
  const [newControlId, setNewControlId] = useState('');
  const [newControlType, setNewControlType] = useState<'button' | 'slider'>('button');
  const inputRef = useRef<HTMLInputElement>(null);

  const [isCodeGenOpen, setIsCodeGenOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [baudRate, setBaudRate] = useState<number>(
    () => initialProfile?.baudRate ?? 115200
  );
  const [bufferSize, setBufferSize] = useState<number>(
    () => initialProfile?.bufferSize ?? DEFAULT_BUFFER_SIZE
  );
  const bufferSizeRef = useRef(bufferSize);
  useEffect(() => {
    bufferSizeRef.current = bufferSize;
  }, [bufferSize]);

  // Demo mode & preset
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoPreset, setDemoPreset] = useState<DemoPreset>(
    () => initialProfile?.demoPreset ?? 'dsp_harmonics'
  );
  const demoIntervalRef = useRef<number | null>(null);

  // Persist workspace settings whenever baudRate, bufferSize, controls, widgetPrefs, or demoPreset change
  useEffect(() => {
    saveWorkspaceToStorage({
      baudRate,
      bufferSize,
      controls,
      widgetPrefs,
      demoPreset,
    });
  }, [baudRate, bufferSize, controls, widgetPrefs, demoPreset]);

  // Lossless Ring-Buffer Queues between 50ms UI frames
  const logsBuffer = useRef<TerminalLogItem[]>([]);
  const payloadQueueRef = useRef<ParsedTelemetryFrame[]>([]);
  const latestRawChunkRef = useRef<Uint8Array | null>(null);

  // Framebuffer 3D Graphics State (v3.1.1)
  const incomingPixelsBufferRef = useRef<PixelData[]>([]);
  const binaryDemuxerRef = useRef<StatefulBinaryDemuxer>(new StatefulBinaryDemuxer());
  const [incomingPixelsBatch, setIncomingPixelsBatch] = useState<PixelData[]>([]);
  const [showCanvasWidget, setShowCanvasWidget] = useState<boolean>(
    () => initialProfile?.demoPreset === 'raymarcher_gpu'
  );
  const demoCamRotRef = useRef<{ x: number; y: number; light: number }>({ x: 18, y: 45, light: 1.0 });

  const handleRawChunk = useCallback((chunk: Uint8Array) => {
    latestRawChunkRef.current = chunk;
    const { pixels } = binaryDemuxerRef.current.push(chunk);
    if (pixels.length > 0) {
      incomingPixelsBufferRef.current.push(...pixels);
      setShowCanvasWidget(true);
    }
  }, []);

  // Handle incoming serial data without dropping intermediate samples
  const handleData = useCallback(
    (data: string, sampleTimestamp?: number, rawBytes?: Uint8Array, isMcpTx = false) => {
      const entry: TerminalLogItem = {
        text: data,
        isTx: isMcpTx,
        isMcpTx,
        rawBytes,
      };
      logsBuffer.current.push(entry);
      if (logsBuffer.current.length > 300) {
        logsBuffer.current = logsBuffer.current.slice(-150);
      }

      if (!isMcpTx) {
        // Detect JSON Pixel telemetry (e.g. from bitluni or debug scripts)
        if (data.startsWith('{') && data.endsWith('}')) {
          try {
            const parsedObj = JSON.parse(data);
            const pxs = extractPixelsFromJson(parsedObj);
            if (pxs.length > 0) {
              incomingPixelsBufferRef.current.push(...pxs);
              setShowCanvasWidget(true);
            }
          } catch {
            // Ignore parse errors
          }
        }

        const frame = parseSerialPayloadDetailed(data, sampleTimestamp ?? Date.now());
        if (frame) {
          payloadQueueRef.current.push(frame);
          if (payloadQueueRef.current.length > 512) {
            payloadQueueRef.current = payloadQueueRef.current.slice(-256);
          }
          logData(frame.values);
        }
      }
    },
    [logData]
  );

  // UI Refresh Loop (20 FPS = 50ms) — drains full batch into configurable N-point Ring-Buffer
  useEffect(() => {
    const interval = setInterval(() => {
      if (logsBuffer.current.length > 0) {
        const incomingLogs = logsBuffer.current;
        logsBuffer.current = [];
        setLogs((prev) => [...prev, ...incomingLogs].slice(-150));
      }
      if (payloadQueueRef.current.length > 0) {
        const batch = payloadQueueRef.current;
        payloadQueueRef.current = [];
        const lastProto = batch[batch.length - 1].protocol;
        setActiveProtocol(lastProto);
        setWidgets((currentWidgets) =>
          extractWidgetsFromBatch(batch, currentWidgets, bufferSizeRef.current)
        );
      }
      if (incomingPixelsBufferRef.current.length > 0) {
        const drained = incomingPixelsBufferRef.current;
        incomingPixelsBufferRef.current = [];
        setIncomingPixelsBatch(drained);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      readLoop(
        (line, isMcpTx, rawBytes) =>
          handleData(line, undefined, rawBytes ?? (latestRawChunkRef.current ?? undefined), isMcpTx),
        (chunk) => handleRawChunk(chunk)
      );
    }
  }, [status, readLoop, handleData, handleRawChunk]);

  const startDemoStream = useCallback(
    (preset: DemoPreset) => {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current);
      }
      setWidgets(new Map());
      setActiveProtocol(null);
      payloadQueueRef.current = [];

      if (preset === 'dsp_harmonics') {
        setWidgetPrefs((prev) => ({ ...prev, Signal_V: 'fft', Vibration_g: 'line' }));
        const dtMs = 25; // f_s = 40 Hz (Nyquist = 20 Hz)
        let sampleIdx = 0;
        const baseEpoch = Date.now();

        demoIntervalRef.current = window.setInterval(() => {
          for (let s = 0; s < 2; s++) {
            sampleIdx++;
            const tSec = (sampleIdx * dtMs) / 1000;
            const syntheticTs = baseEpoch + sampleIdx * dtMs;

            // Dual-tone composite wave: DC = 2.5V, f1 = 4.0 Hz (A1 = 2.0V), f2 = 9.5 Hz (A2 = 0.85V)
            const sigV =
              2.5 +
              2.0 * Math.sin(2 * Math.PI * 4.0 * tSec) +
              0.85 * Math.sin(2 * Math.PI * 9.5 * tSec);

            // Sub-bin vibration sinusoid: f = 6.25 Hz (A = 1.4 g)
            const vib = 1.4 * Math.sin(2 * Math.PI * 6.25 * tSec);

            const payload = {
              Signal_V: Number(sigV.toFixed(4)),
              Vibration_g: Number(vib.toFixed(4)),
            };
            handleData(JSON.stringify(payload), syntheticTs);
          }
        }, 50);
      } else if (preset === 'pid_motor') {
        setWidgetPrefs((prev) => ({ ...prev, Rotor_rpm: 'line', Setpoint_rpm: 'line' }));
        let stepCount = 0;
        let rpm = 0;
        let velocity = 0;
        const baseEpoch = Date.now();

        demoIntervalRef.current = window.setInterval(() => {
          stepCount++;
          const setpoint = Math.floor(stepCount / 60) % 2 === 0 ? 1200 : 600;
          const errorVal = setpoint - rpm;
          velocity = 0.82 * velocity + 0.14 * errorVal;
          rpm += velocity;
          const currentMa = Math.max(80, 150 + velocity * 1.8 + rpm * 0.12);

          const payload = {
            Setpoint_rpm: setpoint,
            Rotor_rpm: Number(rpm.toFixed(1)),
            Current_ma: Number(currentMa.toFixed(1)),
          };
          handleData(JSON.stringify(payload), baseEpoch + stepCount * 50);
        }, 50);
      } else if (preset === 'raymarcher_gpu') {
        setShowCanvasWidget(true);
        setWidgetPrefs((prev) => ({ ...prev, GPU_FPS: 'line', Active_Cores: 'gauge', Scanline: 'line' }));

        // Inject default 3D camera controls
        setControls((prev) => {
          const ids = new Set(prev.map((c) => c.id));
          const next = [...prev];
          if (!ids.has('cam_rot_y')) {
            next.push({ id: 'cam_rot_y', type: 'slider', label: 'Camera Yaw (°)', min: 0, max: 360, step: 5 });
          }
          if (!ids.has('cam_rot_x')) {
            next.push({ id: 'cam_rot_x', type: 'slider', label: 'Camera Pitch (°)', min: -90, max: 90, step: 5 });
          }
          if (!ids.has('light_val')) {
            next.push({ id: 'light_val', type: 'slider', label: 'Light Intensity (%)', min: 10, max: 100, step: 5 });
          }
          return next;
        });

        let currentScanY = 0;
        const baseEpoch = Date.now();
        let tick = 0;

        demoIntervalRef.current = window.setInterval(() => {
          tick++;
          const linesPerTick = 3;
          const w = 160;
          const h = 120;
          const pixelsBatch: PixelData[] = [];

          // Slowly orbit camera
          demoCamRotRef.current.y = (demoCamRotRef.current.y + 0.6) % 360;

          for (let l = 0; l < linesPerTick; l++) {
            const y = currentScanY;
            currentScanY = (currentScanY + 1) % h;
            for (let x = 0; x < w; x++) {
              pixelsBatch.push(
                raymarchPixel(
                  x,
                  y,
                  w,
                  h,
                  demoCamRotRef.current.x,
                  demoCamRotRef.current.y,
                  demoCamRotRef.current.light
                )
              );
            }
          }

          incomingPixelsBufferRef.current.push(...pixelsBatch);

          const companionPayload = {
            t_us: baseEpoch * 1000 + tick * 35000,
            GPU_FPS: 28.5,
            Active_Cores: 64,
            Scanline: currentScanY,
          };
          handleData(JSON.stringify(companionPayload), baseEpoch + tick * 35);
        }, 35);
      } else {
        let tick = 0;
        const baseEpoch = Date.now();
        demoIntervalRef.current = window.setInterval(() => {
          tick++;
          const t = tick * 0.08;
          const temp = (26.5 + Math.sin(t) * 3.2).toFixed(2);
          const humid = (58.0 + Math.cos(t * 0.7) * 8.5).toFixed(2);
          const vbat = (3.85 + Math.sin(t * 0.2) * 0.15).toFixed(2);
          const plotterLine = `Temp:${temp}C, Humid:${humid}%, Vbat:${vbat}V, State:ONLINE`;
          handleData(plotterLine, baseEpoch + tick * 80);
        }, 80);
      }
    },
    [handleData]
  );

  const toggleDemoMode = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      // v2.2: Preserve captured waveforms on Stop Demo so the engineer can inspect FFT/metrics or export CSV
    } else {
      setIsDemoMode(true);
      startDemoStream(demoPreset);
    }
  };

  const handleSelectDemoPreset = (preset: DemoPreset) => {
    setDemoPreset(preset);
    setIsDemoMode(true);
    startDemoStream(preset);
  };

  const handleDisconnect = () => {
    disconnect();
    // v2.2: Keep captured widgets on screen after disconnect for post-capture analysis & CSV export
  };

  const handleResetDashboard = () => {
    setWidgets(new Map());
    setActiveProtocol(null);
    payloadQueueRef.current = [];
    clearLog();
  };

  const handleExportProfile = () => {
    const json = serializeWorkspaceProfile({
      baudRate,
      bufferSize,
      controls,
      widgetPrefs,
      demoPreset,
    });
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openserial_profile_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportProfile = (rawJson: string): boolean => {
    const profile = parseWorkspaceProfile(rawJson);
    if (!profile) return false;
    setBaudRate(profile.baudRate);
    if (profile.bufferSize) setBufferSize(profile.bufferSize);
    setControls(profile.controls);
    setWidgetPrefs(profile.widgetPrefs);
    if (profile.demoPreset) setDemoPreset(profile.demoPreset);
    return true;
  };

  const handleSliderConfigChange = useCallback(
    (id: string, patch: { min: number; max: number; step: number }) => {
      setControls((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const handleAddControl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newControlId.trim();
    if (!cleaned) return;
    if (controls.some((c) => c.id === cleaned)) {
      setNewControlId('');
      return;
    }
    setControls([...controls, { id: cleaned, label: cleaned, type: newControlType }]);
    setNewControlId('');
    inputRef.current?.focus();
  };

  const handleDeleteControl = (id: string) => {
    setControls(controls.filter((c) => c.id !== id));
  };

  const handleWrite = (data: string) => {
    const cleanEcho = data.replace(/\r?\n$/, '');
    logsBuffer.current.push({
      text: `> ${cleanEcho}`,
      isTx: true,
      rawBytes: new TextEncoder().encode(data),
    });

    if (isDemoMode) {
      try {
        const parsed = JSON.parse(cleanEcho);
        if (typeof parsed.cam_rot_x === 'number') demoCamRotRef.current.x = parsed.cam_rot_x;
        if (typeof parsed.cam_rot_y === 'number') demoCamRotRef.current.y = parsed.cam_rot_y;
        if (typeof parsed.light_intensity === 'number') demoCamRotRef.current.light = parsed.light_intensity;
        if (typeof parsed.light_val === 'number') demoCamRotRef.current.light = parsed.light_val / 100.0;
      } catch {
        // Not JSON
      }
    } else {
      write(data);
    }
  };

  const handleWriteBytes = (bytes: Uint8Array, displayHex: string) => {
    logsBuffer.current.push({
      text: `> [HEX] ${displayHex}`,
      isTx: true,
      rawBytes: bytes,
    });
    if (!isDemoMode) {
      writeBytes(bytes);
    }
  };

  return (
    <DashboardLayout>
      <CodeGeneratorModal
        isOpen={isCodeGenOpen}
        onClose={() => setIsCodeGenOpen(false)}
        widgetKeys={Array.from(widgets.keys())}
        controls={controls}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentBaudRate={baudRate}
        onSaveBaudRate={setBaudRate}
        currentBufferSize={bufferSize}
        onSaveBufferSize={setBufferSize}
        onExportProfile={handleExportProfile}
        onImportProfile={handleImportProfile}
      />
      <Header
        status={status}
        transportMode={transportMode}
        onSelectTransportMode={setTransportMode}
        bridgeStatus={bridgeStatus}
        onSelectBridgePort={(port) => selectBridgePort(port, baudRate)}
        onReleaseBridgePort={releaseBridgePort}
        onConnect={() => connect(baudRate)}
        onDisconnect={handleDisconnect}
        onOpenCodeGen={() => setIsCodeGenOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onDemo={toggleDemoMode}
        isDemoMode={isDemoMode}
        isRecording={isRecording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onExportCSV={exportCSV}
        logCount={logCount}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Workspace Area: Data Widgets */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-blue"></span> Dashboard
              </h2>

              {/* Hardware Simulation Preset Switcher */}
              {status !== 'connected' && (
                <div className="flex items-center gap-1 bg-zinc-900 border border-white/5 rounded-lg p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectDemoPreset('dsp_harmonics')}
                    className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      isDemoMode && demoPreset === 'dsp_harmonics'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="4 Hz + 9.5 Hz Dual-Tone Sinusoid @ 40 Hz Sample Rate (FFT Test)"
                  >
                    <Waves className="w-3.5 h-3.5" />
                    DSP FFT (4+9.5Hz)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectDemoPreset('pid_motor')}
                    className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      isDemoMode && demoPreset === 'pid_motor'
                        ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="2nd-Order Underdamped PID Motor Step Response"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    PID Step
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectDemoPreset('iot_env')}
                    className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      isDemoMode && demoPreset === 'iot_env'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Arduino Serial Plotter Key:Value Telemetry"
                  >
                    <Thermometer className="w-3.5 h-3.5" />
                    Plotter IoT
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectDemoPreset('raymarcher_gpu')}
                    className={`px-2.5 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                      isDemoMode && demoPreset === 'raymarcher_gpu'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="64-Core RISC-V 3D Raymarching Cluster Simulator"
                  >
                    <Boxes className="w-3.5 h-3.5 text-cyan-400" />
                    3D GPU
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCanvasWidget((v) => !v)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono flex items-center gap-1 transition-colors border ${
                  showCanvasWidget
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35 shadow-sm'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border-white/10'
                }`}
                title="Toggle GPU Framebuffer Display"
              >
                <Sparkles className="w-3 h-3 text-cyan-400" />
                Canvas {showCanvasWidget ? 'ON' : 'OFF'}
              </button>

              {widgets.size > 0 && (
                <button
                  type="button"
                  onClick={handleResetDashboard}
                  title="Clear captured waveforms and reset widgets"
                  className="px-2.5 py-1 rounded-full text-[11px] font-mono text-zinc-400 hover:text-zinc-100 bg-zinc-900 hover:bg-zinc-800 border border-white/10 flex items-center gap-1 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Clear
                </button>
              )}
              {activeProtocol && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold uppercase tracking-wider bg-accent-blue/10 text-accent-blue border border-accent-blue/25">
                  Protocol: {activeProtocol.toUpperCase()}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20">
                N = {bufferSize}
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-white/5">
                {baudRate} bps
              </span>
            </div>
          </div>

          {/* 3D Framebuffer Canvas Widget */}
          {showCanvasWidget && (
            <div className="mb-2">
              <CanvasWidget incomingPixels={incomingPixelsBatch} />
            </div>
          )}

          {widgets.size === 0 ? (
            <div className="bg-zinc-900 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
              {status === 'connected' || isDemoMode ? (
                <div>
                  <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-4 border border-accent-blue/20">
                    <span className="text-xs font-mono font-bold text-accent-blue animate-pulse">
                      UART
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-zinc-100 mb-2">Listening for Telemetry...</h2>
                  <p className="text-zinc-400 max-w-md mx-auto text-sm">
                    {isDemoMode
                      ? 'Streaming synthetic telemetry frames...'
                      : 'Send JSON ({"Temp":25.4}), Serial Plotter (Temp:25.4,Humid:60), or CSV (25.4,60.0) over UART.'}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-4 border border-white/5">
                    <span className="text-2xl">🔌</span>
                  </div>
                  <h2 className="text-xl font-bold text-zinc-100 mb-2">No Device Connected</h2>
                  <p className="text-zinc-500 max-w-md mx-auto text-sm mb-5">
                    Click <strong className="text-zinc-300">Connect</strong> to attach your MCU via Web Serial, or choose a{' '}
                    <strong className="text-zinc-300">Simulation Preset</strong> above to test real-time FFT spectral analysis & PID waveforms.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from(widgets.values()).map((widget) => {
                if (widget.type === 'chart') {
                  const currentDisplayType = widgetPrefs[widget.id] || widget.displayType || 'line';
                  return (
                    <ChartWidget
                      key={widget.id}
                      label={widget.label}
                      value={widget.value as number}
                      unit={widget.unit}
                      history={widget.history}
                      displayType={currentDisplayType}
                      onChangeType={(type) => setWidgetPrefs((p) => ({ ...p, [widget.id]: type }))}
                    />
                  );
                }
                return <TextWidget key={widget.id} label={widget.label} value={widget.value} />;
              })}
            </div>
          )}
        </div>

        {/* Sidebar: Controls & Tools */}
        <div className="space-y-6">
          {/* Virtual Control Panel */}
          <div className="bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 bg-zinc-900/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-300">Virtual Controls (TX)</h3>
              <span className="text-[11px] font-mono text-zinc-500">JSON + LF (\n)</span>
            </div>

            <div className="p-5 space-y-4">
              {/* Form to add new control */}
              <form onSubmit={handleAddControl} className="flex gap-2 mb-4">
                <input
                  type="text"
                  ref={inputRef}
                  value={newControlId}
                  onChange={(e) =>
                    setNewControlId(e.target.value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''))
                  }
                  placeholder="Var Name (e.g. LED_1, PWM_1)"
                  className="flex-1 w-0 min-w-0 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-accent-blue"
                />
                <select
                  value={newControlType}
                  onChange={(e) => setNewControlType(e.target.value as 'button' | 'slider')}
                  className="bg-zinc-950 border border-white/10 rounded-lg px-2 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent-blue"
                >
                  <option value="button">Btn</option>
                  <option value="slider">Sld</option>
                </select>
                <button
                  type="submit"
                  className="bg-accent-blue/10 text-accent-blue p-2 rounded-lg hover:bg-accent-blue/20 transition-colors border border-accent-blue/20"
                  title="Add Virtual Control"
                >
                  <PlusCircle className="w-5 h-5" />
                </button>
              </form>

              {/* Render Controls */}
              {controls.length === 0 && (
                <p className="text-xs text-zinc-500 italic text-center py-4">
                  No controls added. Create one above to transmit commands to your MCU.
                </p>
              )}

              <div className="space-y-3">
                {controls.map((ctrl) => (
                  <div key={ctrl.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => handleDeleteControl(ctrl.id)}
                      className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 p-1.5 bg-zinc-900 border border-white/10 rounded-full text-zinc-500 hover:text-red-400 hover:border-red-400/50 opacity-0 group-hover:opacity-100 transition-all z-10"
                      title="Delete Control"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {ctrl.type === 'button' ? (
                      <ButtonControl id={ctrl.id} label={ctrl.label} onSend={handleWrite} />
                    ) : (
                      <SliderControl
                        id={ctrl.id}
                        label={ctrl.label}
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        onSend={handleWrite}
                        onConfigChange={handleSliderConfigChange}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <TerminalLog
            logs={logs}
            onClear={() => setLogs([])}
            onSend={handleWrite}
            onSendBytes={handleWriteBytes}
          />

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-500">
              <strong className="font-semibold block mb-1">Connection Error</strong>
              {error}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default App;
