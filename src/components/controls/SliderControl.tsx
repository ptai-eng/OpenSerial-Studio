import React, { useState } from 'react';

interface SliderControlProps {
  id: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  onSend: (payload: string) => void;
}

export const SliderControl: React.FC<SliderControlProps> = ({ 
  id, 
  label, 
  min = 0, 
  max = 255, 
  step = 1,
  onSend 
}) => {
  const [value, setValue] = useState<number>(min);

  // Send data when user stops dragging to avoid flooding the serial port
  const handleMouseUp = () => {
    onSend(JSON.stringify({ [id]: value }) + '\\n');
  };

  return (
    <div className="bg-zinc-900 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
          <span className="text-zinc-500 font-mono text-xs">{id}</span>
        </div>
        <div className="text-2xl font-bold text-accent-blue">{value}</div>
      </div>
      
      <div className="relative w-full h-6 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(parseFloat(e.target.value))}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-accent-blue hover:accent-white transition-all focus:outline-none"
        />
      </div>
      <div className="flex justify-between text-xs text-zinc-600 font-mono">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};
