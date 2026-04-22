export type LegacyFallbackSurfaceStatus =
  | "retired"
  | "quarantined"
  | "admin_only"
  | "explicit_fallback_only"
  | "still_required";

export type LegacyFallbackSurface = {
  surface: string;
  status: LegacyFallbackSurfaceStatus;
  defaultLivePathAllowed: boolean;
  rollbackFlag?: string;
  auditRequired: boolean;
  reason: string;
};

export const LEGACY_FALLBACK_SURFACES: readonly LegacyFallbackSurface[] = [
  {
    surface: "legacy captured-object write fallback",
    status: "explicit_fallback_only",
    defaultLivePathAllowed: false,
    rollbackFlag: "MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENABLED",
    auditRequired: true,
    reason: "retained only as a rollback path while MMV2-native capture remains default",
  },
  {
    surface: "semantic-collision-adjudication.ts",
    status: "admin_only",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason: "legacy diagnostic only; forbidden from MMV2 write/reconciliation hot paths",
  },
  {
    surface: "semantic-identity.ts",
    status: "quarantined",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason: "legacy semantic-family identity remains outside MMV2 structural identity paths",
  },
  {
    surface: "default-memory-store / captured-object-write-compatibility",
    status: "explicit_fallback_only",
    defaultLivePathAllowed: false,
    rollbackFlag: "MODEL_MEMORY_LEGACY_CAPTURED_OBJECT_WRITE_FALLBACK_ENABLED",
    auditRequired: true,
    reason: "fallback use requires an explicit flag and must not disguise itself as normal capture",
  },
  {
    surface: "runtime-api.ts / index.ts broad legacy exports",
    status: "still_required",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason:
      "public compatibility facade still serves plugin SDK and older admin/proof scripts; default MMV2 hot-path import tests enforce quarantine",
  },
  {
    surface: "memory-object-store.ts / mmv2-memory-object-store.ts",
    status: "quarantined",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason:
      "legacy shape bridge retained only until remaining admin/proof consumers move to MMV2-native types",
  },
  {
    surface: "live-shadow-adapters.ts",
    status: "admin_only",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason: "shadow comparison utility, not default capture",
  },
  {
    surface: "runtime-comparison.ts",
    status: "admin_only",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason: "diagnostic comparison utility, not runtime truth",
  },
  {
    surface: "proof/object-comparison.ts",
    status: "admin_only",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason: "proof harness helper only",
  },
  {
    surface: "write-policy.ts legacy semantic identity dependency",
    status: "quarantined",
    defaultLivePathAllowed: false,
    auditRequired: true,
    reason: "legacy write policy cannot participate in default MMV2 capture or reconciliation",
  },
];

export function listLegacyFallbackSurfaces(): readonly LegacyFallbackSurface[] {
  return LEGACY_FALLBACK_SURFACES;
}
