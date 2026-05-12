import { describe, expect, it } from "vitest";
import { createCodexParityReadinessAudit } from "./codex-parity-readiness-audit.ts";

describe("Codex parity readiness audit", () => {
  it("marks parity ready only when every production dimension passes", () => {
    const audit = createCodexParityReadinessAudit({
      oneShotExecProductionDisabled: true,
      persistentCodexAppServerLoopAvailable: true,
      directMainRepoEditPathAvailable: true,
      validationRepairLoopAvailable: true,
      dynamicOpenClawRoleGraphAvailable: true,
      workQueueReadbackShowsRoleGraph: true,
      closeoutAfterEvidenceAccepted: true,
      longFormUxProofPassed: true,
    });

    expect(audit.status).toBe("codex_parity_ready");
    expect(audit.oneShotExecProductionAllowed).toBe(false);
    expect(audit.reasonCodes).toEqual([]);
  });

  it("does not allow one-shot exec or missing UX proof to look like parity", () => {
    const audit = createCodexParityReadinessAudit({
      oneShotExecProductionDisabled: false,
      persistentCodexAppServerLoopAvailable: true,
      directMainRepoEditPathAvailable: true,
      validationRepairLoopAvailable: true,
      dynamicOpenClawRoleGraphAvailable: true,
      workQueueReadbackShowsRoleGraph: true,
      closeoutAfterEvidenceAccepted: true,
      longFormUxProofPassed: false,
    });

    expect(audit.status).toBe("not_codex_parity");
    expect(audit.reasonCodes).toEqual([
      "one_shot_exec_production_path_still_available",
      "long_form_ux_proof_missing",
    ]);
  });
});
