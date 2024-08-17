<!-- TITLE/ -->
# @dword-design/eslint-plugin-import-alias
<!-- /TITLE -->

<!-- BADGES/ -->
  <p>
    <a href="https://npmjs.org/package/@dword-design/eslint-plugin-import-alias">
      <img
        src="https://img.shields.io/npm/v/@dword-design/eslint-plugin-import-alias.svg"
        alt="npm version"
      >
    </a><img src="https://img.shields.io/badge/os-linux%20%7C%C2%A0macos%20%7C%C2%A0windows-blue" alt="Linux macOS Windows compatible"><a href="https://github.com/dword-design/eslint-plugin-import-alias/actions">
      <img
        src="https://github.com/dword-design/eslint-plugin-import-alias/workflows/build/badge.svg"
        alt="Build status"
      >
    </a><a href="https://codecov.io/gh/dword-design/eslint-plugin-import-alias">
      <img
        src="https://codecov.io/gh/dword-design/eslint-plugin-import-alias/branch/master/graph/badge.svg"
        alt="Coverage status"
      >
    </a><a href="https://david-dm.org/dword-design/eslint-plugin-import-alias">
      <img src="https://img.shields.io/david/dword-design/eslint-plugin-import-alias" alt="Dependency status">
    </a><img src="https://img.shields.io/badge/renovate-enabled-brightgreen" alt="Renovate enabled"><br/><a href="https://gitpod.io/#https://github.com/dword-design/eslint-plugin-import-alias">
      <img
        src="https://gitpod.io/button/open-in-gitpod.svg"
        alt="Open in Gitpod"
        width="114"
      >
    </a><a href="https://www.buymeacoffee.com/dword">
      <img
        src="https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg"
        alt="Buy Me a Coffee"
        width="114"
      >
    </a><a href="https://paypal.me/SebastianLandwehr">
      <img
        src="https://sebastianlandwehr.com/images/paypal.svg"
        alt="PayPal"
        width="163"
      >
    </a><a href="https://www.patreon.com/dworddesign">
      <img
        src="https://sebastianlandwehr.com/images/patreon.svg"
        alt="Patreon"
        width="163"
      >
    </a>
</p>
<!-- /BADGES -->

<!-- DESCRIPTION/ -->
An ESLint plugin that enforces the use of import aliases. Also supports autofixing.
<!-- /DESCRIPTION -->

Aliases are a great thing to make imports more readable and you do not have to change import paths that often when a file path is changed.

```js
import foo from '../../model/sub/foo'
import bar from '../other/bar'
```

changes to

```js
import foo from '@/model/sub/foo'
import bar from '@/sub/other/bar'
```

Now what if you are in a bigger team or you have a lot of projects to update. Or you just want to make sure that everything is consistent. This is where a linter comes into the play. This rule allows you to detect inconsistent imports and even autofix them. This works by matching alias paths agains the imports and replacing the import paths with the first matching aliased path.

<!-- INSTALL/ -->
## Install

```bash
# npm
$ npm install @dword-design/eslint-plugin-import-alias

# Yarn
$ yarn add @dword-design/eslint-plugin-import-alias
```
<!-- /INSTALL -->

## Usage

Add the plugin to your ESLint config:

```json
{
  "extends": [
    "plugin:@dword-design/import-alias/recommended"
  ],
}
```

Alright, now you have to tell the plugin which aliases to use. In the simplest case, you are already using [babel-plugin-module-resolver](https://www.npmjs.com/package/babel-plugin-module-resolver) for your aliases. Your babel config would look something like this:

```json
{
  "plugins": {
    ["module-resolver", {
      "alias": {
        "@": ".",
      },
    }]
  }
}
```

In this case lucky you, you don't have to do anything else. The plugin should work out of the box.

If you have a special project setup that does not have a babel config in the project path, you can still use the plugin by passing the aliases directly to the rule. In this case you define the rule additionally in the `rules` section:

```json
"rules": {
  "@dword-design/import-alias/prefer-alias": [
    "error",
    {
      "alias": {
        "@": "./src",
        "@components": "./src/components"
      }
    }
  ]
}
```

By default, the plugin will convert parent paths to aliases (like `../model/foo`), but will keep subpath imports relative. You can change that to also convert subpaths to aliased imports by passing the `aliasForSubpaths` option to the rule like so:

```json
"rules": {
  "@dword-design/import-alias/prefer-alias": ["error", { "aliasForSubpaths": true }]
}
```

<!-- LICENSE/ -->
## Contribute

Are you missing something or want to contribute? Feel free to file an [issue](https://github.com/dword-design/eslint-plugin-import-alias/issues) or a [pull request](https://github.com/dword-design/eslint-plugin-import-alias/pulls)! ⚙️

## Support

Hey, I am Sebastian Landwehr, a freelance web developer, and I love developing web apps and open source packages. If you want to support me so that I can keep packages up to date and build more helpful tools, you can donate here:

<p>
  <a href="https://www.buymeacoffee.com/dword">
    <img
      src="https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-2.svg"
      alt="Buy Me a Coffee"
      width="114"
    >
  </a>&nbsp;If you want to send me a one time donation. The coffee is pretty good 😊.<br/>
  <a href="https://paypal.me/SebastianLandwehr">
    <img
      src="https://sebastianlandwehr.com/images/paypal.svg"
      alt="PayPal"
      width="163"
    >
  </a>&nbsp;Also for one time donations if you like PayPal.<br/>
  <a href="https://www.patreon.com/dworddesign">
    <img
      src="https://sebastianlandwehr.com/images/patreon.svg"
      alt="Patreon"
      width="163"
    >
  </a>&nbsp;Here you can support me regularly, which is great so I can steadily work on projects.
</p>

Thanks a lot for your support! ❤️

## License

[MIT License](https://opensource.org/license/mit/) © [Sebastian Landwehr](https://sebastianlandwehr.com)
<!-- /LICENSE -->
