import React, { useState, useRef } from 'react';
import { PlusCircle, Trash2, SlidersHorizontal } from 'lucide-react';
import { useStudioStore } from '../../store/useStudioStore';
import { ButtonControl } from '../../components/controls/ButtonControl';
import { SliderControl } from '../../components/controls/SliderControl';
import { EmptyState } from '../../components/shell/EmptyState';
import type { ControlConfig } from '../../lib/workspace';

interface ControlsTabProps {
  isActive: boolean;
  onSend: (data: string) => void;
}

export const ControlsTab: React.FC<ControlsTabProps> = ({ isActive: _isActive, onSend }) => {
  const controls = useStudioStore((s) => s.controls);
  const addControl = useStudioStore((s) => s.addControl);
  const updateControl = useStudioStore((s) => s.updateControl);
  const deleteControl = useStudioStore((s) => s.deleteControl);

  const [newControlId, setNewControlId] = useState('');
  const [newControlType, setNewControlType] = useState<'button' | 'slider' | 'toggle' | 'numeric'>('button');
  const [newControlGroup, setNewControlGroup] = useState('General');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAddControl = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newControlId.trim();
    if (!cleaned) return;
    if (controls.some((c) => c.id === cleaned)) {
      setNewControlId('');
      return;
    }

    const newCtrl: ControlConfig = {
      id: cleaned,
      label: cleaned,
      type: newControlType,
      group: newControlGroup.trim() || 'General',
      pinTo: ['controls'],
      min: newControlType === 'slider' ? 0 : undefined,
      max: newControlType === 'slider' ? 100 : undefined,
      step: newControlType === 'slider' ? 1 : undefined,
    };

    addControl(newCtrl);
    setNewControlId('');
    inputRef.current?.focus();
  };

  const handleSliderConfigChange = (
    id: string,
    patch: { min: number; max: number; step: number }
  ) => {
    updateControl(id, patch);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-6 max-w-4xl mx-auto w-full">
      {/* Header and Creator Form */}
      <div className="bg-[#111113] border border-white/[0.08] rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
              <span>Virtual Control Studio (TX)</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Transmit JSON key-value commands over UART to interact with MCU firmware in real time.
            </p>
          </div>
          <span className="text-[11px] font-mono text-zinc-500 bg-zinc-900 border border-white/5 px-2 py-0.5 rounded">
            JSON + \n
          </span>
        </div>

        <form onSubmit={handleAddControl} className="flex flex-wrap gap-2">
          <input
            type="text"
            ref={inputRef}
            value={newControlId}
            onChange={(e) =>
              setNewControlId(
                e.target.value.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
              )
            }
            placeholder="Key / Var Name (e.g. KP_GAIN, LED_1)"
            className="flex-1 min-w-[160px] bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
          />

          <select
            value={newControlType}
            onChange={(e) =>
              setNewControlType(e.target.value as 'button' | 'slider' | 'toggle' | 'numeric')
            }
            className="bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-400"
          >
            <option value="button">Button (Momentary)</option>
            <option value="slider">Slider (Range)</option>
            <option value="toggle">Toggle (Latch ON/OFF)</option>
            <option value="numeric">Numeric (Exact Input)</option>
          </select>

          <input
            type="text"
            value={newControlGroup}
            onChange={(e) => setNewControlGroup(e.target.value)}
            placeholder="Group (e.g. PID, Camera)"
            className="w-32 bg-[#09090b] border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            className="flex items-center gap-1.5 bg-cyan-500 text-zinc-950 font-semibold px-4 py-2 rounded-lg text-xs hover:bg-cyan-400 transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Control</span>
          </button>
        </form>
      </div>

      {/* Control List */}
      {controls.length === 0 ? (
        <EmptyState
          badge="Virtual Hardware Controls"
          title="No Controls Configured"
          description="Create sliders, buttons, or toggles above to transmit parameter updates to your MCU without flashing new code."
          codeSnippet={`// Generated MCU command when clicked:\n{"LED_1": 1}\n\n// Generated MCU command when slider moved:\n{"KP_GAIN": 12.5}`}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {controls.map((ctrl) => (
              <div
                key={ctrl.id}
                className="relative group bg-[#111113] border border-white/[0.08] rounded-xl p-4 transition-colors hover:border-white/20"
              >
                <button
                  type="button"
                  onClick={() => deleteControl(ctrl.id)}
                  className="absolute right-2 top-2 p-1.5 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-zinc-800"
                  title="Delete Control"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {ctrl.type === 'button' ? (
                  <ButtonControl id={ctrl.id} label={ctrl.label} onSend={onSend} />
                ) : ctrl.type === 'slider' ? (
                  <SliderControl
                    id={ctrl.id}
                    label={ctrl.label}
                    min={ctrl.min}
                    max={ctrl.max}
                    step={ctrl.step}
                    onSend={onSend}
                    onConfigChange={(id, patch) => handleSliderConfigChange(id, patch)}
                  />
                ) : (
                  // Fallback or preview for toggle/numeric in Step 1
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-zinc-300 font-mono">
                      <span>{ctrl.label}</span>
                      <span className="text-[10px] text-zinc-500 uppercase">{ctrl.type}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSend(JSON.stringify({ [ctrl.id]: 1 }))}
                      className="w-full py-1.5 rounded-lg bg-zinc-900 border border-white/10 hover:border-white/20 text-xs text-zinc-200 font-mono transition-colors"
                    >
                      Trigger {ctrl.id}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
