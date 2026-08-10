// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPageContext } from '../../src/page/context';

beforeEach(() => {
  document.documentElement.lang = '';
  document.head.innerHTML = '';
});

describe('buildPageContext', () => {
  it('flags a .com.ar domain as Argentine', () => {
    const context = buildPageContext(document, 'tienda.com.ar');
    expect(context.isArgentineDomain).toBe(true);
  });

  it('flags a bare .ar domain as Argentine', () => {
    const context = buildPageContext(document, 'tienda.ar');
    expect(context.isArgentineDomain).toBe(true);
  });

  it('does not flag other TLDs as Argentine', () => {
    const context = buildPageContext(document, 'tienda.com');
    expect(context.isArgentineDomain).toBe(false);
  });

  it('reads the document language attribute', () => {
    document.documentElement.lang = 'es-AR';
    const context = buildPageContext(document, 'example.com');
    expect(context.documentLanguage).toBe('es-AR');
    expect(context.isArgentineLocale).toBe(true);
  });

  it('reads the og:locale meta tag when lang is absent', () => {
    document.head.innerHTML = '<meta property="og:locale" content="es_AR">';
    const context = buildPageContext(document, 'example.com');
    expect(context.isArgentineLocale).toBe(true);
  });

  it('does not flag an unrelated locale', () => {
    document.documentElement.lang = 'en-US';
    const context = buildPageContext(document, 'example.com');
    expect(context.isArgentineLocale).toBe(false);
  });

  it('has neutral structured data signals when there is no JSON-LD', () => {
    const context = buildPageContext(document, 'tienda.com.ar');
    expect(context.declaredArsPrices.size).toBe(0);
    expect(context.hasForeignCurrencyMarkup).toBe(false);
  });

  it('reads declared ARS prices from a JSON-LD Offer', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@type': 'Offer',
      price: '15000',
      priceCurrency: 'ARS',
    });
    document.head.appendChild(script);

    const context = buildPageContext(document, 'tienda.com.ar');
    expect(context.declaredArsPrices.has(15000)).toBe(true);
  });

  it('flags foreign currency markup from a JSON-LD Offer', () => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@type': 'Offer',
      price: 12,
      priceCurrency: 'USD',
    });
    document.head.appendChild(script);

    const context = buildPageContext(document, 'tienda.com.ar');
    expect(context.hasForeignCurrencyMarkup).toBe(true);
  });
});
