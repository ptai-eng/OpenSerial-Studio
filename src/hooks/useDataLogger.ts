import { useState, useCallback, useRef } from 'react';

export function useDataLogger() {
  const [isRecording, setIsRecording] = useState(false);
  const [logCount, setLogCount] = useState(0);
  const loggedDataRef = useRef<any[]>([]);
  const isRecordingRef = useRef(false);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    isRecordingRef.current = true;
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    isRecordingRef.current = false;
  }, []);

  const clearLog = useCallback(() => {
    loggedDataRef.current = [];
    setLogCount(0);
  }, []);

  const logData = useCallback((data: Record<string, any>) => {
    if (isRecordingRef.current) {
      loggedDataRef.current.push({ _timestamp: new Date().toISOString(), ...data });
      // Throttle count updates so React doesn't freeze
      if (loggedDataRef.current.length % 50 === 0) {
        setLogCount(loggedDataRef.current.length);
      }
    }
  }, []);

  const exportCSV = useCallback(() => {
    if (loggedDataRef.current.length === 0) return;
    
    const keys = new Set<string>();
    keys.add('_timestamp');
    loggedDataRef.current.forEach(row => {
      Object.keys(row).forEach(k => keys.add(k));
    });
    
    const headers = Array.from(keys);
    let csv = headers.join(',') + '\n';
    
    loggedDataRef.current.forEach(row => {
      csv += headers.map(header => {
        const val = row[header];
        return val !== undefined ? val : '';
      }).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openserial_log_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return { 
    isRecording, 
    startRecording, 
    stopRecording, 
    clearLog, 
    exportCSV, 
    logData, 
    logCount: isRecording ? loggedDataRef.current.length : logCount 
  };
}
