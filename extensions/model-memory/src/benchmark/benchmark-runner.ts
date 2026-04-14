import type { ProofCaseResult } from "../proof/proof-runner.ts";

export type BenchmarkSummary = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  expectedObjects: number;
  actualObjects: number;
  matchedObjects: number;
  falsePositiveRate: number;
  precision: number;
  recall: number;
  omissionRate: number;
};

export function buildBenchmarkSummary(results: ProofCaseResult[]): BenchmarkSummary {
  const totalCases = results.length;
  const passedCases = results.filter((result) => result.pass).length;
  const failedCases = totalCases - passedCases;
  const omissionCases = results.filter((result) => result.action === "ignore").length;
  const omissionPasses = results.filter(
    (result) => result.action === "ignore" && result.pass,
  ).length;
  const expectedObjects = results.reduce((total, result) => total + result.expectedObjectCount, 0);
  const actualObjects = results.reduce((total, result) => total + result.actualObjectCount, 0);
  const matchedObjects = results.reduce((total, result) => total + result.matchedObjectCount, 0);
  const falsePositiveObjects = Math.max(0, actualObjects - matchedObjects);

  return {
    totalCases,
    passedCases,
    failedCases,
    expectedObjects,
    actualObjects,
    matchedObjects,
    falsePositiveRate: actualObjects === 0 ? 0 : falsePositiveObjects / actualObjects,
    precision: actualObjects === 0 ? 1 : matchedObjects / actualObjects,
    recall: expectedObjects === 0 ? 1 : matchedObjects / expectedObjects,
    omissionRate: omissionCases === 0 ? 1 : omissionPasses / omissionCases,
  };
}
