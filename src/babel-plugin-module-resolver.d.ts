declare module 'babel-plugin-module-resolver' {
  export function resolvePath(
    sourcePath: string,
    currentFile: string,
    options: { alias?: Record<string, string>; cwd?: string },
  ): string;
}
declare module '@babel/core' {
  export type BabelPlugin = { key: string; options?: Record<string, unknown> };

  export interface BabelConfig {
    plugins?: BabelPlugin[];
  }

  export function loadOptions(
    options?: Record<string, unknown>,
  ): BabelConfig | null;
}
