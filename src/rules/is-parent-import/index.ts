export default (path: string) => {
  const segments = path.split('/');

  if (segments[0] === '.') {
    segments.shift();
  }

  return segments[0] === '..';
};
