ALTER TABLE execution_platform.runtime_work_graph_edges
  DROP CONSTRAINT IF EXISTS runtime_work_graph_edge_kind_check;

ALTER TABLE execution_platform.runtime_work_graph_edges
  ADD CONSTRAINT runtime_work_graph_edge_kind_check CHECK (
    edge_kind IN (
      'depends_on',
      'handoff',
      'context_supplies',
      'synthesis_groups',
      'implementation_depends_on',
      'validation_depends_on',
      'review_depends_on',
      'closeout_depends_on',
      'human_decision_blocks',
      'proof_depends_on',
      'validation_failed',
      'repair_requested',
      'escalation',
      'human_wait',
      'human_resume',
      'continuation',
      'closeout_source'
    )
  );
