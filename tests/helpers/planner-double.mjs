// Explicit CI/test subprocess double. Never used by the default production path.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const fixture = JSON.parse(process.argv[2]);
const request = JSON.parse(input.trim().split('\n').at(-1));
if (request.task !== fixture.task || request.skills.length < 2 ||
  Object.keys(request).sort().join(',') !== 'selectedSkillId,skills,suppliedParameters,task') process.exit(3);
console.log(JSON.stringify(fixture.decision));
