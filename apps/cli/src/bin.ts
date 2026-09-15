#!/usr/bin/env node
import { runCli } from './index.js';
const abort = new AbortController();
process.on('SIGINT',()=>abort.abort());
process.on('SIGTERM',()=>abort.abort());
try {
  const result = await runCli(process.argv.slice(2),{onOutput:line=>console.log(line),onExitCode:code=>{process.exitCode=code;},signal:abort.signal});
  if (result) console.log(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Command failed');
  process.exitCode=1;
}
