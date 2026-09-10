import { expect, test } from '@playwright/test';

const origin = new URL(process.env.CONCIERGE_TEST_URL || 'http://127.0.0.1:4175/concierge').origin;
const routes = [
  ['home', '/'],
  ['pricing', '/pricing.html'],
  ['resume', '/app/resume'],
  ['job-agent', '/concierge'],
  ['login', '/login.html'],
  ['admin', '/admin.html'],
];
const viewports = [
  ['mobile', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 1000 }],
];

async function auditContrast(page) {
  return page.evaluate(() => {
    const parse = value => {
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const blend = (front, back) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1,
    });
    const luminance = color => {
      const channels = [color.r, color.g, color.b].map(channel => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const ratio = (one, two) => {
      const values = [luminance(one), luminance(two)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const backgroundFor = element => {
      const layers = [];
      for (let node = element; node instanceof Element; node = node.parentElement) {
        const nodeStyle = getComputedStyle(node);
        if (node !== document.body && node !== document.documentElement && nodeStyle.backgroundImage !== 'none') return null;
        const color = parse(nodeStyle.backgroundColor);
        if (color && color.a > 0) layers.push(color);
      }
      let result = parse(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
      if (result.a < 1) result = blend(result, { r: 255, g: 255, b: 255, a: 1 });
      for (let index = layers.length - 1; index >= 0; index -= 1) result = blend(layers[index], result);
      return result;
    };
    const pathFor = element => {
      if (element.id) return `#${element.id}`;
      const parts = [];
      for (let node = element; node && parts.length < 4; node = node.parentElement) {
        let part = node.localName;
        if (!part) break;
        if (node.classList.length) part += `.${[...node.classList].slice(0, 2).join('.')}`;
        parts.unshift(part);
      }
      return parts.join(' > ');
    };
    const hasOwnText = element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    const candidates = [...document.querySelectorAll('body *')].filter(element => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      if (!element.getClientRects().length) return false;
      return hasOwnText(element) || element.matches('input,textarea,select') || (element.matches('button') && (element.innerText || '').trim());
    });
    const failures = [];
    for (const element of candidates) {
      const style = getComputedStyle(element);
      if ((element.textContent || '').trim() === '-') continue;
      if (element.matches('.brand-mark,.journey-orb,.browser-bar span,.check,.dash') || style.webkitTextFillColor === 'transparent' || style.color === 'transparent') continue;
      const foreground = parse(style.color);
      if (!foreground || foreground.a === 0) continue;
      const background = backgroundFor(element);
      if (!background) continue;
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = parseInt(style.fontWeight, 10) || 400;
      const threshold = 3;
      const measured = ratio(blend(foreground, background), background);
      if (measured + 0.01 < threshold) {
        failures.push({
          selector: pathFor(element),
          text: (element.value || element.textContent || element.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 90),
          foreground: style.color,
          background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
          ratio: Number(measured.toFixed(2)),
          required: threshold,
        });
      }
    }
    return failures;
  });
}

for (const [viewportName, viewport] of viewports) {
  test.describe(`${viewportName} theme contrast`, () => {
    test.use({ viewport });

    for (const [routeName, route] of routes) {
      test(`${routeName} has readable light and dark text`, async ({ page }) => {
        for (const theme of ['light', 'dark']) {
          await page.addInitScript(value => localStorage.setItem('1ststep_theme', value), theme);
          await page.goto(origin + route, { waitUntil: 'networkidle' });
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          const failures = await auditContrast(page);
          expect(failures, `${routeName} ${viewportName} ${theme} contrast failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
        }
      });
    }
  });
}
