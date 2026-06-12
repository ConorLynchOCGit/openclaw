# execution-coding bootstrap

Read the node prompt as the work order. It defines scope, requirements,
constraints, validation expectations, and the terminal finish contract.

The system prompt owns the active execution contract: form a patch hypothesis,
use exact source navigation only as needed, edit with `edit`, validate, repair,
and finish through `node_finish`.

Use `update_plan` for durable progress when the node is multi-step. Todo tracks
deliverables; it is not a phase gate and does not grant permission to edit.

Use child agents only for work that is genuinely open-ended or validation-heavy.
Use direct source tools for exact local navigation.
