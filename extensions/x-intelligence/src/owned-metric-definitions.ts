export const X_OWNED_METRIC_DEFINITIONS_VERSION = "x-owned-analytics-fields.v1";

export type XOwnedMetricDefinition = Readonly<{
  providerField: string;
  providerMetricClass: "analytics";
  metricDefinitionId: string;
  metricFamily: "x_owned_analytics";
  metricName: string;
  numeratorLabel: string;
  denominatorLabel: "provider observation";
  unit: "count";
  denominator: 1;
  distribution: "provider_total";
}>;

const PROVIDER_FIELDS = [
  "app_install_attempts",
  "app_opens",
  "bookmarks",
  "detail_expands",
  "email_tweet",
  "engagements",
  "follows",
  "hashtag_clicks",
  "impressions",
  "likes",
  "media_views",
  "permalink_clicks",
  "quote_tweets",
  "replies",
  "retweets",
  "shares",
  "unfollows",
  "unlikes",
  "url_clicks",
  "user_profile_clicks",
] as const;

function labelFor(field: string): string {
  return field.split("_").join(" ");
}

export const X_OWNED_METRIC_DEFINITIONS: ReadonlyMap<string, XOwnedMetricDefinition> = new Map(
  PROVIDER_FIELDS.map((providerField) => [
    providerField,
    {
      providerField,
      providerMetricClass: "analytics",
      metricDefinitionId: `x.owned.analytics.${providerField}`,
      metricFamily: "x_owned_analytics",
      metricName: providerField,
      numeratorLabel: labelFor(providerField),
      denominatorLabel: "provider observation",
      unit: "count",
      denominator: 1,
      // This endpoint exposes no organic/promoted split. Preserve that fact
      // instead of mislabeling its returned bucket as combined.
      distribution: "provider_total",
    },
  ]),
);

export function requireXOwnedMetricDefinition(providerField: string): XOwnedMetricDefinition {
  const definition = X_OWNED_METRIC_DEFINITIONS.get(providerField);
  if (!definition) {
    throw new Error(`unsupported owned X analytics field: ${providerField}`);
  }
  return definition;
}

export function supportedXOwnedMetricFields(): string[] {
  return [...X_OWNED_METRIC_DEFINITIONS.keys()];
}
