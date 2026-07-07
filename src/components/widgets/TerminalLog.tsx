import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

interface TerminalLogProps {
  logs: string[];
  onClear: () => void;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden h-64">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-zinc-900/50">
        <div className="flex items-center gap-2 text-zinc-400">
          <Terminal className="w-4 h-4" />
          <h3 className="text-sm font-semibold text-zinc-300">Terminal Log</h3>
        </div>
        <button 
          onClick={onClear}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-white/5"
          title="Clear Log"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-xs text-zinc-400 space-y-1"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600 italic">No data received yet...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="break-all">
              <span className="text-zinc-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
              <span className="text-accent-blue">{log}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
