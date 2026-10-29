import { useState, useCallback, useRef, useEffect } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SerialConnectionOptions {
  baudRate?: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd';
}

export function useWebSerial() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<any | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const keepReadingRef = useRef<boolean>(true);
  const encoderRef = useRef<TextEncoder>(new TextEncoder());

  const connect = useCallback(async (baudRate = 115200, options?: Omit<SerialConnectionOptions, 'baudRate'>) => {
    try {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      }
      const serial = (navigator as any).serial;

      setStatus('connecting');
      setError(null);

      const port = await serial.requestPort();
      await port.open({
        baudRate,
        dataBits: options?.dataBits ?? 8,
        stopBits: options?.stopBits ?? 1,
        parity: options?.parity ?? 'none',
      });

      portRef.current = port;
      setStatus('connected');
      keepReadingRef.current = true;
    } catch (err: any) {
      console.error('Serial Connection Error:', err);
      setStatus('error');
      setError(err?.message || 'Failed to connect');
      portRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {});
        try {
          readerRef.current.releaseLock();
        } catch {
          // Lock already released
        }
        readerRef.current = null;
      }
      if (writerRef.current) {
        try {
          writerRef.current.releaseLock();
        } catch {
          // Lock already released
        }
        writerRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close().catch(() => {});
        portRef.current = null;
      }
      setStatus('disconnected');
      setError(null);
    } catch (err: any) {
      console.error('Serial Disconnect Error:', err);
      setError(err?.message || 'Failed to disconnect');
    }
  }, []);

  useEffect(() => {
    const handlePhysicalDisconnect = (e: any) => {
      if (portRef.current && e.target === portRef.current) {
        console.warn('Device physically disconnected');
        setStatus('disconnected');
        setError('Device was physically unplugged');

        keepReadingRef.current = false;
        readerRef.current = null;
        writerRef.current = null;
        portRef.current = null;
      }
    };

    if ('serial' in navigator) {
      (navigator as any).serial.addEventListener('disconnect', handlePhysicalDisconnect);
      return () => {
        (navigator as any).serial.removeEventListener('disconnect', handlePhysicalDisconnect);
      };
    }
  }, []);

  const writeBytes = useCallback(async (bytes: Uint8Array) => {
    if (!portRef.current || status !== 'connected') {
      console.warn('Cannot write: Port not connected');
      return;
    }

    try {
      if (!writerRef.current) {
        writerRef.current = portRef.current.writable!.getWriter();
      }
      await writerRef.current!.write(bytes);
    } catch (err: any) {
      console.error('Serial Write Error:', err);
      setError(err?.message || 'Failed to write data');
    }
  }, [status]);

  const write = useCallback(async (data: string) => {
    const encoded = encoderRef.current.encode(data);
    await writeBytes(encoded);
  }, [writeBytes]);

  const readLoop = useCallback(
    async (
      onDataReceived: (data: string) => void,
      onRawData?: (chunk: Uint8Array) => void
    ) => {
      if (!portRef.current || status !== 'connected') return;

      try {
        const reader: ReadableStreamDefaultReader<Uint8Array> = portRef.current.readable!.getReader();
        readerRef.current = reader;

        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
        let buffer = '';

        while (keepReadingRef.current && portRef.current) {
          const { value, done } = await reader.read();

          if (done) break;
          if (value && value.length > 0) {
            // 1. Emit raw byte chunk before any UTF-8 decoding to preserve binary protocols
            if (onRawData) {
              try {
                onRawData(value);
              } catch (rawErr) {
                console.error('Error in onRawData callback:', rawErr);
              }
            }

            // 2. Decode streaming UTF-8 text line buffer
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed) onDataReceived(trimmed);
            }
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (err?.name === 'NetworkError' || msg.includes('The device has been lost')) {
          console.warn('Device unexpectedly disconnected');
          await disconnect();
        } else {
          console.error('Serial Read Error:', err);
          setError(msg || 'Error reading data');
        }
      } finally {
        if (readerRef.current) {
          try {
            readerRef.current.releaseLock();
          } catch {
            // Ignore if already unlocked
          }
        }
      }
    },
    [status, disconnect]
  );

  return {
    status,
    error,
    connect,
    disconnect,
    write,
    writeBytes,
    readLoop,
  };
}
