import { describe, expect, it } from 'vitest';
import { formatDuration, formatFrequency, formatPercent, formatUptime, timeAgo } from './format';

describe('formatters', () => {
  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0.25)).toBe('15 min');
    expect(formatDuration(5)).toBe('5.0 h');
    expect(formatDuration(72)).toBe('3.0 d');
  });
  it('formats deployment frequency in the most readable unit', () => {
    expect(formatFrequency(2.5)).toBe('2.5 / day');
    expect(formatFrequency(0.5)).toBe('3.5 / week');
    expect(formatFrequency(0.05)).toBe('1.5 / month');
    expect(formatFrequency(null)).toBe('—');
  });
  it('formats percentages and uptime', () => {
    expect(formatPercent(12.345)).toBe('12.3%');
    expect(formatUptime(59)).toBe('0m 59s');
    expect(formatUptime(3_700)).toBe('1h 1m');
    expect(formatUptime(90_000)).toBe('1d 1h');
  });
  it('formats relative time', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(timeAgo('2026-01-01T11:59:30Z', now)).toBe('30s ago');
    expect(timeAgo('2026-01-01T09:00:00Z', now)).toBe('3h ago');
    expect(timeAgo('2025-12-30T12:00:00Z', now)).toBe('2d ago');
  });
});
