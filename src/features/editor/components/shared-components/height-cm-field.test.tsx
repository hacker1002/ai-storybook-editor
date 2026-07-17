// height-cm-field.test.tsx — the HEIGHT (CM) field + its RAW-draft contract.
//
// The load-bearing case is `rejects letters instead of silently clearing`: with type="number" the
// browser hands back value === '' for unparseable text while still showing it, so a seeded 110
// would be written back as null (a silent clear) with the field displaying "abc" and no hint. The
// text input keeps the raw string, so the draft stays visibly invalid and Save can gate on it.

import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeightCmField } from './height-cm-field';
import { isHeightDraftValid, heightToDraft, heightDraftToPayload } from './height-cm-draft';

/** Mirrors how the modals own the draft: controlled RAW string. */
function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <HeightCmField value={value} onChange={setValue} />
      <output data-testid="raw">{value}</output>
      <output data-testid="valid">{String(isHeightDraftValid(value))}</output>
    </>
  );
}

const input = () => screen.getByLabelText('Height in centimeters');

describe('heightToDraft / heightDraftToPayload', () => {
  it('seeds a stored number as its string form (no false dirty vs 110)', () => {
    expect(heightToDraft(110)).toBe('110');
    expect(heightToDraft(null)).toBe('');
    expect(heightToDraft(undefined)).toBe('');
  });

  it('maps an empty draft to an explicit null, else the parsed integer', () => {
    expect(heightDraftToPayload('')).toBeNull();
    expect(heightDraftToPayload('110')).toBe(110);
  });
});

describe('isHeightDraftValid', () => {
  it('accepts empty (clear) and integers in [1, 5000]', () => {
    for (const ok of ['', '1', '110', '5000']) expect(isHeightDraftValid(ok)).toBe(true);
  });

  it('rejects out-of-range, decimals, negatives and letters', () => {
    for (const bad of ['0', '5001', '1.5', '-5', 'abc', '11o']) {
      expect(isHeightDraftValid(bad)).toBe(false);
    }
  });
});

describe('HeightCmField', () => {
  it('rejects letters instead of silently clearing a seeded height', async () => {
    const user = userEvent.setup();
    render(<Harness initial="110" />);

    await user.clear(input());
    await user.type(input(), 'abc');

    // The raw text survives — it is NOT collapsed to '' (which would mean "clear me" → null).
    expect(screen.getByTestId('raw')).toHaveTextContent('abc');
    expect(screen.getByTestId('valid')).toHaveTextContent('false');
    expect(input()).toHaveValue('abc');
    expect(input()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Height phải là số nguyên 1–5000 (cm)');
  });

  it('flags an out-of-range number', async () => {
    const user = userEvent.setup();
    render(<Harness initial="110" />);

    await user.clear(input());
    await user.type(input(), '5001');

    expect(screen.getByTestId('valid')).toHaveTextContent('false');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('treats a cleared field as valid (an explicit null on Save) with no hint', async () => {
    const user = userEvent.setup();
    render(<Harness initial="110" />);

    await user.clear(input());

    expect(screen.getByTestId('raw')).toHaveTextContent('');
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input()).toHaveAttribute('aria-invalid', 'false');
  });

  it('accepts a valid edit and stays hint-free', async () => {
    const user = userEvent.setup();
    render(<Harness initial="110" />);

    await user.clear(input());
    await user.type(input(), '95');

    expect(screen.getByTestId('raw')).toHaveTextContent('95');
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
