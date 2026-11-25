import { describe, it, expect } from 'vitest';
import React from 'react';
import { Button } from '@/components/ui/Button';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import { Tabs } from '@/components/ui/Tabs';
import { Stepper, StepItem } from '@/components/ui/Stepper';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';

describe('Phase 7 Frontend Design System & Accessibility Primitives', () => {
  describe('Button Accessibility', () => {
    it('creates button element with 44px min touch target and focus ring', () => {
      const el = React.createElement(Button, null, 'Click me');
      // Render forwardRef component
      const btn = Button as unknown as { render: (props: unknown, ref: unknown) => { props: { className: string } } };
      const rendered = btn.render(el.props, null);
      expect(rendered.props.className).toContain('min-h-[44px]');
      expect(rendered.props.className).toContain('focus-visible:ring-2');
      expect(rendered.props.className).toContain('focus-visible:ring-emerald-400');
    });

    it('sets aria-busy and disabled when in loading state', () => {
      const el = React.createElement(Button, { isLoading: true }, 'Submit');
      const btn = Button as unknown as { render: (props: unknown, ref: unknown) => { props: { 'aria-busy': boolean; disabled: boolean } } };
      const rendered = btn.render(el.props, null);
      expect(rendered.props['aria-busy']).toBe(true);
      expect(rendered.props.disabled).toBe(true);
    });
  });

  describe('SeverityBadge Standards', () => {
    it('renders correct accessible text and high-contrast color scheme for critical', () => {
      const element = SeverityBadge({ severity: 'critical' });
      expect(element.props.className).toContain('text-rose-300');
      expect(element.props.className).toContain('border-rose-500/40');
    });

    it('renders warning and info badges with appropriate contrast tokens', () => {
      const warningEl = SeverityBadge({ severity: 'warning' });
      expect(warningEl.props.className).toContain('text-amber-300');

      const infoEl = SeverityBadge({ severity: 'info' });
      expect(infoEl.props.className).toContain('text-sky-300');
    });
  });

  describe('Tabs Accessibility Structure', () => {
    it('renders with role="tablist" and horizontal orientation', () => {
      const tabs = [
        { id: 't1', label: 'Tab 1', count: 3 },
        { id: 't2', label: 'Tab 2', count: 0 },
      ];
      const element = Tabs({ tabs, activeTab: 't1', onChange: () => {} });
      expect(element.props.role).toBe('tablist');
      expect(element.props['aria-orientation']).toBe('horizontal');

      const buttons = element.props.children;
      expect(buttons).toHaveLength(2);
      expect(buttons[0].props.role).toBe('tab');
      expect(buttons[0].props['aria-selected']).toBe(true);
      expect(buttons[0].props.tabIndex).toBe(0);
      expect(buttons[1].props['aria-selected']).toBe(false);
      expect(buttons[1].props.tabIndex).toBe(-1);
    });
  });

  describe('Stepper Live State & ARIA', () => {
    it('renders ordered list with progress navigation and aria-current on active step', () => {
      const steps: StepItem[] = [
        { id: 's1', label: 'Step 1', status: 'completed' },
        { id: 's2', label: 'Step 2', status: 'in_progress', durationMs: 450 },
        { id: 's3', label: 'Step 3', status: 'pending' },
      ];
      const element = Stepper({ steps, orientation: 'horizontal' });
      expect(element.props['aria-label']).toBe('Progress');

      const ol = element.props.children;
      expect(ol.type).toBe('ol');
      const listItems = ol.props.children;
      expect(listItems).toHaveLength(3);
      expect(listItems[1].props['aria-current']).toBe('step');
    });
  });

  describe('Empty and Error States', () => {
    it('renders EmptyState with accessible role and message', () => {
      const element = EmptyState({
        title: 'No findings',
        description: 'Everything passed cleanly.',
      });
      expect(element.props.role).toBe('status');
      expect(element.props['aria-label']).toBe('No findings');
    });

    it('renders ErrorState with role="alert" and aria-live="assertive"', () => {
      const element = ErrorState({
        title: 'Execution error',
        message: 'Network timed out.',
      });
      expect(element.props.role).toBe('alert');
      expect(element.props['aria-live']).toBe('assertive');
    });
  });
});
