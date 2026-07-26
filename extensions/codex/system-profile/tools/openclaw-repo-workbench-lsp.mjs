import { existsSync, readFileSync, realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  clampPositiveInt,
  formatError,
  isInside,
  isPathExcluded,
  MAX_RESULTS,
  relative,
  resolveRepoRoot,
  safeResolve,
} from "./openclaw-repo-workbench-core.mjs";

const DEFAULT_LSP_MAX_LOADED_FILES = 24;

export async function lspHoverTypescript(input, options = {}) {
  return await withTypeScriptLanguageService(
    input,
    options,
    async ({ ts, service, file, position }) => {
      const quickInfo = service.getQuickInfoAtPosition(file, position);
      if (!quickInfo) {
        return { status: "no_hover" };
      }
      return {
        status: "ok",
        display: ts.displayPartsToString(quickInfo.displayParts ?? []),
        documentation: ts.displayPartsToString(quickInfo.documentation ?? []),
        tags: (quickInfo.tags ?? []).map((tag) => ({
          name: tag.name,
          text: ts.displayPartsToString(tag.text ?? []),
        })),
      };
    },
  );
}

export async function lspDefinitionTypescript(input, options = {}) {
  return await withTypeScriptLanguageService(
    input,
    options,
    async ({ service, file, position, root }) => {
      const definitions = service.getDefinitionAtPosition(file, position) ?? [];
      const maxResults = clampPositiveInt(input.maxResults, 40, MAX_RESULTS);
      return {
        status: definitions.length > 0 ? "ok" : "no_definition",
        effectiveMaxResults: maxResults,
        ...(input.maxResults && input.maxResults > maxResults
          ? { requestedMaxResults: input.maxResults, maxResultsClamped: true }
          : {}),
        definitions: definitions
          .slice(0, maxResults)
          .map((definition) => formatLspSpan(root, definition.fileName, definition.textSpan)),
        truncated: definitions.length > maxResults,
      };
    },
  );
}

export async function lspReferencesTypescript(input, options = {}) {
  return await withTypeScriptLanguageService(
    input,
    options,
    async ({ service, file, position, root }) => {
      const referenceGroups = service.findReferences(file, position) ?? [];
      const references = referenceGroups.flatMap((group) => group.references);
      const maxResults = clampPositiveInt(input.maxResults, 80, MAX_RESULTS);
      return {
        status: references.length > 0 ? "ok" : "no_references",
        effectiveMaxResults: maxResults,
        ...(input.maxResults && input.maxResults > maxResults
          ? { requestedMaxResults: input.maxResults, maxResultsClamped: true }
          : {}),
        references: references.slice(0, maxResults).map((reference) =>
          Object.assign(formatLspSpan(root, reference.fileName, reference.textSpan), {
            isDefinition: reference.isDefinition === true,
          }),
        ),
        truncated: references.length > maxResults,
      };
    },
  );
}

async function withTypeScriptLanguageService(input, options, run) {
  const root = realpathSync(resolveRepoRoot(options.cwd ?? process.cwd()));
  try {
    const requestedFile = safeResolve(root, input.file);
    const file = resolveExistingPathInside(root, requestedFile);
    if (!file) {
      throw new Error(`TypeScript file is outside the active workspace: ${input.file}`);
    }
    const sourceText = await fs.readFile(file, "utf8");
    const position = lineAndCharacterToPosition(sourceText, input.line, input.character);
    const ts = await import("typescript");
    const project = resolveTypeScriptProject(ts, root, file);
    const service = createTypeScriptLanguageService(ts, project);
    const resultPayload = await run({ ts, service, root, file, sourceText, position, project });
    return {
      schemaVersion: "openclaw.repo_workbench.typescript_lsp.v1",
      root,
      file: relative(root, file),
      line: input.line,
      character: input.character,
      projectRoot: relative(root, project.projectRoot),
      tsconfig: project.tsconfigPath ? relative(root, project.tsconfigPath) : undefined,
      projectMode: project.mode,
      projectFileCount: project.loadedFileCount?.() ?? project.fileNames.length,
      lspPartial: project.partial || project.fileLimitReached?.() === true,
      projectFileLimitReached: project.fileLimitReached?.() === true,
      ...resultPayload,
    };
  } catch (error) {
    return {
      schemaVersion: "openclaw.repo_workbench.typescript_lsp.v1",
      file: input.file,
      line: input.line,
      character: input.character,
      status: "error",
      error: formatError(error),
    };
  }
}

function resolveTypeScriptProject(ts, root, file) {
  const configPath = findNearestTsConfig(root, path.dirname(file));
  if (!configPath) {
    return singleFileTypeScriptProject(ts, file, {
      projectRoot: path.dirname(file),
      tsconfigPath: undefined,
      mode: "single_file",
      partial: false,
    });
  }
  const projectRoot = path.dirname(configPath);
  const parsed = parseTypeScriptConfigForFile(ts, root, configPath, file);
  return {
    workspaceRoot: root,
    projectRoot,
    tsconfigPath: configPath,
    fileNames: [file],
    maxLoadedFiles: DEFAULT_LSP_MAX_LOADED_FILES,
    mode: "tsconfig_dependency_closure",
    partial: true,
    options: {
      ...parsed.options,
      noLib: true,
      noResolve: false,
      skipLibCheck: true,
      types: [],
    },
  };
}

