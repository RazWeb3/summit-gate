// -------------------------------------------------------
// 目的: TypeScriptの型解決で必要になるminimatchの最小定義を提供する
// 作成日: 2025/12/28
// -------------------------------------------------------

declare module "minimatch" {
  export type MinimatchOptions = Record<string, unknown>;

  export function minimatch(target: string, pattern: string, options?: MinimatchOptions): boolean;

  export default minimatch;
}
