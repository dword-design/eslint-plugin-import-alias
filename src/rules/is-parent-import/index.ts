import pathLib from 'node:path';

export default (path: string) => {
  const segments = path.split(pathLib.sep);

  if (segments[0] === '.') {
    segments.shift();
  }

  return segments[0] === '..';
};
