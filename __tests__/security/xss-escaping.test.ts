import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizePlainText } from '@/lib/security/sanitize';

describe('P0 Security — Output Escaping and XSS Prevention (lib/security/sanitize.ts)', () => {
  it('escapes raw HTML tags, script elements, and quotes into HTML entities', () => {
    const maliciousScript = '<script>alert("xss")</script>';
    const escaped = escapeHtml(maliciousScript);

    expect(escaped).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</script>');
  });

  it('escapes image onerror payloads and iframe injection payloads', () => {
    const imgPayload = '<img src=x onerror=alert(document.cookie)>';
    const escaped = escapeHtml(imgPayload);

    expect(escaped).toContain('&lt;img');
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&gt;');
  });

  it('escapes single and double quotes to prevent HTML attribute breakout', () => {
    const breakout = `"><script>alert('pwned')</script>`;
    const escaped = escapeHtml(breakout);

    expect(escaped).toContain('&quot;&gt;&lt;script&gt;');
    expect(escaped).toContain('&#x27;pwned&#x27;');
  });

  it('sanitizePlainText strips script and iframe tags completely', () => {
    const textWithScript = 'Hello <script>evil()</script> world <iframe src="evil.com"></iframe>';
    const sanitized = sanitizePlainText(textWithScript);

    expect(sanitized).toBe('Hello  world ');
    expect(sanitized).not.toContain('script');
    expect(sanitized).not.toContain('iframe');
  });
});
