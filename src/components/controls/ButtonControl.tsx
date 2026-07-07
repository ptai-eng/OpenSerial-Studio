import React, { useState } from 'react';
import { Power } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ButtonControlProps {
  id: string;
  label: string;
  onSend: (payload: string) => void;
}

export const ButtonControl: React.FC<ButtonControlProps> = ({ id, label, onSend }) => {
  const [isOn, setIsOn] = useState(false);

  const toggle = () => {
    const newState = !isOn;
    setIsOn(newState);
    // Send JSON payload to hardware
    onSend(JSON.stringify({ [id]: newState ? 1 : 0 }) + '\\n');
  };

  return (
    <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
        <span className="text-zinc-500 font-mono text-xs">{id}</span>
      </div>
      
      <button
        onClick={toggle}
        className={cn(
          "relative inline-flex h-10 w-20 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 focus:ring-offset-zinc-950",
          isOn ? "bg-accent-green/20 border border-accent-green/50 shadow-[0_0_15px_rgba(0,255,136,0.2)]" : "bg-zinc-800 border border-white/10"
        )}
      >
        <span
          className={cn(
            "inline-flex h-8 w-8 transform items-center justify-center rounded-full transition-transform duration-300",
            isOn ? "translate-x-11 bg-accent-green" : "translate-x-1 bg-zinc-400"
          )}
        >
          <Power className={cn("h-4 w-4", isOn ? "text-zinc-950" : "text-zinc-800")} />
        </span>
      </button>
    </div>
  );
};
