// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { collectTextNodes } from '../../src/page/walker';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('collectTextNodes', () => {
  it('collects plain text nodes in document order', () => {
    document.body.innerHTML = '<p>Precio: $1.500</p><p>Envio gratis</p>';

    const nodes = collectTextNodes(document.body);

    expect(nodes.map((node) => node.textContent)).toEqual([
      'Precio: $1.500',
      'Envio gratis',
    ]);
  });

  it('skips whitespace-only text nodes', () => {
    document.body.innerHTML = '<div>   \n  </div><p>$1.500</p>';

    const nodes = collectTextNodes(document.body);

    expect(nodes.map((node) => node.textContent)).toEqual(['$1.500']);
  });

  it('skips script, style, noscript and template content', () => {
    document.body.innerHTML = `
      <script>const price = 1500;</script>
      <style>.price { color: red; }</style>
      <noscript>$1.500</noscript>
      <template><p>$1.500</p></template>
      <p>$1.500</p>
    `;

    const nodes = collectTextNodes(document.body);

    expect(nodes.map((node) => node.textContent?.trim())).toEqual(['$1.500']);
  });

  it('skips form control content', () => {
    document.body.innerHTML = `
      <textarea>$1.500</textarea>
      <select><option>$1.500</option></select>
      <p>$1.500</p>
    `;

    const nodes = collectTextNodes(document.body);

    expect(nodes.map((node) => node.textContent?.trim())).toEqual(['$1.500']);
  });

  it('skips text inside a contenteditable region, including nested elements', () => {
    document.body.innerHTML = `
      <div contenteditable="true"><span>$1.500</span></div>
      <p>$1.500</p>
    `;

    const nodes = collectTextNodes(document.body);

    expect(nodes.map((node) => node.textContent?.trim())).toEqual(['$1.500']);
  });

  it('skips text already inside a previous annotation, for idempotency', () => {
    document.body.innerHTML = `
      <span data-aru-wrap data-aru-original="$1.500" data-aru-confidence="high">
        $1.500<span data-aru-usd> (USD 1,25)</span>
      </span>
      <p>$2.000</p>
    `;

    const nodes = collectTextNodes(document.body);

    expect(nodes.map((node) => node.textContent?.trim())).toEqual(['$2.000']);
  });
});
