# Architecture Decisions

This document outlines the core architectural and technological choices made for FitOnus. It explains the *why* behind the stack, providing context for developers and AI agents regarding trade-offs, advantages, and future considerations.

---

## Why Expo?
**Decision**: Use React Native with the Expo framework (managed workflow / SDK 57) instead of bare React Native or native development (Swift/Kotlin).
- **Advantages**: Drastically accelerates development speed. Expo Router provides seamless file-based routing and deep linking. EAS (Expo Application Services) simplifies cloud builds and over-the-air (OTA) updates. Eliminates the need to manage complex Xcode/Android Studio configurations manually.
- **Disadvantages**: Slightly larger app bundle size. Requires utilizing Expo's custom development clients if highly specific native modules are needed.
- **Trade-off**: The speed of cross-platform iteration vastly outweighs the minor performance overhead compared to pure native code.

## Why React Query?
**Decision**: Use TanStack React Query for all server-state management.
- **Advantages**: Automatically handles caching, background fetching, stale-time management, and retry logic. Eliminates boilerplate Redux/thunk code for API calls. Provides optimistic updates out of the box.
- **Disadvantages**: Adds a slight learning curve regarding cache invalidation strategies.
- **Trade-off**: Managing async state manually is error-prone; React Query guarantees a robust, scalable data synchronization layer.

## Why Zustand?
**Decision**: Use Zustand for client-side synchronous state management (e.g., UI toggles, active workout timers).
- **Advantages**: Extremely lightweight, unopinionated, and requires zero boilerplate. Does not require wrapping the app in context providers.
- **Disadvantages**: Lacks the rigid structure of Redux, meaning developers must adhere strictly to conventions to avoid spaghetti state.
- **Future Considerations**: Can easily scale to handle complex local state as the app grows, without the performance hits of React Context.

## Why MMKV?
**Decision**: Use `react-native-mmkv` for local, synchronous key-value storage.
- **Advantages**: Phenomenal performance (written in C++, synchronous access). Up to 30x faster than AsyncStorage. Ideal for caching user preferences and non-sensitive offline data.
- **Disadvantages**: Data is not inherently encrypted unless explicitly configured (which adds overhead).
- **Trade-off**: We use MMKV for speed and `expo-secure-store` exclusively for sensitive tokens, balancing performance and security perfectly.

## Why PostgreSQL (via Supabase)?
**Decision**: Use a relational PostgreSQL database hosted on Supabase over NoSQL (MongoDB) or Firebase.
- **Advantages**: SQL guarantees ACID compliance, strict schemas, and data integrity (essential for health/fitness data). Supabase provides out-of-the-box Auth, Row-Level Security (RLS) for absolute tenant isolation, and connection pooling.
- **Disadvantages**: Requires careful schema design and migration management upfront compared to schema-less NoSQL.
- **Future Considerations**: PostgreSQL is the gold standard for enterprise data. Supabase allows us to scale seamlessly and utilize powerful extensions.

## Why NestJS?
**Decision**: Use NestJS as the Node.js backend framework.
- **Advantages**: Enterprise-grade architecture with built-in Dependency Injection, modularity, and strict TypeScript integration out of the box.
- **Disadvantages**: Steeper learning curve and more boilerplate compared to minimalist frameworks like Express or Fastify.
- **Trade-off**: The robust structural guarantees, maintainability, and testing capabilities justify the initial boilerplate overhead.

## Why pgvector?
**Decision**: Use the `pgvector` extension within PostgreSQL for vector embeddings storage and similarity search.
- **Advantages**: Keeps all AI data (Memory, RAG embeddings) in the same relational database as user data. Allows joining vector searches with standard SQL filters (e.g., "find memories similar to X *where* user_id = Y"). Eliminates the need for a separate, expensive vector database like Pinecone.
- **Disadvantages**: HNSW indexing can consume significant memory at scale.
- **Future Considerations**: Monitor memory usage as the AI Memory system scales; tune index parameters accordingly.

## Why OpenAI Responses API (gpt-4o)?
**Decision**: Use OpenAI's models for the AI Coach rather than local/open-source LLMs.
- **Advantages**: State-of-the-art reasoning, exceptional instruction following, and robust function calling capabilities (critical for the AI to trigger app actions). Native streaming support for fast UX.
- **Disadvantages**: Vendor lock-in, API costs, and privacy concerns regarding data transmission (mitigated by B2B data privacy agreements and PII scrubbing).
- **Trade-off**: Open-source models currently lack the reliability in complex function calling required to act as an autonomous fitness coach.

## Why RAG (Retrieval-Augmented Generation)?
**Decision**: Implement a RAG system for health and fitness advice rather than relying on the LLM's base knowledge.
- **Advantages**: Eliminates hallucinations. Ensures all advice is grounded in a verified, scientifically accurate knowledge base that TuneOnus controls. Allows the AI to cite specific sources.
- **Disadvantages**: Adds latency (requires an embedding step and database query before LLM generation) and engineering complexity.
- **Trade-off**: In the health space, accuracy and safety are paramount. RAG is non-negotiable for mitigating liability and building user trust.

## Why Clean Architecture?
**Decision**: Strictly separate the codebase into Presentation, Domain, and Data layers.
- **Advantages**: Makes the application highly testable, maintainable, and independent of external frameworks. If we change the API client or database, the UI components remain entirely unaffected.
- **Disadvantages**: Requires writing more boilerplate (interfaces, mappers) upfront.
- **Future Considerations**: Protects the core business logic from UI/Framework churn over the expected two-year lifespan of the project.

## Why Feature-First Architecture?
**Decision**: Group folders by domain features (`/features/workouts/`) rather than technical type (`/components/`, `/hooks/`).
- **Advantages**: Excellent scalability. Developers (and AI agents) can locate all logic, UI, and state for a specific feature in one isolated directory. Prevents the "monolith" folder problem where `src/components` contains 500 unrelated files.
- **Disadvantages**: Can lead to minor confusion regarding where to place cross-cutting concerns (which go in `src/lib` or `src/components/shared`).
- **Trade-off**: The isolation and mental clarity provided by feature-scoping drastically reduces cognitive load for large teams.
