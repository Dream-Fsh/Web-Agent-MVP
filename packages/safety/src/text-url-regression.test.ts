import { expect, it } from 'vitest';
import { redactSensitiveData, redactUrl } from './index.js';
const secret = 'REREVIEW/URL-SECRET';
const encoded = encodeURIComponent(secret);
const absolute = `http://demo:${encoded}@127.0.0.1:9/rta`;
const inputs = [
  `\u0000[${absolute}](${absolute})`,
  `\u0001//demo:${encoded}\\@fixture.test/rta`,
  `before ${absolute} after`,
  `before //demo:${encoded}@fixture.test/rta after`,
  `before https://demo:REREVIEW%252FURL-SECRET@fixture.test/rta after`,
  `before https://demo:REREVIEW\t%2FURL-SECRET@fixture.test/rta after`,
  `before https://demo:REREVIEW\n%2FURL-SECRET@fixture.test/rta after`,
  `before https://demo:REREVIEW\u0002%2FURL-SECRET@fixture.test/rta after`,
  `before http%3A%2F%2Fdemo%3AREREVIEW%252FURL-SECRET%40fixture.test%2Frta after`,
];
it.each(inputs.map((value, i) => [i, value] as const))('cleans ordinary text and table cells, variant %i', (_, value) => {
  const result = redactSensitiveData({ text: value, href: value, rows: [['normal', value, '10001']] });
  for (const marker of [secret, encoded, encodeURIComponent(encoded)]) expect(JSON.stringify(result).toLowerCase()).not.toContain(marker.toLowerCase());
  expect(result.rows[0][0]).toBe('normal'); expect(result.rows[0][2]).toBe('10001');
  expect(result.rows).toHaveLength(1); expect(result.rows[0]).toHaveLength(3);
  if (value.startsWith('before ')) { expect(result.text.startsWith('before ')).toBe(true); expect(result.text.endsWith(' after')).toBe(true); }
  expect(redactSensitiveData(result)).toEqual(result);
});
it('preserves normal prose, relative paths and safe URL text, and existing structured handling', () => {
  const text='正常表格\n账户 10001\t策略 001 ./relative ../relative https://fixture.test/rta //fixture.test/rta';
  expect(redactSensitiveData(text)).toBe(text);
  expect(redactUrl('\u0001'+absolute)).toBe('http://127.0.0.1:9/rta');
  expect(redactSensitiveData({ value:'{{accountId}}' })).toEqual({ value:'{{accountId}}' });
});
