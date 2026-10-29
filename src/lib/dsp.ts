import type { DataPoint } from './parser';

export type WindowFunctionType = 'hann' | 'hamming' | 'rectangular';

export interface FrequencyBin {
  bin: number;
  frequency: number;
   frequencyLabel: string;
  magnitude: number;
  decibels: number;
}

export interface SignalMetrics {
  count: number;
  min: number;
  max: number;
  mean: number;
  rms: number;
  vpp: number;
  stdDev: number;
  sampleRateHz: number;
  nyquistHz: number;
  freqResolutionHz: number;
  dominantFreqHz: number;
  dominantMagnitude: number;
  fftSize: number;
  jitterMs: number;
  jitterPercent: number;
  isJitterHigh: boolean;
}

/**
 * Computes the next power of two <= n (or >= n when padToNext is true), clamped to [minPow2, maxPow2].
 */
export function resolveFftSize(n: number, maxPow2 = 256): number {
  if (n < 8) return 8;
  const pow2 = Math.pow(2, Math.ceil(Math.log2(n)));
  return Math.min(Math.max(pow2, 16), maxPow2);
}

/**
 * Generates window coefficients w[n] and returns coherent amplitude gain G_coh = (1/N) * sum(w[n]).
 * - Hann:        w[n] = 0.5 * (1 - cos(2*pi*n / (N - 1)))       (Sidelobe: -31.5 dB)
 * - Hamming:     w[n] = 0.54 - 0.46 * cos(2*pi*n / (N - 1))     (Sidelobe: -42.7 dB)
 * - Rectangular: w[n] = 1.0                                      (Dirichlet kernel, -13.3 dB)
 */
export function computeWindow(
  length: number,
  type: WindowFunctionType = 'hann'
): { weights: Float64Array; coherentGain: number } {
  const weights = new Float64Array(length);
  if (length <= 1 || type === 'rectangular') {
    weights.fill(1.0);
    return { weights, coherentGain: 1.0 };
  }

  let sum = 0;
  const denom = length - 1;
  for (let n = 0; n < length; n++) {
    const phase = (2 * Math.PI * n) / denom;
    const w =
      type === 'hann'
        ? 0.5 * (1 - Math.cos(phase))
        : 0.54 - 0.46 * Math.cos(phase);
    weights[n] = w;
    sum += w;
  }

  return {
    weights,
    coherentGain: sum / length,
  };
}

/**
 * In-place Radix-2 Cooley-Tukey Fast Fourier Transform (FFT).
 * Complexity: O(N log2 N) complex butterfly operations vs O(N^2) direct DFT.
 *
 * Factorization:
 *   X[k]       = E[k] + W_N^k * O[k]
 *   X[k + N/2] = E[k] - W_N^k * O[k]
 * where W_N^k = exp(-j * 2 * pi * k / N) = cos(2*pi*k/N) - j*sin(2*pi*k/N).
 *
 * @param real Real part array of length N (must be a power of 2), mutated in-place.
 * @param imag Imaginary part array of length N (must be a power of 2), mutated in-place.
 */
export function radix2FFT(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`radix2FFT requires power-of-two length, received N=${n}`);
  }

  // 1. Bit-Reversal Permutation in-place
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tmpR = real[i];
      real[i] = real[j];
      real[j] = tmpR;

      const tmpI = imag[i];
      imag[i] = imag[j];
      imag[j] = tmpI;
    }
    let bit = n >> 1;
    while (bit >= 1 && j >= bit) {
      j -= bit;
      bit >>= 1;
    }
    j += bit;
  }

  // 2. Iterative Cooley-Tukey Butterfly Stages (stage size len = 2, 4, 8, ..., N)
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;

      for (let k = 0; k < halfLen; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;

        // Complex multiplication: t = W_len^k * X_odd
        const tR = wR * real[oddIdx] - wI * imag[oddIdx];
        const tI = wR * imag[oddIdx] + wI * real[oddIdx];

        const uR = real[evenIdx];
        const uI = imag[evenIdx];

        // Butterfly combination
        real[evenIdx] = uR + tR;
        imag[evenIdx] = uI + tI;
        real[oddIdx] = uR - tR;
        imag[oddIdx] = uI - tI;

        // Advance twiddle factor W_len^(k+1) = W_len^k * W_len^1
        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }
}

/**
 * Direct O(N^2) Discrete Fourier Transform reference implementation (used for numerical verification).
 */
export function naiveDFT(
  inputReal: ArrayLike<number>
): { real: Float64Array; imag: Float64Array } {
  const n = inputReal.length;
  const real = new Float64Array(n);
  const imag = new Float64Array(n);

  for (let k = 0; k < n; k++) {
    let sumR = 0;
    let sumI = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * k * t) / n;
      const x = inputReal[t];
      sumR += x * Math.cos(angle);
      sumI += x * Math.sin(angle);
    }
    real[k] = sumR;
    imag[k] = sumI;
  }

  return { real, imag };
}

export interface SamplingTimingEstimate {
  sampleRateHz: number;
  medianDtMs: number;
  meanDtMs: number;
  jitterMs: number;
  jitterPercent: number;
  isJitterHigh: boolean;
}

