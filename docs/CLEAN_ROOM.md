# Independence and provenance policy

## Goal

Zetora implements comparable *capabilities* while preserving an independent first-party codebase, visual identity, product language, and data model.

## Rules used for this repository

1. No source file from Pi, Open Design, or OpenCode was copied into Zetora.
2. No logo, icon asset, screenshot, font file, marketing text, test fixture, prompt, or generated catalog was copied.
3. Package names, API paths, event names, persistence records, CSS tokens, and component names were created for Zetora.
4. The UI follows common IDE/workspace conventions—navigation rail, session list, work area, inspector and composer—but uses original dimensions, colors, typography, copy, states and interactions.
5. Reference projects are kept under `/home/user/research/` and are not dependencies, submodules, vendored code, or build inputs.
6. New features should record their author, date, specification source, and tests in the project history.
7. Avoid product names and marks owned by the reference projects in user-facing branding.

## Important distinction

This is an **independent reimplementation policy**, not a legally certified two-team clean-room process. The implementer analyzed public source before writing Zetora, so a lawyer should review provenance before a high-value commercial launch.

## Why “pixel-perfect OpenCode” conflicts with “100% mine”

A pixel-for-pixel copy can reproduce protectable visual expression or trade dress even when the underlying code is rewritten. Zetora therefore preserves the useful workflow—not the exact visual expression. It has its own mark, palette, spacing, wording, empty states and artifact experience.

## Third-party software

First-party ownership never transfers ownership of Node.js, Electron, model SDKs, operating-system APIs, or future npm packages. Before release:

- lock exact dependency versions;
- run license and vulnerability scans;
- generate `THIRD_PARTY_NOTICES`;
- retain notices required by MIT, Apache-2.0 and other licenses;
- reject GPL/AGPL dependencies unless deliberately approved;
- review model-provider terms and generated-output rights.

## Branding checklist

- Replace `[OWNER LEGAL NAME]`.
- Commission a formal trademark search for “Zetora” and its Arabic rendering.
- Register domains and social handles only after legal clearance.
- Create final original icons and signing identities.
- Add privacy policy, terms, EULA and processor disclosures.
