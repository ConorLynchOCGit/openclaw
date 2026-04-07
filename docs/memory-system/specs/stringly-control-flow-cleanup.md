# Stringly Control Flow Cleanup

## Purpose

Replace remaining stringly runtime decisions with closed policy enums,
registered adapters, or typed control-plane outputs where reasonable.

## Why this exists

The current substrate still contains several string-based gates and
mode-selection paths that are more fragile than they should be for a shared
architecture.

## Current problem categories

- profile-string gates
- family/mode switches that should become adapter registration
- query-intent strings without a stronger shared type
- proof or correction modes represented more loosely than necessary

## Replacement strategy

### Use closed enums or unions when

- the value changes runtime behavior
- the set of modes is known
- the value appears in more than one subsystem

### Use adapter registration when

- families need pluggable behavior behind a shared substrate
- runtime should not keep growing switches

## Blocking versus non-blocking

Blocking cleanup:

- string gates that materially affect correction or control-plane decisions
- strings that prevent the registry from becoming authoritative

Non-blocking cleanup:

- local refactors that improve readability without changing control-plane risk

## Rollout posture

- replace the highest-risk string gates first
- keep proof output and external behavior stable
- prefer typed intermediate contracts before deleting old string pathways
