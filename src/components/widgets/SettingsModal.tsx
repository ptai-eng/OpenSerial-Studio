import React, { useState } from 'react';
import { X, Settings2, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBaudRate: number;
  onSaveBaudRate: (baud: number) => void;
}

const STANDARD_BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  currentBaudRate,
  onSaveBaudRate
}) => {
  const isStandard = STANDARD_BAUD_RATES.includes(currentBaudRate);
  
  const [selectedBaud, setSelectedBaud] = useState<number>(currentBaudRate);
  const [isCustom, setIsCustom] = useState<boolean>(!isStandard);
  const [customBaud, setCustomBaud] = useState<string>(!isStandard ? currentBaudRate.toString() : '');

  if (!isOpen) return null;

  const handleSave = () => {
    if (isCustom) {
      const parsed = parseInt(customBaud, 10);
      if (!isNaN(parsed) && parsed > 0) {
        onSaveBaudRate(parsed);
      }
    } else {
      onSaveBaudRate(selectedBaud);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-accent-blue" />
            <h2 className="text-lg font-bold text-zinc-100">Settings</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-3">Baud Rate</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {STANDARD_BAUD_RATES.map((baud) => (
                <button
                  key={baud}
                  onClick={() => {
                    setIsCustom(false);
                    setSelectedBaud(baud);
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                    !isCustom && selectedBaud === baud 
                      ? 'bg-accent-blue/20 border-accent-blue text-accent-blue' 
                      : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {baud} bps
                </button>
              ))}
              <button
                onClick={() => setIsCustom(true)}
                className={`py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                  isCustom 
                    ? 'bg-accent-blue/20 border-accent-blue text-accent-blue' 
                    : 'bg-zinc-900 border-white/5 text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                Custom
              </button>
            </div>

            {isCustom && (
              <div className="mt-3">
                <label className="text-xs text-zinc-500 mb-1 block">Custom Baud Rate (bps)</label>
                <input
                  type="number"
                  min="1"
                  value={customBaud}
                  onChange={(e) => setCustomBaud(e.target.value)}
                  placeholder="e.g. 74880"
                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-4 py-2 text-sm text-zinc-100 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-zinc-900/30 flex justify-end">
          <button
            onClick={handleSave}
            className="bg-accent-blue hover:bg-accent-blue/90 text-white px-6 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save Settings
          </button>
        </div>

      </div>
    </div>
  );
};
