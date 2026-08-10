/** Typed message contracts exchanged between the popup and the background. */
export type Message = { type: 'RATE_GET' } | { type: 'RATE_REFRESH' };
