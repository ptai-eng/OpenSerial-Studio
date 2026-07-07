import React from 'react';
import { Plug, Zap, Settings, Activity, Code2, Download, Play, Square } from 'lucide-react';
import type { ConnectionStatus } from '../../hooks/useWebSerial';
import { cn } from '../../lib/utils';

interface HeaderProps {
  status: ConnectionStatus;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenCodeGen: () => void;
  onOpenSettings: () => void;
  isRecording?: boolean;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onExportCSV?: () => void;
  logCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ 
  status, onConnect, onDisconnect, onOpenCodeGen, onOpenSettings,
  isRecording, onStartRecording, onStopRecording, onExportCSV, logCount
}) => {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center shadow-lg">
          <Activity className="w-5 h-5 text-accent-blue" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            OpenSerial <span className="text-zinc-500 font-medium">Studio</span>
          </h1>
          <p className="text-xs text-zinc-500 font-mono tracking-wider uppercase">Universal Hardware Dashboard</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-white/5">
          <div className="relative flex h-2.5 w-2.5">
            {status === 'connected' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
            )}
            <span 
              className={cn(
                "relative inline-flex rounded-full h-2.5 w-2.5 transition-colors duration-300",
                status === 'connected' ? "bg-accent-green shadow-[0_0_8px_rgba(0,255,136,0.6)]" : 
                status === 'connecting' ? "bg-yellow-500" : 
                status === 'error' ? "bg-red-500" : "bg-zinc-600"
              )}
            ></span>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting...' : status === 'error' ? 'Error' : 'Disconnected'}
          </span>
        </div>

        {/* Connect Buttons */}
        {status !== 'connected' ? (
          <button 
            onClick={onConnect}
            disabled={status === 'connecting'}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-950 hover:bg-white rounded-lg font-semibold text-sm transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            <Plug className="w-4 h-4" />
            Connect
          </button>
        ) : (
          <>
            <div className="flex items-center gap-2 mr-4">
              <div className="flex items-center gap-2 bg-zinc-900/50 rounded-lg p-1 border border-white/5">
                {!isRecording ? (
                  <button 
                    onClick={onStartRecording}
                    title="Start Data Logging"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-400/10 rounded-md transition-colors"
                  >
                    <Play className="w-4 h-4" /> REC
                  </button>
                ) : (
                  <button 
                    onClick={onStopRecording}
                    title="Stop Data Logging"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-400/10 rounded-md transition-colors animate-pulse"
                  >
                    <Square className="w-4 h-4" /> STOP ({logCount})
                  </button>
                )}
                
                <div className="w-px h-4 bg-white/10 mx-1"></div>
                
                <button 
                  onClick={onExportCSV}
                  disabled={!logCount}
                  title="Export to CSV"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-transparent rounded-md transition-colors"
                >
                  <Download className="w-4 h-4" /> CSV
                </button>
              </div>
            </div>

            <button 
              onClick={onDisconnect}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg font-semibold text-sm transition-all active:scale-95 border border-red-500/20"
            >
              <Zap className="w-4 h-4" />
              Disconnect
            </button>
          </>
        )}
        
        <div className="w-px h-6 bg-white/10 mx-1"></div>
        
        <button 
          onClick={onOpenCodeGen}
          className="p-2 text-zinc-400 hover:text-accent-blue transition-colors rounded-lg hover:bg-accent-blue/10 flex items-center gap-2"
          title="Auto Code Generator"
        >
          <Code2 className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-semibold">Generate Code</span>
        </button>

        <button 
          onClick={onOpenSettings}
          className="p-2 text-zinc-400 hover:text-zinc-100 transition-colors rounded-lg hover:bg-zinc-900"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