function parseTypeScriptConfigForFile(ts, root, configPath, file) {
  let fatalDiagnostic;
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    {
      ...ts.sys,
      fileExists: (fileName) => resolveExistingPathInside(root, fileName) !== undefined,
      readFile: (fileName) => {
        const resolved = resolveExistingPathInside(root, fileName);
        return resolved ? ts.sys.readFile(resolved) : undefined;
      },
      readDirectory: () => [file],
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        fatalDiagnostic = diagnostic;
      },
    },
  );
  if (!parsed) {
    const detail = fatalDiagnostic
      ? formatTypeScriptDiagnostic(ts, fatalDiagnostic)
      : `unable to parse ${configPath}`;
    throw new Error(detail);
  }
  if (parsed.errors.length > 0) {
    throw new Error(formatTypeScriptDiagnostic(ts, parsed.errors[0]));
  }
  return parsed;
}

function singleFileTypeScriptProject(ts, file, metadata) {
  return {
    workspaceRoot: metadata.projectRoot,
    projectRoot: metadata.projectRoot,
    tsconfigPath: metadata.tsconfigPath,
    fileNames: [file],
    totalFileCount: 1,
    mode: metadata.mode,
    partial: metadata.partial,
    options: defaultTypeScriptOptions(ts),
  };
}

function defaultTypeScriptOptions(ts) {
  return {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeNext,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
  };
}

function findNearestTsConfig(root, startDir) {
  let current = path.resolve(startDir);
  while (current === root || isInside(root, current)) {
    const candidate = path.join(current, "tsconfig.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}

function createTypeScriptLanguageService(ts, project) {
  const maxLoadedFiles = project.maxLoadedFiles ?? project.fileNames.length;
  const loadedFiles = new Set(project.fileNames.map((fileName) => path.resolve(fileName)));
  let fileLimitReached = false;
  const projectFiles = new Set(project.fileNames.map((fileName) => path.resolve(fileName)));
  project.loadedFileCount = () => loadedFiles.size;
  project.fileLimitReached = () => fileLimitReached;

  const resolveReadableFile = (fileName) => {
    const resolved = path.resolve(fileName);
    const canonical = resolveExistingPathInside(project.workspaceRoot, resolved);
    if (!canonical) {
      return undefined;
    }
    if (!isTypeScriptSourceFile(canonical) || loadedFiles.has(canonical)) {
      return canonical;
    }
    if (loadedFiles.size >= maxLoadedFiles) {
      fileLimitReached = true;
      return undefined;
    }
    loadedFiles.add(canonical);
    return canonical;
  };

  const isolated = project.mode === "single_file" || project.mode === "single_file_bounded";
  const host = {
    getCompilationSettings: () => project.options,
    getCurrentDirectory: () => project.projectRoot,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => project.fileNames,
    getScriptVersion: () => "0",
    getScriptSnapshot: (fileName) => {
      const resolved = path.resolve(fileName);
      if (isolated && !projectFiles.has(resolved)) {
        return undefined;
      }
      const readable = resolveReadableFile(resolved);
      if (!readable) {
        return undefined;
      }
      return ts.ScriptSnapshot.fromString(readFileSync(readable, "utf8"));
    },
    fileExists: (fileName) => {
      const resolved = path.resolve(fileName);
      return isolated ? projectFiles.has(resolved) : resolveReadableFile(resolved) !== undefined;
    },
    readFile: (fileName) => {
      const resolved = path.resolve(fileName);
      if (isolated && !projectFiles.has(resolved)) {
        return undefined;
      }
      const readable = resolveReadableFile(resolved);
      if (!readable) {
        return undefined;
      }
      return ts.sys.readFile(readable);
    },
    readDirectory: () => [],
    directoryExists: isolated
      ? () => false
      : (directoryName) =>
          isInside(project.workspaceRoot, path.resolve(directoryName)) &&
          ts.sys.directoryExists(directoryName),
    getDirectories: () => [],
  };
  return ts.createLanguageService(host, ts.createDocumentRegistry());
}

function isTypeScriptSourceFile(fileName) {
  return /(?:\.d)?\.(?:c|m)?(?:j|t)sx?$/iu.test(fileName);
}

function resolveExistingPathInside(root, candidate) {
  try {
    const canonical = realpathSync(path.resolve(candidate));
    return isInside(root, canonical) ? canonical : undefined;
  } catch {
    return undefined;
  }
}

function lineAndCharacterToPosition(sourceText, line, character) {
  const lines = sourceText.split(/\r?\n/u);
  if (line > lines.length) {
    throw new Error(`line ${line} is outside file with ${lines.length} lines`);
  }
  const targetLine = lines[line - 1] ?? "";
  if (character > targetLine.length + 1) {
    throw new Error(
      `character ${character} is outside line ${line} with ${targetLine.length + 1} columns`,
    );
  }
  let position = 0;
  for (let index = 0; index < line - 1; index += 1) {
    position += lines[index].length + 1;
  }
  return position + character - 1;
}

function formatLspSpan(root, fileName, textSpan) {
  const resolved = path.resolve(fileName);
  const location = isInside(root, resolved)
    ? {
        path: relative(root, resolved),
        excluded: isPathExcluded(root, resolved),
      }
    : {
        path: resolved,
        outsideRoot: true,
      };
  let line = 1;
  let character = 1;
  try {
    const sourceText = readFileSync(resolved, "utf8");
    const lineAndCharacter = positionToLineAndCharacter(sourceText, textSpan.start);
    line = lineAndCharacter.line;
    character = lineAndCharacter.character;
  } catch {
    // Keep the file path even when a generated or external file cannot be read.
  }
  return {
    ...location,
    line,
    character,
    length: textSpan.length,
  };
}

function positionToLineAndCharacter(sourceText, position) {
  const prefix = sourceText.slice(0, position);
  const lines = prefix.split(/\r?\n/u);
  return {
    line: lines.length,
    character: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

function formatTypeScriptDiagnostic(ts, diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  return diagnostic.file
    ? `${diagnostic.file.fileName}:${diagnostic.start ?? 0}: ${message}`
    : message;
}
