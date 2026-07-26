import fs from "node:fs/promises";
import path from "node:path";
import {
  assertExactReadAllowed,
  capString,
  clampPositiveInt,
  DEFAULT_EXCLUDE_GLOBS,
  DEFAULT_OUTPUT_BYTES,
  DEFAULT_READ_BYTES,
  DEFAULT_SEARCH_EXCLUSION_POLICY,
  DEFAULT_SEARCH_MATCHES,
  formatError,
  isInside,
  MAX_BATCH_ITEMS,
  MAX_READ_BYTES,
  MAX_READ_RESPONSE_BYTES,
  MAX_READ_TEXT_BYTES,
  MAX_RESULTS,
  MAX_SEARCH_COMMAND_BYTES,
  MAX_SEARCH_CONTEXT_LINES,
  MAX_SEARCH_MATCHES,
  MAX_SEARCH_RESPONSE_BYTES,
  relative,
  resolveRepoRoot,
  runBoundedCommand,
  runCommand,
  safeResolve,
  sha256,
} from "./openclaw-repo-workbench-core.mjs";

export async function repoSearchMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd());
  const queries = input.queries.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(queries.map((query) => runSearchQuery(root, query)));
  return fitSearchManyResponse(root, queries.length, results);
}

export async function repoReadMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd());
  const files = input.files.slice(0, MAX_BATCH_ITEMS);
  const rawResults = await Promise.all(files.map((request) => readFileRequest(root, request)));
  return fitReadManyResponse(root, files, rawResults);
}

export async function repoGlobMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd());
  const globs = input.globs.slice(0, MAX_BATCH_ITEMS);
  const results = await Promise.all(globs.map((request) => runGlobRequest(root, request)));
  return { schemaVersion: "openclaw.repo_workbench.glob_many.v1", root, results };
}

export async function gitInspectMany(input, options = {}) {
  const root = resolveRepoRoot(options.cwd ?? process.cwd());
  const requests = input.requests.slice(0, MAX_BATCH_ITEMS);
  const roots = resolveGitRoots(root);
  const expandedRequests = requests.flatMap((request) =>
    expandGitRequestRoots(root, roots, request).map((gitRoot) => ({ request, gitRoot })),
  );
  const results = await Promise.all(
    expandedRequests.map(({ request, gitRoot }) => runGitRequest(root, gitRoot, request)),
  );
  return {
    schemaVersion: "openclaw.repo_workbench.git_inspect_many.v1",
    root,
    gitRoots: roots.map((gitRoot) => relative(root, gitRoot)),
    gitRootLabels: roots.map((gitRoot) => ({
      label: "workspace",
      path: relative(root, gitRoot),
    })),
    results,
  };
}

function resolveGitRoots(root) {
  return [root];
}

function expandGitRequestRoots(root, gitRoots, request) {
  if (request.path) {
    const requested = safeResolve(root, request.path, { allowExcluded: true });
    const containingRoot = gitRoots
      .filter((gitRoot) => requested === gitRoot || requested.startsWith(`${gitRoot}${path.sep}`))
      .toSorted((left, right) => right.length - left.length)[0];
    return [containingRoot ?? root];
  }
  return gitRoots;
}