/**
 * Robustly estimates sampling rate and inter-sample timing jitter from timestamped history.
 * A high jitter percentage (> 20%) warns that serial polling or USB latency is non-deterministic.
 */
export function estimateSamplingTiming(history: DataPoint[], fallbackHz = 20): SamplingTimingEstimate {
  if (history.length < 3) {
    return {
      sampleRateHz: fallbackHz,
      medianDtMs: 1000 / fallbackHz,
      meanDtMs: 1000 / fallbackHz,
      jitterMs: 0,
      jitterPercent: 0,
      isJitterHigh: false,
    };
  }

  const deltas: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const dt = history[i].timestamp - history[i - 1].timestamp;
    if (dt > 0.2 && dt < 10000) {
      deltas.push(dt);
    }
  }

  if (deltas.length === 0) {
    const totalSpanMs = history[history.length - 1].timestamp - history[0].timestamp;
    const estHz =
      totalSpanMs > 0 ? Number((((history.length - 1) * 1000) / totalSpanMs).toFixed(2)) : fallbackHz;
    return {
      sampleRateHz: estHz,
      medianDtMs: 1000 / estHz,
      meanDtMs: 1000 / estHz,
      jitterMs: 0,
      jitterPercent: 0,
      isJitterHigh: false,
    };
  }

  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianDtMs =
    sorted.length % 2 !== 0 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);

  const sumDt = deltas.reduce((acc, v) => acc + v, 0);
  const meanDtMs = sumDt / deltas.length;
  const effectiveDtMs = meanDtMs > 0 ? meanDtMs : medianDtMs;
  const sampleRateHz = effectiveDtMs > 0 ? Number((1000 / effectiveDtMs).toFixed(2)) : fallbackHz;

  let varianceSum = 0;
  for (const dt of deltas) {
    const diff = dt - meanDtMs;
    varianceSum += diff * diff;
  }
  const jitterMs = Number(Math.sqrt(varianceSum / deltas.length).toFixed(2));
  const jitterPercent = effectiveDtMs > 0 ? Number(((jitterMs / effectiveDtMs) * 100).toFixed(1)) : 0;
  const isJitterHigh = deltas.length >= 8 && jitterPercent > 20.0;

  return {
    sampleRateHz,
    medianDtMs: Number(medianDtMs.toFixed(2)),
    meanDtMs: Number(meanDtMs.toFixed(2)),
    jitterMs,
    jitterPercent,
    isJitterHigh,
  };
}

/**
 * Estimates effective sampling rate f_s (Hz) from timestamped data points.
 * Uses median inter-sample interval to resist occasional serial burst outliers.
 */
export function estimateSampleRateHz(history: DataPoint[], fallbackHz = 20): number {
  return estimateSamplingTiming(history, fallbackHz).sampleRateHz;
}

/**
 * 3-Point Parabolic (Lagrange Quadratic) Interpolation around discrete FFT peak bin k*
 * to estimate sub-bin peak frequency and amplitude:
 *   delta = 0.5 * (alpha - gamma) / (alpha - 2*beta + gamma)
 *   f_peak = (k* + delta) * (f_s / N)
 */
export function interpolatePeakBin(
  magnitudes: Float64Array,
  peakIndex: number,
  sampleRateHz: number,
  fftSize: number
): { frequencyHz: number; magnitude: number } {
  const binFreqStep = sampleRateHz / fftSize;
  if (peakIndex <= 0 || peakIndex >= magnitudes.length - 1) {
    return {
      frequencyHz: Number((peakIndex * binFreqStep).toFixed(2)),
      magnitude: Number(magnitudes[peakIndex].toFixed(4)),
    };
  }

  const alpha = magnitudes[peakIndex - 1];
  const beta = magnitudes[peakIndex];
  const gamma = magnitudes[peakIndex + 1];
  const denom = alpha - 2 * beta + gamma;

  if (Math.abs(denom) < 1e-12) {
    return {
      frequencyHz: Number((peakIndex * binFreqStep).toFixed(2)),
      magnitude: Number(beta.toFixed(4)),
    };
  }

  const delta = 0.5 * ((alpha - gamma) / denom);
  const clampedDelta = Math.max(-0.5, Math.min(0.5, delta));
  const interpolatedFreq = (peakIndex + clampedDelta) * binFreqStep;
  const interpolatedMag = beta - 0.25 * (alpha - gamma) * clampedDelta;

  return {
    frequencyHz: Number(interpolatedFreq.toFixed(2)),
    magnitude: Number(Math.max(beta, interpolatedMag).toFixed(4)),
  };
}

/**
 * Computes both time-domain metrology and single-sided FFT amplitude spectrum
 * from a history buffer of real-valued sensor samples.
 */
