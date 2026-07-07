import React, { useEffect, useState, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ChartType = 'line' | 'bar' | 'gauge';

interface ChartWidgetProps {
  label: string;
  value: number;
  unit?: string;
  displayType: ChartType;
  onChangeType: (type: ChartType) => void;
}

interface DataPoint {
  time: string;
  value: number;
}

const GaugeChart = ({ value }: { value: number }) => {
  // Simple SVG semi-circle gauge
  // Value usually from 0 to 100 for gauge, but let's make it auto-scale based on history or just 0-100 default
  // For generic gauge, we clamp between 0 and 100 for now.
  const normalizedValue = Math.min(Math.max(value, 0), 100);
  const angle = (normalizedValue / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <div className="flex-1 w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
      <svg viewBox="0 0 200 120" className="w-full h-full max-w-[200px] drop-shadow-xl">
        {/* Background Arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" strokeLinecap="round" />
        {/* Progress Arc */}
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#00d4ff" strokeWidth="16" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * normalizedValue / 100)} className="transition-all duration-300" />
        
        {/* Needle */}
        <g transform={`translate(100, 100) rotate(${angle})`} className="transition-transform duration-300">
          <polygon points="-4,0 4,0 0,-70" fill="#f4f4f5" />
          <circle cx="0" cy="0" r="8" fill="#18181b" stroke="#f4f4f5" strokeWidth="2" />
        </g>
        
        <text x="20" y="115" fill="#71717a" fontSize="12" textAnchor="middle">0</text>
        <text x="180" y="115" fill="#71717a" fontSize="12" textAnchor="middle">100</text>
      </svg>
    </div>
  );
};

export const ChartWidget: React.FC<ChartWidgetProps> = ({ label, value, unit, displayType, onChangeType }) => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const now = new Date();
    const timeStr = `${now.getSeconds()}.${now.getMilliseconds()}`;
    
    setData(prev => {
      const newData = [...prev, { time: timeStr, value }];
      if (newData.length > 50) return newData.slice(newData.length - 50);
      return newData;
    });
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="bg-zinc-900 border border-white/5 rounded-2xl p-4 flex flex-col h-64 relative">
      <div className="flex justify-between items-center mb-4 relative">
        <h3 className="text-zinc-400 text-sm font-medium tracking-wide uppercase">{label}</h3>
        
        <div className="flex items-center gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-zinc-100">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
            {unit && <span className="text-sm text-zinc-500">{unit}</span>}
          </div>
          
          <div className="relative" ref={menuRef}>
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 rounded-md transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-32 bg-zinc-800 border border-white/10 rounded-lg shadow-xl overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-1">
                  {(['line', 'bar', 'gauge'] as ChartType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { onChangeType(t); setShowMenu(false); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm rounded-md transition-colors capitalize",
                        displayType === t ? "bg-accent-blue/10 text-accent-blue" : "text-zinc-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {t} Chart
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex-1 w-full min-h-0 relative">
        {displayType === 'line' && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
              <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ color: '#00d4ff' }} animationDuration={150} />
              <Line type="monotone" dataKey="value" stroke="#00d4ff" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
        
        {displayType === 'bar' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="time" hide />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
              <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px' }} itemStyle={{ color: '#10b981' }} animationDuration={150} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="value" fill="#10b981" radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {displayType === 'gauge' && <GaugeChart value={value} />}
      </div>
    </div>
  );
};
