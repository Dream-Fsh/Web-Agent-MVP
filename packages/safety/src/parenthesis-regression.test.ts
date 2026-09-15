import {expect,it} from 'vitest';
import {redactSensitiveData} from './index.js';
const password='(RECHECK-9276-PRIVATE)';
const variants=[
 `before https://demo:${password}@fixture.test/rta after`,
 `before //demo:${password}@fixture.test/rta after`,
 `(https://demo:${password}@fixture.test/rta)`,
 `[link](https://demo:${password}@fixture.test/rta)`,
 `https://demo:pre(RECHECK-9276-PRIVATE)tail@fixture.test/rta`,
 `https://demo:RECHECK-(9276)-PRIVATE@fixture.test/rta`,
 `https://demo:%28RECHECK-9276-PRIVATE%29@fixture.test/rta`,
 `http%3A%2F%2Fdemo%3A(RECHECK-9276-PRIVATE)%40fixture.test%2Frta`,
 `\u0001//demo:(RECHECK-9276-PRIVATE)\\@fixture.test/rta`,
 `https://demo:(RECHECK-\n9276-PRIVATE)@fixture.test/rta`,
 `https://demo:(RECHECK-\t9276-PRIVATE)@fixture.test/rta`,
 `https://demo:(RECHECK-\u0002-9276-PRIVATE)@fixture.test/rta`,
 `[https://demo:${password}@fixture.test/rta](https://other:${password}@fixture.test/rta)`,
];
it.each(variants.map((value,i)=>[i,value] as const))('parenthesized userinfo has no residual password: %i',(_,text)=>{
 const result=redactSensitiveData({text,rows:[['normal',text,'10001']]});
 const serialized=JSON.stringify(result);
 for(const fragment of ['RECHECK','9276','PRIVATE']) expect(serialized).not.toContain(fragment);
 expect(result.rows[0][0]).toBe('normal');expect(result.rows[0][2]).toBe('10001');expect(result.rows[0]).toHaveLength(3);
 if(text.startsWith('before ')){expect(result.text).toMatch(/^before /);expect(result.text).toMatch(/ after$/);}
 expect(redactSensitiveData(result)).toEqual(result);
});
it('preserves external punctuation, Markdown, normal paths and multiple safe URLs',()=>{
 for(const text of ['(https://fixture.test/rta)', '[link](https://fixture.test/rta)', 'see https://fixture.test/a(b)c, then //fixture.test/rta.', 'normal ./relative ../relative {{accountId}}']) expect(redactSensitiveData(text)).toBe(text);
 expect(new URL(`https://demo:${password}@fixture.test/rta`).password).toBe(password);
});
