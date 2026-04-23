# Examples

## Example 1: Exact Page Read

Input shape:

- objective: recover pricing and launch date from a known page
- required_fields: price, launch date, plan names
- desired_output_shape: exact page read

Good output behavior:

- recover only visible fields from current retrieval
- identify any missing plan details explicitly
- avoid filling gaps from memory

## Example 2: Multi-Source Comparison

Input shape:

- objective: compare three vendors on search quality, pricing, and enterprise controls
- required_fields: pricing, APIs, security notes, citations
- desired_output_shape: comparison matrix + synthesis

Good output behavior:

- normalize all vendors to the same fields
- call out contradictory claims across vendor pages and third-party coverage
- synthesize only after the matrix is complete enough to compare

## Example 3: Source Evaluation

Input shape:

- objective: determine whether a cited article is trustworthy enough to use in a board memo
- desired_output_shape: source evaluation note

Good output behavior:

- classify source type
- use lateral reading when needed
- separate authority, recency, and corroboration

## Example 4: Competitive Brief

Input shape:

- objective: brief me on a competitor’s latest positioning and likely strategic move
- desired_output_shape: competitive brief

Good output behavior:

- focus on decision-useful implications
- distinguish observed evidence from inferred strategic interpretation
- surface unknowns that could reverse the read

## Example 5: Watchlist Update

Input shape:

- objective: monitor company X for pricing, leadership, partnership, and product changes
- desired_output_shape: watchlist update

Good output behavior:

- separate signal from noise
- assign urgency tier
- explain why the signal matters now
