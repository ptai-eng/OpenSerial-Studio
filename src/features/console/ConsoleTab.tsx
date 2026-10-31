import React from 'react';
import { TerminalLog, type TerminalLogItem } from '../../components/widgets/TerminalLog';

interface ConsoleTabProps {
  logs: TerminalLogItem[];
  isActive: boolean;
  onClear: () => void;
  onSend: (cmd: string) => void;
  onSendBytes: (bytes: Uint8Array, hex: string) => void;
}

export const ConsoleTab: React.FC<ConsoleTabProps> = ({
  logs,
  isActive: _isActive,
  onClear,
  onSend,
  onSendBytes,
}) => {
  return (
    <div className="flex flex-col h-full overflow-hidden p-4">
      <div className="flex-1 min-h-0 bg-[#111113] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
        <TerminalLog
          logs={logs}
          onClear={onClear}
          onSend={onSend}
          onSendBytes={onSendBytes}
        />
      </div>
    </div>
  );
};
