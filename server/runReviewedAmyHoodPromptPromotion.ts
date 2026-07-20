import path from 'node:path';

import { promoteReviewedAmyHoodMasterPrompt } from './promptVersions/reviewedAmyHoodPrompt';

const optionValue = (args: string[], name: string, required = true) => {
  const index = args.indexOf(name);
  if (index < 0) {
    if (required) throw new Error(`${name} is required`);
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
};

const args = process.argv.slice(2);
const root = path.resolve(optionValue(args, '--root', false) ?? process.cwd());
const source = optionValue(args, '--source');
if (!source) throw new Error('--source is required');
const sourcePath = path.resolve(source);

promoteReviewedAmyHoodMasterPrompt(root, sourcePath)
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
