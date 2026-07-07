import { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Header } from './components/layout/Header';
import { TerminalLog } from './components/widgets/TerminalLog';
import { ChartWidget, type ChartType } from './components/widgets/ChartWidget';
import { TextWidget } from './components/widgets/TextWidget';
import { ButtonControl } from './components/controls/ButtonControl';
import { SliderControl } from './components/controls/SliderControl';
import { CodeGeneratorModal } from './components/widgets/CodeGeneratorModal';
import { SettingsModal } from './components/widgets/SettingsModal';
import { useWebSerial } from './hooks/useWebSerial';
import { useDataLogger } from './hooks/useDataLogger';
import { parseSerialPayload, extractWidgetsFromPayload } from './lib/parser';
import type { WidgetConfig } from './lib/parser';
import { PlusCircle, Trash2 } from 'lucide-react';

interface ControlConfig {
  id: string;
  type: 'button' | 'slider';
  label: string;
}

function App() {
  const { status, connect, disconnect, readLoop, write, error } = useWebSerial();
  const { isRecording, startRecording, stopRecording, exportCSV, logData, logCount } = useDataLogger();
  const [logs, setLogs] = useState<string[]>([]);
  const [widgets, setWidgets] = useState<Map<string, WidgetConfig>>(new Map());
  const [controls, setControls] = useState<ControlConfig[]>([]);
  const [widgetPrefs, setWidgetPrefs] = useState<Record<string, ChartType>>({});
  
  // Form state for new control
  const [newControlId, setNewControlId] = useState('');
  const [newControlType, setNewControlType] = useState<'button'|'slider'>('button');
  const inputRef = useRef<HTMLInputElement>(null);

  const [isCodeGenOpen, setIsCodeGenOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [baudRate, setBaudRate] = useState<number>(115200);

  // Demo mode
  const [isDemoMode, setIsDemoMode] = useState(false);
  const demoIntervalRef = useRef<number | null>(null);

  // Throttling buffers
  const logsBuffer = useRef<string[]>([]);
  const latestPayload = useRef<Record<string, number | string> | null>(null);

  // Handle incoming serial data (Throttled UI updates)
  const handleData = useCallback((data: string) => {
    logsBuffer.current.push(data);
    if (logsBuffer.current.length > 200) logsBuffer.current = logsBuffer.current.slice(-100);
    
    const payload = parseSerialPayload(data);
    if (payload) {
      latestPayload.current = payload;
      logData(payload);
    }
  }, [logData]);

  // UI Refresh Loop (approx 20 FPS = 50ms) to prevent React re-render lag
  useEffect(() => {
    const interval = setInterval(() => {
      if (logsBuffer.current.length > 0) {
        setLogs(prev => [...prev, ...logsBuffer.current].slice(-100));
        logsBuffer.current = [];
      }
      if (latestPayload.current) {
        const p = latestPayload.current;
        latestPayload.current = null;
        setWidgets((currentWidgets) => extractWidgetsFromPayload(p, currentWidgets));
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status === 'connected') {
      readLoop(handleData);
    }
  }, [status, readLoop, handleData]);

  const toggleDemoMode = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      setWidgets(new Map());
    } else {
      setIsDemoMode(true);
      let t = 0;
      demoIntervalRef.current = window.setInterval(() => {
        t += 0.1;
        const fakePayload = {
          Temperature: 25 + Math.sin(t) * 5 + Math.random(),
          Humidity: 50 + Math.cos(t * 0.5) * 10,
          MotorSpeed: Math.abs(Math.sin(t * 2)) * 100
        };
        const jsonStr = JSON.stringify(fakePayload);
        handleData(jsonStr);
      }, 100);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setWidgets(new Map());
  };

  const handleAddControl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newControlId.trim()) return;
    setControls([...controls, { id: newControlId, label: newControlId, type: newControlType }]);
    setNewControlId('');
    inputRef.current?.focus();
  };

  const handleDeleteControl = (id: string) => {
    setControls(controls.filter(c => c.id !== id));
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
      />
      <Header 
        status={status} 
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
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-blue"></span> Dashboard
          </h2>
          
          {widgets.size === 0 ? (
            <div className="bg-zinc-900 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
               {status === 'connected' || isDemoMode ? (
                  <div>
                    <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-4 border border-accent-blue/20">
                       <span className="text-accent-blue animate-pulse">JSON</span>
                    </div>
                     <h2 className="text-xl font-bold text-zinc-100 mb-2">Listening for Data...</h2>
                     <p className="text-zinc-400 max-w-sm mx-auto">
                       {isDemoMode ? "Generating fake JSON data..." : "Send a JSON payload via UART to automatically generate widgets."}
                     </p>
                  </div>
               ) : (
                  <div>
                    <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-4 border border-white/5">
                      <span className="text-2xl">🔌</span>
                    </div>
                    <h2 className="text-xl font-bold text-zinc-100 mb-2">No Device Connected</h2>
                    <p className="text-zinc-500 max-w-sm mx-auto">Click Connect to select your MCU and start receiving data.</p>
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
                      displayType={currentDisplayType}
                      onChangeType={(type) => setWidgetPrefs(p => ({...p, [widget.id]: type}))}
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
            <div className="px-5 py-4 border-b border-white/5 bg-zinc-900/50">
              <h3 className="text-sm font-semibold text-zinc-300">Virtual Controls (TX)</h3>
            </div>
            
            <div className="p-5 space-y-4">
              {/* Form to add new control */}
              <form onSubmit={handleAddControl} className="flex gap-2 mb-6">
                <input 
                  type="text" 
                  ref={inputRef}
                  value={newControlId}
                  onChange={(e) => setNewControlId(e.target.value.replace(/\\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, ''))}
                  placeholder="Var Name (e.g. LED_1)" 
                  className="flex-1 w-0 min-w-0 bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-accent-blue"
                />
                <select 
                  value={newControlType}
                  onChange={(e) => setNewControlType(e.target.value as 'button'|'slider')}
                  className="bg-zinc-950 border border-white/10 rounded-lg px-2 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent-blue"
                >
                  <option value="button">Btn</option>
                  <option value="slider">Sld</option>
                </select>
                <button type="submit" className="bg-accent-blue/10 text-accent-blue p-2 rounded-lg hover:bg-accent-blue/20 transition-colors border border-accent-blue/20">
                  <PlusCircle className="w-5 h-5" />
                </button>
              </form>

              {/* Render Controls */}
              {controls.length === 0 && (
                <p className="text-xs text-zinc-500 italic text-center py-4">No controls added. Create one above to send JSON to your board.</p>
              )}
              
              <div className="space-y-3">
                {controls.map((ctrl) => (
                  <div key={ctrl.id} className="relative group">
                    <button 
                      onClick={() => handleDeleteControl(ctrl.id)}
                      className="absolute right-0 top-0 translate-x-1/2 -translate-y-1/2 p-1.5 bg-zinc-900 border border-white/10 rounded-full text-zinc-500 hover:text-red-400 hover:border-red-400/50 opacity-0 group-hover:opacity-100 transition-all z-10"
                      title="Delete Control"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {ctrl.type === 'button' ? (
                      <ButtonControl id={ctrl.id} label={ctrl.label} onSend={write} />
                    ) : (
                      <SliderControl id={ctrl.id} label={ctrl.label} onSend={write} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <TerminalLog logs={logs} onClear={() => setLogs([])} />
          
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
