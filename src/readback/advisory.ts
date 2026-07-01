// Shared language for bounded readback surfaces that must not become runtime truth.
export type AdvisoryReadback = {
  semantics: string;
  caveats: string[];
  missingEvidenceLanguage: string;
  pointers: string[];
};

export function buildAdvisoryReadback(params: {
  surface: string;
  pointers: string[];
  caveats?: string[];
}): AdvisoryReadback {
  return {
    semantics: `${params.surface} is advisory readback over native evidence; it is not lifecycle truth, a parser gate, or an authority surface.`,
    caveats: [
      "Bounded summaries can omit older or larger evidence.",
      "Inefficient or slow trajectories are attention items, not deterministic failures.",
      ...(params.caveats ?? []),
    ],
    missingEvidenceLanguage:
      "When evidence is absent or unreadable, report unknown with the missing pointer instead of inferring state.",
    pointers: [...new Set(params.pointers)],
  };
}
