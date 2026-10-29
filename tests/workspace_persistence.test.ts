import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeWorkspaceProfile,
  parseWorkspaceProfile,
} from '../src/lib/workspace.ts';

describe('OpenSerial Studio — Workspace Persistence & Profile Serialization', () => {
  it('round-trips valid workspace profiles accurately', () => {
    const raw = serializeWorkspaceProfile(
      {
        baudRate: 921600,
        controls: [
          { id: 'LED_1', label: 'LED_1', type: 'button' },
          { id: 'KP_GAIN', label: 'KP_GAIN', type: 'slider', min: 0, max: 10, step: 0.1 },
        ],
        widgetPrefs: {
          Signal_V: 'fft',
          Rotor_rpm: 'line',
        },
        demoPreset: 'dsp_harmonics',
      },
      'STM32 Lab Profile'
    );

    const parsed = parseWorkspaceProfile(raw);
    assert.ok(parsed);
    assert.equal(parsed.version, '2.2');
    assert.equal(parsed.name, 'STM32 Lab Profile');
    assert.equal(parsed.baudRate, 921600);
    assert.equal(parsed.controls.length, 2);
    assert.equal(parsed.controls[1].step, 0.1);
    assert.equal(parsed.widgetPrefs['Signal_V'], 'fft');
    assert.equal(parsed.demoPreset, 'dsp_harmonics');
  });

  it('sanitizes invalid fields, deduplicates control IDs, and rejects corrupt JSON', () => {
    assert.equal(parseWorkspaceProfile('not-json{{{'), null);
    assert.equal(parseWorkspaceProfile('[]'), null);

    const dirty = JSON.stringify({
      baudRate: -500,
      controls: [
        { id: 'PWM_1', type: 'slider', step: -2 },
        { id: 'PWM_1', type: 'button' }, // duplicate ID should be ignored
        { id: '', type: 'button' }, // empty ID should be ignored
      ],
      widgetPrefs: {
        Temp: 'fft',
        BadWidget: 'pie_chart_invalid',
      },
    });

    const sanitized = parseWorkspaceProfile(dirty);
    assert.ok(sanitized);
    assert.equal(sanitized.baudRate, 115200); // fallback default
    assert.equal(sanitized.controls.length, 1);
    assert.equal(sanitized.controls[0].id, 'PWM_1');
    assert.equal(sanitized.controls[0].step, undefined); // negative step stripped
    assert.deepEqual(sanitized.widgetPrefs, { Temp: 'fft' });
  });
});
