import type { JsonValue } from "../runtime-job-repository.ts";
import type {
  ModelTaskContract,
  ModelTaskContractId,
  ModelTaskValidationEvidence,
} from "./types.ts";

function validationIssues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "<root>";
    return `${path}: ${issue.message}`;
  });
}

export class ModelTaskContractRegistry {
  private readonly contracts = new Map<ModelTaskContractId, ModelTaskContract>();

  constructor(contracts: ModelTaskContract[] = []) {
    for (const contract of contracts) {
      this.register(contract);
    }
  }

  register(contract: ModelTaskContract): void {
    if (this.contracts.has(contract.id)) {
      throw new Error(`model task contract already registered: ${contract.id}`);
    }
    this.contracts.set(contract.id, contract);
  }

  get(contractId: ModelTaskContractId): ModelTaskContract | null {
    return this.contracts.get(contractId) ?? null;
  }

  require(contractId: ModelTaskContractId): ModelTaskContract {
    const contract = this.get(contractId);
    if (!contract) {
      throw new Error(`model task contract not registered: ${contractId}`);
    }
    return contract;
  }

  list(): ModelTaskContract[] {
    return Array.from(this.contracts.values()).toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
  }

  validateInput(contractId: ModelTaskContractId, input: JsonValue): ModelTaskValidationEvidence {
    const result = this.require(contractId).inputSchema.safeParse(input);
    return result.success
      ? { ok: true, schema: "input", issues: [] }
      : { ok: false, schema: "input", issues: validationIssues(result.error) };
  }

  validateOutput(contractId: ModelTaskContractId, output: JsonValue): ModelTaskValidationEvidence {
    const result = this.require(contractId).outputSchema.safeParse(output);
    return result.success
      ? { ok: true, schema: "output", issues: [] }
      : { ok: false, schema: "output", issues: validationIssues(result.error) };
  }
}
