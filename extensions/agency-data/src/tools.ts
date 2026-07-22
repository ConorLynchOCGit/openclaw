import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { jsonResult } from "openclaw/plugin-sdk/provider-web-search";
import {
  marketingDataCatalogParameters,
  marketingExperimentsParameters,
  marketingMetricsParameters,
  queryMarketingDataCatalog,
  queryMarketingExperiments,
  queryMarketingMetrics,
} from "./queries.js";
import { AgencyDataStore } from "./store.js";

export function createAgencyDataTools(stateDir: string): AnyAgentTool[] {
  const store = new AgencyDataStore(stateDir);
  return [
    {
      name: "marketing_data_catalog",
      label: "Marketing Data Catalog",
      description:
        "Read a bounded tenant-scoped catalog of account, content, metric-definition, or experiment metadata.",
      parameters: marketingDataCatalogParameters,
      execute: async (_toolCallId: string, params: unknown) =>
        jsonResult(await queryMarketingDataCatalog(store, params)),
    },
    {
      name: "marketing_metrics",
      label: "Marketing Metrics",
      description:
        "Calculate one exact comparison profile's bounded cohort summary and optional daily trend. Distribution modes are never merged; cross-profile normalization is unsupported.",
      parameters: marketingMetricsParameters,
      execute: async (_toolCallId: string, params: unknown) =>
        jsonResult(await queryMarketingMetrics(store, params)),
    },
    {
      name: "marketing_experiments",
      label: "Marketing Experiments",
      description:
        "Read bounded tenant-scoped experiments and their canonical variant, recommendation, decision, and learning associations.",
      parameters: marketingExperimentsParameters,
      execute: async (_toolCallId: string, params: unknown) =>
        jsonResult(await queryMarketingExperiments(store, params)),
    },
  ];
}
