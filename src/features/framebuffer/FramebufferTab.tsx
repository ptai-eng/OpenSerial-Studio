import React from 'react';
import { CanvasWidget } from '../../components/widgets/CanvasWidget';
import { EmptyState } from '../../components/shell/EmptyState';
import type { PixelData } from '../../lib/framebuffer';

interface FramebufferTabProps {
  incomingPixels: PixelData[];
  isActive: boolean;
  hasPixels: boolean;
  onClear: () => void;
  onSelectDemo: () => void;
}

export const FramebufferTab: React.FC<FramebufferTabProps> = ({
  incomingPixels,
  isActive: _isActive,
  hasPixels,
  onClear,
  onSelectDemo,
}) => {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {!hasPixels && incomingPixels.length === 0 ? (
        <EmptyState
          badge="8-Byte Pixel Framebuffer"
          title="No Framebuffer Pixels Ingested"
          description="Send binary 8-byte pixel packets [0xAA, 0x55, X, Y, R, G, B, CoreID] or JSON pixel streams over UART to render real-time graphical displays."
          codeSnippet={`// Binary Packet Format (8 bytes):\n[0xAA, 0x55, X_COORD, Y_COORD, R, G, B, CORE_ID]\n\n// Fast C++ Macro:\n#define SEND_PIXEL(x, y, r, g, b, core) \\\n  uint8_t pkt[8] = {0xAA, 0x55, (uint8_t)(x), (uint8_t)(y), (r), (g), (b), (core)}; \\\n  Serial.write(pkt, 8);`}
          actionLabel="Try 3D GPU Raymarcher Demo"
          onAction={onSelectDemo}
        />
      ) : (
        <div className="w-full max-w-4xl mx-auto">
          <CanvasWidget incomingPixels={incomingPixels} onClear={onClear} />
        </div>
      )}
    </div>
  );
};
