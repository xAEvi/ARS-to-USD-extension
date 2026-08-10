import type { DetectedAmount, PageContext } from '../../src/core/types';

export type DetectionFixture = {
  description: string;
  text: string;
  context: PageContext;
  expected: Array<Pick<DetectedAmount, 'rawText' | 'valueArs' | 'confidence'>>;
};

/**
 * Builds a `PageContext` for a fixture, filling in the fields most fixtures
 * do not care about with neutral defaults.
 */
function context(overrides: Partial<PageContext> = {}): PageContext {
  return {
    hostname: 'example.com',
    isArgentineDomain: false,
    isArgentineLocale: false,
    declaredArsPrices: new Set<number>(),
    hasForeignCurrencyMarkup: false,
    ...overrides,
  };
}

export const DETECTION_CORPUS: Array<DetectionFixture> = [
  {
    description:
      'explicit ARS prefix on a non-Argentine domain is high confidence',
    text: 'El producto cuesta ARS 15.000 con envio incluido.',
    context: context(),
    expected: [{ rawText: 'ARS 15.000', valueArs: 15000, confidence: 'high' }],
  },
  {
    description: 'AR$ prefix with a decimal amount is high confidence',
    text: 'Precio final: AR$1.234,56',
    context: context(),
    expected: [
      { rawText: 'AR$1.234,56', valueArs: 1234.56, confidence: 'high' },
    ],
  },
  {
    description: '"pesos argentinos" suffix is high confidence',
    text: 'Cuota mensual de 1500 pesos argentinos.',
    context: context(),
    expected: [
      { rawText: '1500 pesos argentinos', valueArs: 1500, confidence: 'high' },
    ],
  },
  {
    description:
      'ambiguous $ matching a JSON-LD declared ARS price is high confidence',
    text: 'Oferta: $1.500',
    context: context({ declaredArsPrices: new Set([1500]) }),
    expected: [{ rawText: '$1.500', valueArs: 1500, confidence: 'high' }],
  },
  {
    description:
      'ambiguous $ with Argentine domain context and es-AR format is medium confidence',
    text: 'Antes $2.000, ahora $1.500.',
    context: context({ isArgentineDomain: true }),
    expected: [
      { rawText: '$2.000', valueArs: 2000, confidence: 'medium' },
      { rawText: '$1.500', valueArs: 1500, confidence: 'medium' },
    ],
  },
  {
    description: 'ambiguous $ without any Argentine context is low confidence',
    text: 'Total: $15.000',
    context: context(),
    expected: [{ rawText: '$15.000', valueArs: 15000, confidence: 'low' }],
  },
  {
    description:
      'ambiguous $ with unambiguous en-US number format is low confidence, even on an Argentine domain',
    text: 'Total: $1,234.56',
    context: context({ isArgentineDomain: true }),
    expected: [{ rawText: '$1,234.56', valueArs: 1234.56, confidence: 'low' }],
  },
  {
    description: 'U$S dollar prefix is rejected outright',
    text: 'Cotizado en U$S 100 para exportacion.',
    context: context(),
    expected: [],
  },
  {
    description: 'USD dollar suffix is rejected outright',
    text: 'El plan cuesta 100 USD por mes.',
    context: context(),
    expected: [],
  },
  {
    description: 'a bare number without any currency marker is never converted',
    text: 'Tenemos 15000 unidades en stock.',
    context: context(),
    expected: [],
  },
  {
    description:
      'ambiguous $ is rejected when the page declares a foreign currency and no ARS signal matches',
    text: 'Precio: $50',
    context: context({ hasForeignCurrencyMarkup: true }),
    expected: [],
  },
];