export function analyzeSignalAndSpectrum(
  history: DataPoint[],
  windowType: WindowFunctionType = 'hann',
  overrideSampleRateHz?: number
): { metrics: SignalMetrics; spectrum: FrequencyBin[] } {
  const nSamples = history.length;
  if (nSamples === 0) {
    return {
      metrics: {
        count: 0,
        min: 0,
        max: 0,
        mean: 0,
        rms: 0,
        vpp: 0,
        stdDev: 0,
        sampleRateHz: 0,
        nyquistHz: 0,
        freqResolutionHz: 0,
        dominantFreqHz: 0,
        dominantMagnitude: 0,
        fftSize: 0,
        jitterMs: 0,
        jitterPercent: 0,
        isJitterHigh: false,
      },
      spectrum: [],
    };
  }

  // 1. Time-Domain Statistics (Min, Max, Mean/DC, RMS, Vpp, StdDev)
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < nSamples; i++) {
    const v = history[i].value;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sumSq += v * v;
  }

  const mean = sum / nSamples;
  const rms = Math.sqrt(sumSq / nSamples);
  const vpp = max - min;

  let varianceSum = 0;
  for (let i = 0; i < nSamples; i++) {
    const diff = history[i].value - mean;
    varianceSum += diff * diff;
  }
  const stdDev = Math.sqrt(varianceSum / nSamples);

  const timing = estimateSamplingTiming(history);
  const sampleRateHz = overrideSampleRateHz ?? timing.sampleRateHz;
  const nyquistHz = Number((sampleRateHz / 2).toFixed(2));

  if (nSamples < 8) {
    return {
      metrics: {
        count: nSamples,
        min: Number(min.toFixed(3)),
        max: Number(max.toFixed(3)),
        mean: Number(mean.toFixed(3)),
        rms: Number(rms.toFixed(3)),
        vpp: Number(vpp.toFixed(3)),
        stdDev: Number(stdDev.toFixed(3)),
        sampleRateHz,
        nyquistHz,
        freqResolutionHz: 0,
        dominantFreqHz: 0,
        dominantMagnitude: 0,
        fftSize: 0,
        jitterMs: timing.jitterMs,
        jitterPercent: timing.jitterPercent,
        isJitterHigh: timing.isJitterHigh,
      },
      spectrum: [],
    };
  }

  // 2. Prepare Zero-Mean Windowed Frame for Radix-2 FFT
  const fftSize = resolveFftSize(nSamples, 256);
  const activeSamples = Math.min(nSamples, fftSize);
  const startOffset = nSamples - activeSamples;

  const { weights, coherentGain } = computeWindow(activeSamples, windowType);
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);

  for (let i = 0; i < activeSamples; i++) {
    // Subtract DC offset (mean) and apply window function w[i]
    const zeroMeanSample = history[startOffset + i].value - mean;
    real[i] = zeroMeanSample * weights[i];
    imag[i] = 0.0;
  }

  // Zero-padding from activeSamples .. fftSize - 1 is implicit in Float64Array

  // 3. Execute in-place Cooley-Tukey Radix-2 FFT
  radix2FFT(real, imag);

  // 4. Construct Single-Sided Amplitude Spectrum (k = 0 .. N/2)
  const numBins = (fftSize >> 1) + 1;
  const rawMagnitudes = new Float64Array(numBins);
  const spectrum: FrequencyBin[] = [];
  const scaleFactor = 2.0 / (activeSamples * coherentGain);

  let peakBinIndex = 0;
  let maxMag = 0;

  for (let k = 0; k < numBins; k++) {
    const re = real[k];
    const im = imag[k];
    const complexModulus = Math.hypot(re, im);
    // DC (k=0) and Nyquist (k=N/2) are not doubled in single-sided spectrum
    const isEdgeBin = k === 0 || k === fftSize >> 1;
    const mag = isEdgeBin
      ? complexModulus / (activeSamples * coherentGain)
      : complexModulus * scaleFactor;

    rawMagnitudes[k] = mag;
    const freq = (k * sampleRateHz) / fftSize;
    const db = 20 * Math.log10(Math.max(mag, 1e-6));

    if (k >= 1 && k < numBins - 1 && mag > maxMag) {
      maxMag = mag;
      peakBinIndex = k;
    }

    spectrum.push({
      bin: k,
      frequency: Number(freq.toFixed(2)),
      frequencyLabel: `${freq.toFixed(1)} Hz`,
      magnitude: Number(mag.toFixed(4)),
      decibels: Number(db.toFixed(1)),
    });
  }

  // 5. Sub-bin parabolic interpolation around peak bin k*
  const dominant =
    peakBinIndex > 0
      ? interpolatePeakBin(rawMagnitudes, peakBinIndex, sampleRateHz, fftSize)
      : { frequencyHz: 0, magnitude: 0 };

  const freqResolutionHz = Number((sampleRateHz / fftSize).toFixed(3));

  return {
    metrics: {
      count: nSamples,
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      mean: Number(mean.toFixed(3)),
      rms: Number(rms.toFixed(3)),
      vpp: Number(vpp.toFixed(3)),
      stdDev: Number(stdDev.toFixed(3)),
      sampleRateHz,
      nyquistHz,
      freqResolutionHz,
      dominantFreqHz: dominant.frequencyHz,
      dominantMagnitude: dominant.magnitude,
      fftSize,
      jitterMs: timing.jitterMs,
      jitterPercent: timing.jitterPercent,
      isJitterHigh: timing.isJitterHigh,
    },
    spectrum,
  };
}