async function runSearchQuery(root, query) {
  const requestedPath = query.path ?? ".";
  const maxMatches = clampPositiveInt(query.maxMatches, DEFAULT_SEARCH_MATCHES, MAX_SEARCH_MATCHES);
  const contextLines = Math.min(query.contextLines ?? 0, MAX_SEARCH_CONTEXT_LINES);
  const common = {
    pattern: query.pattern,
    path: requestedPath,
    searchedRoots: [],
    scope: {
      mode: query.glob === undefined ? "default_authored_config" : "explicit_glob",
      ...(query.glob === undefined ? {} : { glob: query.glob }),
      hiddenIncluded: true,
      ignoreFilesRespected: true,
    },
    appliedExclusions: {
      policy: DEFAULT_SEARCH_EXCLUSION_POLICY,
      count: DEFAULT_EXCLUDE_GLOBS.length,
    },
    limits: {
      maxMatches,
      outputBytes: MAX_SEARCH_COMMAND_BYTES,
    },
    effectiveMaxMatches: maxMatches,
    effectiveContextLines: contextLines,
    ...(query.contextLines && query.contextLines > contextLines
      ? { requestedContextLines: query.contextLines, contextLinesClamped: true }
      : {}),
    ...(query.maxMatches && query.maxMatches > maxMatches
      ? { requestedMaxMatches: query.maxMatches, maxMatchesClamped: true }
      : {}),
  };
  try {
    const searchRoot = safeResolve(root, requestedPath);
    const searchPath = relative(root, searchRoot);
    const args = [
      "--hidden",
      "--no-config",
      "--line-number",
      "--column",
      "--no-heading",
      "--with-filename",
      "--color",
      "never",
    ];
    if (query.literal) {
      args.push("-F");
    }
    if (query.caseSensitive === false) {
      args.push("-i");
    }
    if (contextLines > 0) {
      args.push("-C", String(contextLines));
    }
    if (query.glob !== undefined) {
      args.push("--glob", query.glob);
    }
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push("--", query.pattern, searchRoot);
    const output = await runBoundedCommand("rg", args, root, MAX_SEARCH_COMMAND_BYTES);
    const lines = output.stdout.split(/\r?\n/u).filter(Boolean).slice(0, maxMatches);
    const items = parseRipgrepItems(root, lines);
    const searchComplete = !output.timedOut && (output.exitCode === 0 || output.exitCode === 1);
    const totalItems = Math.max(items.length, output.totalOutputLines);
    const omittedItems = Math.max(0, totalItems - items.length);
    const status = output.exitCode === 0 ? "matched" : output.exitCode === 1 ? "no_match" : "error";
    const continuation = searchContinuation(status, searchComplete, omittedItems);
    return {
      ...common,
      path: searchPath,
      searchedRoots: [searchPath],
      status,
      items,
      totalItems,
      returnedItems: items.length,
      omittedItems,
      omittedItemsExact: searchComplete,
      truncated: omittedItems > 0,
      commandOutputTruncated: output.truncated,
      responseTruncated: false,
      aggregateOmittedItems: 0,
      searchComplete,
      continuation,
      nextAction: continuation.nextAction,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    const continuation = searchContinuation("error", false, 0);
    return {
      ...common,
      status: "error",
      items: [],
      totalItems: 0,
      returnedItems: 0,
      omittedItems: 0,
      omittedItemsExact: false,
      truncated: false,
      commandOutputTruncated: false,
      responseTruncated: false,
      aggregateOmittedItems: 0,
      searchComplete: false,
      continuation,
      nextAction: continuation.nextAction,
      error: formatError(error),
    };
  }
}

function searchContinuation(status, searchComplete, omittedItems) {
  if (status === "error" || !searchComplete) {
    return { complete: false, hasMore: false, nextAction: "fix_query_or_path" };
  }
  if (omittedItems > 0) {
    return { complete: false, hasMore: true, nextAction: "narrow_pattern_or_path" };
  }
  return { complete: true, hasMore: false, nextAction: "none" };
}

function fitSearchManyResponse(root, requestedQueries, rawResults) {
  const results = rawResults.map((result) => ({
    ...result,
    items: Array.isArray(result.items) ? [...result.items] : [],
  }));
  const omittedByResult = new Map();
  let response = buildSearchManyResponse(root, requestedQueries, results, omittedByResult);

  while (serializedBytes(response) > MAX_SEARCH_RESPONSE_BYTES) {
    const candidate = results
      .filter((result) => Array.isArray(result.items) && result.items.length > 0)
      .toSorted((left, right) => right.items.length - left.items.length)[0];
    if (!candidate) {
      break;
    }
    candidate.items.pop();
    omittedByResult.set(candidate, (omittedByResult.get(candidate) ?? 0) + 1);
    response = buildSearchManyResponse(root, requestedQueries, results, omittedByResult);
  }

  return response;
}

function buildSearchManyResponse(root, requestedQueries, results, omittedByResult) {
  const normalizedResults = results.map((result) => {
    const aggregateOmittedItems = omittedByResult.get(result) ?? 0;
    const returnedItems = result.items.length;
    const omittedItems = result.omittedItemsExact
      ? Math.max(0, result.totalItems - returnedItems)
      : result.omittedItems + aggregateOmittedItems;
    const continuation = searchContinuation(result.status, result.searchComplete, omittedItems);
    return {
      ...result,
      returnedItems,
      omittedItems,
      truncated: result.truncated || aggregateOmittedItems > 0,
      responseTruncated: aggregateOmittedItems > 0,
      aggregateOmittedItems,
      continuation,
      nextAction: continuation.nextAction,
    };
  });
  return {
    schemaVersion: "openclaw.repo_workbench.search_many.v2",
    root,
    limits: {
      defaultMatchesPerQuery: DEFAULT_SEARCH_MATCHES,
      maxMatchesPerQuery: MAX_SEARCH_MATCHES,
      maxResponseBytes: MAX_SEARCH_RESPONSE_BYTES,
    },
    exclusionPolicies: {
      [DEFAULT_SEARCH_EXCLUSION_POLICY]: DEFAULT_EXCLUDE_GLOBS,
    },
    results: normalizedResults,
    coverage: {
      requestedQueries,
      matchedQueries: normalizedResults.filter((result) => result.status === "matched").length,
      returnedItems: normalizedResults.reduce(
        (total, result) => total + (Array.isArray(result.items) ? result.items.length : 0),
        0,
      ),
      omittedItems: normalizedResults.reduce(
        (total, result) => total + (result.omittedItems ?? 0),
        0,
      ),
      omittedItemsExact: normalizedResults.every((result) => result.omittedItemsExact),
    },
  };
}

async function readFileRequest(root, request) {
  try {
    const requested = safeResolve(root, request.path, { allowExcluded: true });
    assertExactReadAllowed(root, requested);
    const file = await fs.realpath(requested);
    if (!isInside(root, file)) {
      throw new Error(`path escapes repository root through symlink: ${request.path}`);
    }
    assertExactReadAllowed(root, file);
    const stat = await fs.stat(file);
    if (!stat.isFile()) {
      throw new Error("path is not a file");
    }
    const data = await fs.readFile(file);
    const content = data.toString("utf8");
    const lines = content.split(/\r?\n/u);
    const requestedStartLine = request.startLine ?? 1;
    const requestedEndLine = request.endLine ?? lines.length;
    if (requestedEndLine < requestedStartLine) {
      throw new Error("endLine must be greater than or equal to startLine");
    }
    if (requestedStartLine > lines.length) {
      throw new Error(`startLine ${requestedStartLine} exceeds total lines ${lines.length}`);
    }
    const effectiveEndLine = Math.min(requestedEndLine, lines.length);
    const selectedLines = lines.slice(requestedStartLine - 1, effectiveEndLine);
    const selected = selectedLines.join("\n");
    const maxBytes = clampPositiveInt(request.maxBytes, DEFAULT_READ_BYTES, MAX_READ_BYTES);
    const numbered = takeNumberedLines(selectedLines, requestedStartLine, maxBytes);
    if (numbered.returnedEndLine < requestedStartLine) {
      throw new Error(
        `line ${requestedStartLine} exceeds the ${maxBytes}-byte per-file read budget; use a focused shell read for this exceptional file`,
      );
    }
    const selectedByteLength = Buffer.byteLength(selected, "utf8");
    const selectedSha256 = sha256(selected);
    const truncated = numbered.returnedEndLine < effectiveEndLine;
    const requestedRelativePath = relative(root, requested);
    const resolvedRelativePath = relative(root, file);
    return {
      path: requestedRelativePath,
      ...(resolvedRelativePath === requestedRelativePath
        ? {}
        : { resolvedPath: resolvedRelativePath }),
      status: "ok",
      requestedStartLine,
      requestedEndLine,
      returnedStartLine: requestedStartLine,
      returnedEndLine: numbered.returnedEndLine,
      totalLines: lines.length,
      file: {
        bytes: data.length,
        sha256: sha256(data),
      },
      selectedRange: {
        startLine: requestedStartLine,
        endLine: effectiveEndLine,
        bytes: selectedByteLength,
        sha256: selectedSha256,
      },
      returnedBytes: numbered.returnedBytes,
      effectiveMaxBytes: maxBytes,
      ...(request.maxBytes && request.maxBytes > maxBytes
        ? { requestedMaxBytes: request.maxBytes, maxBytesClamped: true }
        : {}),
      text: numbered.text,
      truncated,
      ...(truncated ? { nextStartLine: numbered.returnedEndLine + 1 } : {}),
    };
  } catch (error) {
    return { path: request.path, status: "error", error: formatError(error) };
  }
}

function takeNumberedLines(lines, startLine, maxBytes) {
  const selected = [];
  let returnedBytes = 0;
  let returnedEndLine = startLine - 1;
  for (const [index, line] of lines.entries()) {
    const numberedLine = `${startLine + index}: ${line}`;
    const separatorBytes = selected.length > 0 ? 1 : 0;
    const lineBytes = Buffer.byteLength(numberedLine, "utf8");
    if (returnedBytes + separatorBytes + lineBytes > maxBytes) {
      break;
    }
    selected.push(numberedLine);
    returnedBytes += separatorBytes + lineBytes;
    returnedEndLine = startLine + index;
  }
  return { text: selected.join("\n"), returnedBytes, returnedEndLine };
}

function fitReadManyResponse(root, requests, rawResults) {
  const results = [];
  const omitted = [];
  const resultRequests = new Map();
  let remainingTextBytes = MAX_READ_TEXT_BYTES;

  for (const [index, rawResult] of rawResults.entries()) {
    const request = requests[index];
    if (rawResult.status !== "ok") {
      results.push(rawResult);
      resultRequests.set(rawResult, request);
      continue;
    }
    if (remainingTextBytes <= 0) {
      omitted.push(omittedRead(request, rawResult, "aggregate_text_budget"));
      continue;
    }
    const fitted = fitReadResultText(rawResult, remainingTextBytes);
    if (!fitted) {
      omitted.push(omittedRead(request, rawResult, "aggregate_text_budget"));
      continue;
    }
    results.push(fitted);
    resultRequests.set(fitted, request);
    remainingTextBytes -= fitted.returnedBytes;
  }

  let response = buildReadManyResponse(root, requests.length, results, omitted);
  while (serializedBytes(response) > MAX_READ_RESPONSE_BYTES && results.length > 0) {
    const removed = results.pop();
    omitted.unshift(
      omittedRead(
        resultRequests.get(removed) ?? { path: removed.path },
        removed,
        "aggregate_response_budget",
      ),
    );
    response = buildReadManyResponse(root, requests.length, results, omitted);
  }
  return response;
}

function fitReadResultText(result, maxBytes) {
  if (result.returnedBytes <= maxBytes) {
    return result;
  }
  const lines = result.text.split("\n");
  const selected = [];
  let returnedBytes = 0;
  for (const line of lines) {
    const separatorBytes = selected.length > 0 ? 1 : 0;
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (returnedBytes + separatorBytes + lineBytes > maxBytes) {
      break;
    }
    selected.push(line);
    returnedBytes += separatorBytes + lineBytes;
  }
  if (selected.length === 0) {
    return undefined;
  }
  const returnedEndLine = result.returnedStartLine + selected.length - 1;
  return {
    ...result,
    returnedEndLine,
    returnedBytes,
    text: selected.join("\n"),
    truncated: true,
    nextStartLine: returnedEndLine + 1,
  };
}

function omittedRead(request, result, reason) {
  return {
    path: result.path ?? request.path,
    requestedStartLine: request.startLine ?? 1,
    requestedEndLine: request.endLine ?? result.totalLines,
    totalLines: result.totalLines,
    file: result.file,
    selectedRange: result.selectedRange,
    nextStartLine: result.nextStartLine ?? result.returnedStartLine ?? request.startLine ?? 1,
    reason,
  };
}

function buildReadManyResponse(root, requested, results, omitted) {
  return {
    schemaVersion: "openclaw.repo_workbench.read_many.v2",
    root,
    limits: {
      defaultFileBytes: DEFAULT_READ_BYTES,
      maxFileBytes: MAX_READ_BYTES,
      maxTextBytes: MAX_READ_TEXT_BYTES,
      maxResponseBytes: MAX_READ_RESPONSE_BYTES,
    },
    results,
    omitted,
    coverage: {
      requested,
      returned: results.filter((item) => item.status === "ok").length,
      truncated: results.filter((item) => item.status === "ok" && item.truncated).length,
      errors: results.filter((item) => item.status === "error").length,
      omitted: omitted.length,
    },
  };
}

function serializedBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function runGlobRequest(root, request) {
  try {
    const searchRoot = safeResolve(root, request.path ?? ".");
    const maxResults = clampPositiveInt(request.maxResults, 100, MAX_RESULTS);
    const args = ["--files", "--glob", request.pattern];
    for (const excludeGlob of DEFAULT_EXCLUDE_GLOBS) {
      args.push("--glob", `!${excludeGlob}`);
    }
    args.push(searchRoot);
    const output = await runCommand("rg", args, root, DEFAULT_OUTPUT_BYTES);
    const files = output.stdout
      .split(/\r?\n/u)
      .filter(Boolean)
      .map((file) => relative(root, path.resolve(file)))
      .slice(0, maxResults);
    return {
      request,
      pattern: request.pattern,
      path: relative(root, searchRoot),
      limits: {
        maxResults,
        outputBytes: DEFAULT_OUTPUT_BYTES,
      },
      effectiveMaxResults: maxResults,
      ...(request.maxResults && request.maxResults > maxResults
        ? { requestedMaxResults: request.maxResults, maxResultsClamped: true }
        : {}),
      status: output.exitCode === 0 ? "ok" : output.exitCode === 1 ? "no_match" : "error",
      files,
      fileCount: files.length,
      truncated: output.truncated || files.length >= maxResults,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return { pattern: request.pattern, status: "error", error: formatError(error) };
  }
}

async function runGitRequest(root, gitRoot, request) {
  try {
    const maxBytes = clampPositiveInt(request.maxBytes, 48_000, DEFAULT_OUTPUT_BYTES);
    const requestedPath = request.path
      ? safeResolve(root, request.path, { allowExcluded: true })
      : undefined;
    const gitRelativePath = requestedPath
      ? path.relative(gitRoot, requestedPath) || "."
      : undefined;
    const pathArgs = gitRelativePath ? ["--", gitRelativePath] : [];
    let args;
    switch (request.kind) {
      case "status":
        args = ["status", "--short", ...pathArgs];
        break;
      case "diff_stat":
        args = ["diff", "--stat", ...pathArgs];
        break;
      case "changed_files":
        args = ["diff", "--name-only", ...pathArgs];
        break;
      case "diff_hunks":
        args = ["diff", "--unified=3", ...pathArgs];
        break;
      default:
        throw new Error(`unsupported git inspect kind ${request.kind}`);
    }
    const output = await runCommand(
      "git",
      ["-c", `safe.directory=${gitRoot}`, ...args],
      gitRoot,
      maxBytes,
    );
    const cappedStdout = capString(output.stdout, maxBytes);
    return {
      request,
      kind: request.kind,
      repoRoot: relative(root, gitRoot),
      repoRootLabel: gitRoot === root ? "workspace" : "nested_source",
      path: request.path ?? ".",
      status: output.exitCode === 0 ? "ok" : "error",
      limits: {
        maxBytes,
      },
      effectiveMaxBytes: maxBytes,
      ...(request.maxBytes && request.maxBytes > maxBytes
        ? { requestedMaxBytes: request.maxBytes, maxBytesClamped: true }
        : {}),
      stdout: cappedStdout.value,
      truncated: output.truncated || cappedStdout.truncated,
      ...(output.stderr ? { stderr: output.stderr } : {}),
    };
  } catch (error) {
    return {
      kind: request.kind,
      path: request.path ?? ".",
      status: "error",
      error: formatError(error),
    };
  }
}

function parseRipgrepItems(root, lines) {
  return lines.map((line) => {
    const match = /^(.*?):(\d+):(\d+):(.*)$/u.exec(line);
    if (match) {
      const [, filePath, lineNumber, character, text] = match;
      const resolved = path.resolve(filePath);
      const displayPath = isInside(root, resolved) ? relative(root, resolved) : filePath;
      return {
        path: displayPath,
        line: Number.parseInt(lineNumber, 10),
        character: Number.parseInt(character, 10),
        text,
      };
    }
    const context = /^(.*?)-(\d+)-(.*)$/u.exec(line);
    if (!context) {
      return { text: line };
    }
    const [, filePath, lineNumber, text] = context;
    const resolved = path.resolve(filePath);
    const displayPath = isInside(root, resolved) ? relative(root, resolved) : filePath;
    return {
      path: displayPath,
      line: Number.parseInt(lineNumber, 10),
      text,
      context: true,
    };
  });
}
