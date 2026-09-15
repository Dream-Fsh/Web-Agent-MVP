import { expect, it } from 'vitest';
import { redactUrl, REDACTED } from './index.js';
const secret = 'REREVIEW/URL-SECRET';
const encoded = encodeURIComponent(secret);
const cases = Array.from({length:32},(_,code)=>[code,String.fromCharCode(code)] as const);
it.each(cases)('normalizes C0 prefix %i consistently before classification', (_code, control) => {
  for (const prefix of [control, ' '+control+' \t', '\r'+control+'\n']) {
    for (const [input, expected] of [
      [`http://demo:${encoded}@127.0.0.1:9/rta`, 'http://127.0.0.1:9/rta'],
      [`//demo:${encoded}@fixture.test/rta`, '//fixture.test/rta'],
      [`\\\\demo:${encoded}\\@fixture.test/rta`, '//demo/']
    ]) {
      const output = redactUrl(prefix+input);
      expect(output).not.toContain(secret);
      expect(output.toLowerCase()).not.toContain(encoded.toLowerCase());
      expect(redactUrl(output)).toBe(output);
      if (!input.includes('\\')) expect(output).toBe(expected);
      if (output !== REDACTED) {
        const parsed = new URL(output, 'https://base.test/');
        expect(parsed.username).toBe(''); expect(parsed.password).toBe('');
      }
    }
  }
});
it('preserves relative meaning without emitting the parsing base and safely rejects unsupported forms',()=>{
  for(const value of ['../report','./report','/rta/list#section','report','?key=secret','#section']) {
    const expected = value === '?key=secret' ? '' : value;
    expect(redactUrl(value)).toBe(expected);
    expect(redactUrl(redactUrl(value))).toBe(expected);
  }
  for(const value of [`https://[bad?key=${encoded}`,`/report\u0001${encoded}`,`javascript:${encoded}`]) {
    expect(redactUrl(value)).toBe(REDACTED);
    expect(redactUrl(REDACTED)).toBe(REDACTED);
  }
});

it('redacts the verbatim pasted control-character forms, including a Markdown-wrapped URL',()=>{
 const absolute=`http://demo:${encoded}@127.0.0.1:9/rta`;
 for(const value of [String.fromCharCode(0)+`[${absolute}](${absolute})`,String.fromCharCode(1)+`//demo:${encoded}\\@fixture.test/rta`]) {
  expect(redactUrl(value)).toBe(REDACTED);
  expect(redactUrl(redactUrl(value))).toBe(REDACTED);
 }
 expect(redactUrl('/report?next=https://fixture.test/rta')).toBe('/report');
});
it('never resolves scheme-qualified input against the virtual relative-path base',()=>{
 for(const value of ['https:report','https:/report']) {
  expect(redactUrl(value)).toBe(new URL(value).href);
  expect(redactUrl(value)).not.toContain('redaction.invalid');
 }
});
