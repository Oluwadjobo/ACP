# Project memory

## Product intent & audience

- Project includes a QR Code attendance/presence control module ("module de contrôle de présence QR Code").
- User intends to resume and refine configuration of this module; current focus is inspection before changes.

## Brand personality & voice

- User communicates in French; respond in French unless they switch.
- User is methodical: asks to inspect state before modifying, and to avoid commits until explicitly instructed.

## Visual design & UX direction

- Not yet inferred from design work this turn. Awaiting UI/UX requests related to the QR attendance module.

## Decisions, constraints & rationale

- Stack: Vite + React (JSX), Tailwind CSS, lucide-react icons, `@/` path alias to `src/`.
- No git repository in this environment; Bolt Version History is the versioning mechanism (not git commits).
- User requested full command output before any file changes; no files were modified or committed this turn.

## Open questions & assumptions

- Scope of "QR Code presence control module" not yet examined in files; exact features, screens, and data model unknown.
- No existing UI/components inspected yet; design direction to be inferred once module files are reviewed.
- Assumption: user will specify what to adjust in the module before implementation begins.