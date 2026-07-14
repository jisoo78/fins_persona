import path from 'node:path';

export const advisorPaths = (root: string) => {
  const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');

  return {
    root: advisorRoot,
    registry: path.resolve(advisorRoot, 'source-registry.json'),
    raw: path.resolve(advisorRoot, 'raw'),
  };
};
