export interface CodexSystemProfileAssetPaths {
  outputDir: string;
  sourceDir: string;
}

export function getCodexSystemProfileAssetPaths(): CodexSystemProfileAssetPaths;

export function copyCodexSystemProfileAssets(paths: CodexSystemProfileAssetPaths): Promise<void>;
