import type { Logger } from '../../../../shared/logging/logger.js';
import type {
  ChatMessageTurn,
  ConversationRepository,
  MemoryExtractionJobQueue,
  MemoryExtractor,
  MemoryRepository,
} from '../ports.js';
import type { MemoryExtractionJob } from '../../domain/extraction-job.types.js';

export interface MemoryExtractionWorkerDeps {
  queue: MemoryExtractionJobQueue;
  memoryRepo: MemoryRepository;
  conversationRepo: ConversationRepository;
  extractor: MemoryExtractor;
  logger?: Pick<Logger, 'info' | 'warn'>;
  intervalMs?: number;
  batchSize?: number;
  leaseSeconds?: number;
  maxBatchesPerDrain?: number;
  enabled?: boolean;
}

function cleanMemoryString(str: string): string {
  return str
    .replace(/^\[[A-Z_]+\]:\s*/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Node-side safety gate for sensitive health information.
 * Evaluates candidate category, English clinical terms, Tamil script, and Tanglish phrases.
 * Sensitive items must NEVER be automatically stored in persistent memory.
 */
export function isSensitiveHealthContent(
  category: string,
  text: string,
  sourceQuote?: string | null,
): boolean {
  if (category === 'injuries' || category === 'medical') {
    return true;
  }

  const combined = `${text} ${sourceQuote ?? ''}`.toLowerCase();

  // 1. English clinical / injury / allergy / symptom patterns
  const englishSensitiveRegex =
    /\b(injur\w*|pain\w*|hurts?|aches?|aching|soreness|tears?|torn|sprains?|strains?|fractures?|broken|dislocat\w*|rotator cuff|meniscus|acl|mcl|pcl|tendon\w*|impingement|herniat\w*|disc bulge|sciatica|concussion|diagnos\w*|doctors?|physicians?|hospitals?|clinics?|surger\w*|surgical|syndromes?|diseases?|illness\w*|diabet\w*|hypertens\w*|cardiac|heart (?:attack|condition|disease)|asthma|arthritis|epilepsy|seizures?|cancer|tumors?|chest pain|shortness of breath|dizziness|faint\w*|nausea|vomit\w*|swelling|numbness|blood|allerg\w*|anaphylax\w*|prescri\w*|medicat\w*|medicines?|steroids?|insulin|inhalers?|antibiotics?|depress\w*|anxi\w*)\b/i;

  if (englishSensitiveRegex.test(combined)) {
    return true;
  }

  // 2. Tamil script sensitive patterns (injuries, diagnoses, symptoms, doctors, medicines)
  const tamilSensitiveRegex =
    /(வலி|காயம்|முறிவு|நோய்|மருத்துவர்|மருந்து|ஒவ்வாமை|சுளுக்கு|ஆபரேஷன்|அறுவை|வீக்கம்|மயக்கம்|மூச்சுத்திணறல்|நெஞ்சு வலி|ஆஸ்துமா|நீரிழிவு|இரத்த அழுத்தம்)/;

  if (tamilSensitiveRegex.test(combined)) {
    return true;
  }

  // 3. Tanglish (colloquial Tamil in Latin script) sensitive patterns
  const tanglishSensitiveRegex =
    /\b(vali|valik\w+|kaayam|maruthuvar|marunthu|sulukku|veeng\w+|veekam|mayakkam|udambu vali|muthuku vali|kaal vali|kai vali|knee vali|shoulder vali|back vali|chest vali|doctor kitta|(?:operation|surgery) (?:panninen|pannanga|pannirukken)|heart attack|asthma|allergy)\b/i;

  if (tanglishSensitiveRegex.test(combined)) {
    return true;
  }

  return false;
}

export class MemoryExtractionWorker {
  private readonly enabled: boolean;
  private readonly batchSize: number;
  private readonly leaseSeconds: number;
  private readonly intervalMs: number;
  private readonly maxBatches: number;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<number> | null = null;
  private rerun = false;

  constructor(private readonly deps: MemoryExtractionWorkerDeps) {
    this.enabled = deps.enabled ?? true;
    this.batchSize = deps.batchSize ?? 5;
    this.leaseSeconds = deps.leaseSeconds ?? 60;
    this.intervalMs = deps.intervalMs ?? 15_000;
    this.maxBatches = deps.maxBatchesPerDrain ?? 5;
  }

  /**
   * Starts the periodic extraction loop.
   */
  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.kick(), this.intervalMs);
    this.timer.unref();
    this.kick();
  }

  /**
   * Stops the background loop and gracefully awaits any in-flight batch.
   */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.rerun = false;
    await this.inFlight?.catch(() => undefined);
  }

  /**
   * Non-blocking kick: starts a drain pass in background.
   */
  kick(): void {
    if (!this.enabled) return;
    void this.drain().catch((err: unknown) => {
      this.deps.logger?.warn?.(
        `[MemoryExtractionWorker] Background drain pass failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Processes due jobs until none are left or maxBatches is reached.
   */
  drain(): Promise<number> {
    if (this.inFlight) {
      this.rerun = true;
      return this.inFlight;
    }
    const run = this.runBatches().finally(() => {
      this.inFlight = null;
      if (this.rerun) {
        this.rerun = false;
        this.kick();
      }
    });
    this.inFlight = run;
    return run;
  }

  private async runBatches(): Promise<number> {
    let totalProcessed = 0;
    for (let batch = 0; batch < this.maxBatches; batch++) {
      const count = await this.processBatch(this.batchSize, this.leaseSeconds);
      totalProcessed += count;
      if (count < this.batchSize) break;
    }
    return totalProcessed;
  }

  /**
   * Processes a single batch of due memory extraction jobs using lease-based concurrency.
   * Returns the count of jobs successfully processed.
   */
  async processBatch(batchSize = 5, leaseSeconds = 60): Promise<number> {
    const jobs = await this.deps.queue.claimDue(batchSize, leaseSeconds);
    if (jobs.length === 0) return 0;

    let processedCount = 0;

    for (const job of jobs) {
      try {
        await this.processJob(job);
        await this.deps.queue.complete(job.id);
        processedCount++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.deps.logger?.warn?.(
          `[MemoryExtractionWorker] Job ${job.id} failed (attempt ${job.attempts + 1}/${job.maxAttempts})`,
        );
        // Sanitize error string to never leak message or private text into logs/database
        const safeError = errorMsg.slice(0, 200).replace(/[^\w\s:.-]/g, '');
        await this.deps.queue.fail(job.id, safeError);
      }
    }

    return processedCount;
  }

  private async processJob(job: MemoryExtractionJob): Promise<void> {
    // 1. Consent pre-check: If user has revoked consent, cancel job immediately
    const consented = await this.deps.memoryRepo.isMemoryEnabled(job.userId);
    if (!consented) {
      this.deps.logger?.info?.(
        `[MemoryExtractionWorker] User ${job.userId} revoked memory consent; skipping job ${job.id}.`,
      );
      return;
    }

    // 2. Fetch recent conversation messages
    const pastMessages = await this.deps.conversationRepo.getMessages(
      job.userId,
      job.conversationId,
      6,
    );
    if (pastMessages.length === 0) return;

    const turns: ChatMessageTurn[] = pastMessages
      .filter((m) => m.text && m.text.trim().length > 0)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        text: m.text,
      }));

    // 3. Fetch active and suppressed (dismissed) memories for deduplication
    const activeList = await this.deps.memoryRepo.getActiveMemoriesForContext(job.userId);
    const dismissedList = await this.deps.memoryRepo.getDismissedTexts(job.userId);
    const existingForDedup = [...activeList, ...dismissedList];

    // 4. Call Python extraction endpoint
    const candidates = await this.deps.extractor.extract(
      job.userId,
      turns,
      existingForDedup,
    );

    // 5. Consent recheck BEFORE persisting (prevents race conditions if user revoked while LLM ran)
    const stillConsented = await this.deps.memoryRepo.isMemoryEnabled(job.userId);
    if (!stillConsented) return;

    // 6. In-flight cancellation re-check: if clearAll or revocation cancelled the job while LLM ran, abort!
    const isCancelled = await this.deps.queue.isJobCancelled(job.id);
    if (isCancelled) {
      this.deps.logger?.info?.(
        `[MemoryExtractionWorker] Job ${job.id} was cancelled in-flight; discarding extraction results.`,
      );
      return;
    }

    // 7. Safety gate & persistence: Reject sensitive health info; save valid preferences as 'pending_approval'
    for (const cand of candidates) {
      // NODE-SIDE SAFETY GATE: Never automatically extract/store medical diagnoses, injuries, symptoms, or allergies!
      if (
        cand.sensitive ||
        isSensitiveHealthContent(cand.category, cand.text, cand.sourceQuote)
      ) {
        this.deps.logger?.info?.(
          `[MemoryExtractionWorker] Rejected sensitive health memory candidate (${cand.category}) for user ${job.userId}.`,
        );
        continue;
      }

      const cleanCand = cleanMemoryString(cand.text);
      if (!cleanCand || cleanCand.length < 3) continue;

      const isDuplicate = existingForDedup.some((known) => {
        const cleanKnown = cleanMemoryString(known);
        if (!cleanKnown) return false;
        if (cleanKnown.includes(cleanCand) || cleanCand.includes(cleanKnown)) {
          return true;
        }
        const wordsKnown = cleanKnown.split(/\s+/).filter((w) => w.length > 2);
        const wordsCand = cleanCand.split(/\s+/).filter((w) => w.length > 2);
        if (wordsCand.length === 0 || wordsKnown.length === 0) return false;
        const common = wordsCand.filter((w) => wordsKnown.includes(w));
        return common.length / Math.min(wordsKnown.length, wordsCand.length) >= 0.6;
      });
      if (isDuplicate) continue;

      // Persist strictly as 'pending_approval' — NEVER active without explicit user approval!
      await this.deps.memoryRepo.createMemory(job.userId, {
        category: cand.category,
        text: cand.text,
        source: 'Conversation',
        sensitive: false,
        status: 'pending_approval',
        confidence: cand.confidence,
        sourceMessageId: job.messageId,
        sourceConversationId: job.conversationId,
      });
    }
  }
}
