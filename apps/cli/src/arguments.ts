import { resolve } from 'node:path';
export function parseArguments(args:string[]) {
  const positional:string[] = [];
  const variables:Record<string,string> = {};
  let root:string|undefined, url:string|undefined, cdpPort:number|undefined;
  let headless=false, json=false, help=false, confirm=false;
  let skill:string|undefined;
  for (let index=0;index<args.length;index++) {
    const arg=args[index];
    if (arg==='--headless') {headless=true;continue;}
    if (arg==='--confirm') {confirm=true;continue;}
    if (arg==='--json') {json=true;continue;}
    if (arg==='--help'||arg==='-h') {help=true;continue;}
    if (['--root','--url','--cdp-port','--var','--skill'].includes(arg)) {
      const value=args[++index];
      if (value===undefined||value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg==='--root') root=resolve(value);
      if (arg==='--skill') skill=value;
      if (arg==='--url') { const parsed=new URL(value); if (!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password) throw new Error('Invalid browser URL'); url=parsed.href; }
      if (arg==='--cdp-port') {cdpPort=Number(value); if (!Number.isInteger(cdpPort)||cdpPort<1||cdpPort>65535) throw new Error('Invalid CDP port');}
      if (arg==='--var') {
        const separator=value.indexOf('=');const name=value.slice(0,separator);
        if (separator<1||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||Object.hasOwn(variables,name)) throw new Error('Invalid or duplicate variable');
        Object.defineProperty(variables,name,{value:value.slice(separator+1),enumerable:true});
      }
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    positional.push(arg);
  }
  return {positional,variables,root,url,cdpPort,headless,json,help,confirm,skill};
}
