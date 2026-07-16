// Xai type declarations define plugin contracts.
export type XaiResponseAnnotation = {
  type?: string;
  url?: string;
  start_index?: number;
  end_index?: number;
  title?: string;
};

export type XaiWebSearchResponse = {
  id?: string;
  created_at?: number;
  completed_at?: number | null;
  model?: string;
  service_tier?: string;
  status?: string;
  termination?: string;
  finish_reason?: string;
  incomplete_details?: {
    reason?: string;
  } | null;
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    cost?: number;
    cost_in_usd_ticks?: number;
    num_server_side_tools_used?: number;
    server_tool_use?: {
      web_search_requests?: number;
    } | null;
    input_tokens_details?: {
      cached_tokens?: number;
    } | null;
    output_tokens_details?: {
      reasoning_tokens?: number;
    } | null;
  } | null;
  error?: {
    code?: string;
    type?: string;
    message?: string;
    param?: string;
  } | null;
  output?: Array<{
    type?: string;
    id?: string;
    call_id?: string;
    status?: string;
    name?: string;
    arguments?: string;
    query?: string;
    queries?: string[];
    action?: unknown;
    error?: {
      code?: string;
      type?: string;
      message?: string;
      param?: string;
    } | null;
    text?: string;
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<XaiResponseAnnotation | null>;
    } | null>;
    annotations?: Array<XaiResponseAnnotation | null>;
  } | null>;
  output_text?: string;
  citations?: string[];
  inline_citations?: Array<XaiResponseAnnotation>;
};
