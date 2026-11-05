# AI Coding Agent Rules

This document outlines the strict, non-negotiable rules that every AI coding agent must follow when operating within the FitOnus repository. Failure to adhere to these rules compromises the structural integrity, security, and maintainability of the enterprise architecture.

## 1. Context and Comprehension
- **Read before coding**: You MUST read every relevant documentation file in the `docs/` folder before attempting to write or modify any code. Ignorance of the established design patterns is unacceptable.
- **Understand the feature**: Before touching a feature, read its corresponding `docs/XX-[feature-name].txt` file to ensure absolute alignment with the business and technical requirements.

## 2. Coding Standards and Validation
- **Never ignore coding standards**: Adhere strictly to the guidelines defined in `docs/03-coding-standards.txt`.
- **Never skip TypeScript validation**: All code must be strictly typed. Do not use `any`. Do not bypass the compiler.
- **Never disable ESLint**: Do not use `// eslint-disable-next-line` unless explicitly approved by a human lead. Write code that inherently passes all linting rules.
- **Always verify builds**: Ensure your code compiles successfully. A structurally sound file that breaks the build is a failure.

## 3. Architecture and Design Patterns
- **Never modify architecture without approval**: Do not introduce new state management libraries, routing paradigms, or database ORMs. Stick to the defined stack.
- **Always follow Clean Architecture**: Enforce strict boundaries between the Presentation layer (UI), Domain layer (business logic/Zustand), and Data layer (API clients/React Query).
- **Always use feature-first architecture**: Group files by feature (e.g., `src/features/workouts/`), not by technical type (e.g., `src/components/`, `src/hooks/`). See `docs/04-folder-structure.txt`.
- **Always follow SOLID principles**: Write components and services that are single-responsibility, open for extension but closed for modification.
- **Always create reusable components**: Do not build ad-hoc UI elements. Use and extend the centralized Design System defined in `docs/05-design-system.txt`.

## 4. State Management
- **Always use React Query**: For all asynchronous server state (fetching, caching, synchronizing, mutating data).
- **Always use Zustand**: For all synchronous client state (UI toggles, active session data).
- **Always use MMKV**: For synchronous, high-performance local persistence of non-sensitive data. Use `expo-secure-store` exclusively for sensitive credentials.

## 5. Code Quality and Integrity
- **Never generate placeholder code**: Do not write `// TODO: Implement later` or mock data structures unless explicitly requested as part of a prototyping phase. Write complete, production-grade logic.
- **Never duplicate code**: If logic or UI is repeated, abstract it into a shared hook, service, or component.
- **Never create unnecessary dependencies**: Do not install a new NPM package if the functionality can be reasonably implemented natively or with existing tools.
- **Always explain implementation decisions**: When writing complex logic, include clear, concise comments explaining *why* the approach was taken, especially if navigating edge cases.

## 6. Security
- **Never hardcode secrets**: API keys, database URLs, and JWT secrets must NEVER appear in the source code. Always use environment variables (`process.env` or `Constants.expoConfig.extra`).

## Enforcement
By operating within this repository, you acknowledge and agree to follow these rules without exception. When generating code, internally verify your output against this checklist before presenting it to the user.
