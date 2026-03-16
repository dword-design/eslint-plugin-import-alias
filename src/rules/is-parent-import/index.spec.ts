import { expect, test } from '@playwright/test';

import self from '.';

test.describe('parent', () => {
  test('..', () => expect(self('..')).toEqual(true));
  test('path', () => expect(self('../foo')).toEqual(true));
  test('leading dot', () => expect(self('./..')).toEqual(true));
});

test.describe('subpath', () => {
  test('.', () => expect(self('.')).toEqual(false));
  test('node_modules', () => expect(self('foo')).toEqual(false));
  test('path', () => expect(self('./foo')).toEqual(false));
});
