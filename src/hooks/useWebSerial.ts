import { useState, useCallback, useRef, useEffect } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useWebSerial() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<any | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);
  const keepReadingRef = useRef<boolean>(true);

  const connect = useCallback(async (baudRate = 115200) => {
    try {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API is not supported in your browser.');
      }
      const serial = (navigator as any).serial;

      setStatus('connecting');
      setError(null);

      // Request a port and open a connection
      const port = await serial.requestPort();
      await port.open({ baudRate });
      
      portRef.current = port;
      setStatus('connected');
      keepReadingRef.current = true;

    } catch (err: any) {
      console.error('Serial Connection Error:', err);
      setStatus('error');
      setError(err.message || 'Failed to connect');
      portRef.current = null;
    }
  }, []);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;
    
    try {
      if (readerRef.current) {
        await readerRef.current.cancel().catch(() => {});
        readerRef.current = null;
      }
      if (writerRef.current) {
        await writerRef.current.abort().catch(() => {});
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
      setError(err.message || 'Failed to disconnect');
    }
  }, []);

  // Handle physical disconnect events
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

  // Write data to the serial port
  const write = useCallback(async (data: string) => {
    if (!portRef.current || status !== 'connected') {
      console.warn('Cannot write: Port not connected');
      return;
    }

    try {
      if (!writerRef.current) {
        const textEncoder = new TextEncoderStream();
        textEncoder.readable.pipeTo(portRef.current.writable!).catch(() => {});
        writerRef.current = textEncoder.writable.getWriter();
      }
      
      await writerRef.current.write(data);
    } catch (err: any) {
      console.error('Serial Write Error:', err);
      setError(err.message || 'Failed to write data');
    }
  }, [status]);

  // Read data from the serial port (continuous loop)
  const readLoop = useCallback(async (onDataReceived: (data: string) => void) => {
    if (!portRef.current || status !== 'connected') return;

    try {
      const textDecoder = new TextDecoderStream();
      portRef.current.readable!.pipeTo(textDecoder.writable).catch(() => {});
      readerRef.current = textDecoder.readable.getReader();

      let buffer = '';

      while (keepReadingRef.current && portRef.current) {
        const { value, done } = await readerRef.current.read();
        
        if (done) break;
        if (value) {
          buffer += value;
          // Process full lines
          const lines = buffer.split('\n');
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) onDataReceived(trimmed);
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'NetworkError' || err.message.includes('The device has been lost')) {
         console.warn('Device unexpectedly disconnected');
         await disconnect();
      } else {
        console.error('Serial Read Error:', err);
        setError(err.message || 'Error reading data');
      }
    } finally {
      if (readerRef.current) {
        readerRef.current.releaseLock();
      }
    }
  }, [status, disconnect]);

  return {
    status,
    error,
    connect,
    disconnect,
    write,
    readLoop
  };
}
