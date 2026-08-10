// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeFeedbackPopover,
  showFeedbackPopover,
} from '../../src/page/feedback-popover';

function getHost(): HTMLElement | null {
  return document.getElementById('aru-feedback-popover-host');
}

function button(text: string): HTMLButtonElement {
  const host = getHost()!;
  const buttons = Array.from(
    host.shadowRoot!.querySelectorAll<HTMLButtonElement>('button'),
  );
  const match = buttons.find((el) => el.textContent === text);
  if (!match) throw new Error(`No button found with text "${text}"`);
  return match;
}

beforeEach(() => {
  document.body.innerHTML = '';
  closeFeedbackPopover();
});

describe('showFeedbackPopover', () => {
  it('mounts a single host with a shadow root attached to body', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);

    showFeedbackPopover(anchor, () => {});

    const host = getHost();
    expect(host).not.toBeNull();
    expect(host!.shadowRoot).not.toBeNull();
    expect(host!.parentElement).toBe(document.body);
  });

  it('calls onConfirm with not-a-price and location scope by default', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);
    const onConfirm = vi.fn();

    showFeedbackPopover(anchor, onConfirm);
    button('No es un precio').click();

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'not-a-price',
      scope: 'location',
    });
    expect(getHost()).toBeNull();
  });

  it('calls onConfirm with not-ars and location scope by default', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);
    const onConfirm = vi.fn();

    showFeedbackPopover(anchor, onConfirm);
    button('No está en pesos').click();

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'not-ars',
      scope: 'location',
    });
  });

  it('switches the scope to location-group when the checkbox is checked', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);
    const onConfirm = vi.fn();

    showFeedbackPopover(anchor, onConfirm);
    const checkbox = getHost()!.shadowRoot!.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    checkbox.click();
    button('No es un precio').click();

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'not-a-price',
      scope: 'location-group',
    });
  });

  it('closes without calling onConfirm when Cancelar is clicked', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);
    const onConfirm = vi.fn();

    showFeedbackPopover(anchor, onConfirm);
    button('Cancelar').click();

    expect(onConfirm).not.toHaveBeenCalled();
    expect(getHost()).toBeNull();
  });

  it('closes a previously open popover when opened again', () => {
    const anchor = document.createElement('span');
    document.body.appendChild(anchor);

    showFeedbackPopover(anchor, () => {});
    const firstHost = getHost();
    showFeedbackPopover(anchor, () => {});

    expect(
      document.querySelectorAll('#aru-feedback-popover-host'),
    ).toHaveLength(1);
    expect(getHost()).not.toBe(firstHost);
  });
});
