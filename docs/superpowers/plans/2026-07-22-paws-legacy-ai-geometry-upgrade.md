# Paws Legacy AI Geometry Upgrade Implementation Plan

**Goal:** Upgrade historical browser-saved AI levels to zero same-layer overlap without changing counts, pairing, layers, or playability.

## Task 1: Pure migration contract (TDD)

- Add failing tests for deterministic overlap repair, edge touching, attribute preservation, Unity pairing parity, and complete solver validation.
- Implement the smallest pure migration module and make the focused tests green.

## Task 2: Open-time persistence (TDD)

- Add a failing controller contract/test proving only local AI documents are upgraded and persisted with optimistic versioning.
- Integrate the migration before renderer/history initialization, surface a concise success/failure toast, and keep non-AI levels unchanged.

## Task 3: Regression and release

- Run the focused unit tests, every Paws test, module syntax checks, and `git diff --check`.
- Run local browser generation, legacy migration, 3D, and solver-driven play acceptance.
- Commit, push fast-forward to `origin/main`, wait for GitHub Pages, then repeat HTTP and browser acceptance online.
