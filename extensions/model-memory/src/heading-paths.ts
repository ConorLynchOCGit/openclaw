export type HeadingPathOption = {
  ref: string;
  headingPath: string[];
};

export function buildHeadingPathOptions(headingPaths: string[][]): HeadingPathOption[] {
  const seen = new Set<string>();
  const options: HeadingPathOption[] = [];

  for (const headingPath of headingPaths) {
    if (headingPath.length === 0) {
      continue;
    }
    const serialized = JSON.stringify(headingPath);
    if (seen.has(serialized)) {
      continue;
    }
    seen.add(serialized);
    options.push({
      ref: `hp_${options.length + 1}`,
      headingPath,
    });
  }

  return options;
}

export function buildHeadingPathRefLookup(options: HeadingPathOption[]): Record<string, string[]> {
  return Object.fromEntries(options.map((option) => [option.ref, option.headingPath]));
}
