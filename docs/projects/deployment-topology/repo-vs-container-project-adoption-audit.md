# Repo Vs Container Project Adoption Audit

This audit records the exact gap between canonical repo project workspaces under `docs/projects/` and the project workspaces present inside the running `openclaw-runtime` container under `/app/docs/projects/`.

## Baseline

- Repo project roots enumerated from `docs/projects/*`
- Container project roots enumerated from `/app/docs/projects/*` inside `openclaw-runtime`
- Initial live image before fix: `openclaw:local` created `2026-04-16T22:33:55.223341891Z`
- Corrected live image after fix: `openclaw:local` created `2026-04-17T00:24:31.681643641Z`

## Root Cause Summary

The missing project surfaces were not absent from the canonical repo. They were absent from the live image and therefore absent from the running container. The live stack had been running an older `openclaw:local` image that predated the rescue migration of `docs/projects/maintenance/` and `docs/projects/intake-routing/`.

The durable rollout-path fix in this slice was:

- add `build:` stanzas to both runtime services in `docker-compose.yml`
- rebuild `openclaw:local`
- recreate `openclaw-runtime`

That keeps `docker compose up -d --build` aligned with the actual live image path instead of relying on an implicitly stale prebuilt image tag.

## Adoption Matrix

| Project Id            | Repo Path                           | Container Path                           | Initial Adoption State | Current Adoption State | Root Cause Classification               | Required Fix Path                                         |
| --------------------- | ----------------------------------- | ---------------------------------------- | ---------------------- | ---------------------- | --------------------------------------- | --------------------------------------------------------- |
| `agent-foundation`    | `docs/projects/agent-foundation`    | `/app/docs/projects/agent-foundation`    | present                | present                | none                                    | none                                                      |
| `deployment-topology` | `docs/projects/deployment-topology` | `/app/docs/projects/deployment-topology` | present                | present                | none                                    | none                                                      |
| `intake-routing`      | `docs/projects/intake-routing`      | `/app/docs/projects/intake-routing`      | missing                | present                | stale image / deployment build omission | rebuild image and recreate runtime via compose build path |
| `maintenance`         | `docs/projects/maintenance`         | `/app/docs/projects/maintenance`         | missing                | present                | stale image / deployment build omission | rebuild image and recreate runtime via compose build path |
| `model-memory`        | `docs/projects/model-memory`        | `/app/docs/projects/model-memory`        | present                | present                | none                                    | none                                                      |
| `qa-program`          | `docs/projects/qa-program`          | `/app/docs/projects/qa-program`          | present                | present                | none                                    | none                                                      |
| `turborepo`           | `docs/projects/turborepo`           | `/app/docs/projects/turborepo`           | present                | present                | none                                    | none                                                      |
| `workspace-topology`  | `docs/projects/workspace-topology`  | `/app/docs/projects/workspace-topology`  | present                | present                | none                                    | none                                                      |

## Evidence Commands

Initial repo roots:

```bash
find docs/projects -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort
```

Initial container roots:

```bash
docker exec openclaw-runtime bash -lc "find /app/docs/projects -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort"
```

Initial image roots:

```bash
docker run --rm --entrypoint bash openclaw:local -lc "find /app/docs/projects -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort"
```

Corrected container roots:

```bash
docker exec openclaw-runtime bash -lc "find /app/docs/projects -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort"
```

## Current Conclusion

All canonical project workspaces that currently exist under `docs/projects/` are now present in the running `openclaw-runtime` container. The adoption gap in this slice was a rollout-path problem, not a repo-topology problem.
