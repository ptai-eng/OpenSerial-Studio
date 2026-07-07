import React, { useState } from 'react';
import { X, Code2, Copy, Check } from 'lucide-react';
import { generateArduinoCode, generateSTM32Code } from '../../lib/codegen';
import type { ControlSpec } from '../../lib/codegen';

interface CodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  widgetKeys: string[];
  controls: ControlSpec[];
}

export const CodeGeneratorModal: React.FC<CodeGeneratorModalProps> = ({ 
  isOpen, 
  onClose, 
  widgetKeys, 
  controls 
}) => {
  const [activeTab, setActiveTab] = useState<'arduino' | 'stm32'>('arduino');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const code = activeTab === 'arduino' 
    ? generateArduinoCode(widgetKeys, controls) 
    : generateSTM32Code(widgetKeys, controls);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-accent-blue" />
            <h2 className="text-lg font-bold text-zinc-100">Auto Code Generator</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-100 transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 bg-zinc-900/30">
          <button 
            onClick={() => setActiveTab('arduino')}
            className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'arduino' ? 'border-accent-blue text-accent-blue bg-accent-blue/5' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            Arduino (C++)
          </button>
          <button 
            onClick={() => setActiveTab('stm32')}
            className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'stm32' ? 'border-accent-blue text-accent-blue bg-accent-blue/5' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
            }`}
          >
            STM32 (C / HAL)
          </button>
        </div>

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-6 relative group bg-[#0d0d0f]">
          <button 
            onClick={handleCopy}
            className="absolute top-8 right-8 bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-all opacity-0 group-hover:opacity-100 hover:bg-zinc-700"
          >
            {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">
            <code>{code}</code>
          </pre>
        </div>

      </div>
    </div>
  );
};
