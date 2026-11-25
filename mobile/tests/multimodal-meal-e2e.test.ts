import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import express from '../../backend/node_modules/express/index.js';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiClient } from '../src/services/api-client';
import { useAuthStore } from '../src/features/auth/stores/auth-store';
import { queryClient } from '../src/providers/query-provider';
import { MultimodalMealApi } from '../src/features/ai-coach/services/multimodal-meal-api';
import { AiUsageGateService, CheckAndRecordAiQuotaUseCase } from '../../backend/src/modules/app-settings/index';
import { AnalyzeMultimodalMealUseCase } from '../../backend/src/modules/nutrition/application/use-cases/analyze-multimodal-meal';
import { PythonMultimodalMealService } from '../../backend/src/modules/nutrition/infrastructure/python-multimodal-meal-service';
import { createNutritionMemberController } from '../../backend/src/modules/nutrition/interface/nutrition.controller';
import { createNutritionMemberRoutes } from '../../backend/src/modules/nutrition/interface/nutrition.routes';
import { multimodalMealResponseSchema } from '../../backend/src/modules/nutrition/interface/multimodal-meal.schemas';
import { PythonAiClient } from '../../backend/src/shared/ai/python-ai-client';
import { createActor } from '../../backend/src/shared/auth/actor';
import { errorHandler, notFoundHandler } from '../../backend/src/middleware/error-handler';
import { requestContext } from '../../backend/src/middleware/request-context';
import { buildRouter } from '../../backend/src/shared/http/route';
import { createLogger } from '../../backend/src/shared/logging/logger';
import { InMemoryAiUsageStore } from '../../backend/tests/helpers/ai-usage-gate';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PYTHON_BIN = path.join(ROOT, 'ai-backend', '.venv', 'bin', 'python');
const SECRET = 'e2e-test-secret-e2e-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';

const PYTHON_SERVER_SCRIPT = `
import json, socket
import uvicorn
import onusfit_ai.shared.observability.observability  # avoid concurrent Phase 17 init cycle
from onusfit_ai.main import create_app
from onusfit_ai.shared.llm.dependencies import get_llm
from onusfit_ai.shared.llm.ports import LlmResult, LlmUsage

class E2EFakeLlm:
    async def generate_text(self, prompt, *, primary_model, fallback_model, deadline_s, media=None, schema=None, **kwargs):
        media_list = media if isinstance(media, list) else ([media] if media else [])
        exif_present = any((b"GPS_LAT" in m.data) or (b"\\xff\\xe1" in m.data) for m in media_list)
        if "stone_only" in prompt:
            payload = {
                "isFood": False,
                "summary": "No recognizable food found in image.",
                "transcript": "stone_only",
                "detectedLanguage": "en",
                "items": [],
                "overallConfidence": 0.1,
                "confidence": "low",
                "unclearReason": "Please frame the meal clearly on a plate.",
            }
        else:
            payload = {
                "isFood": True,
                "summary": "2 Idli with Sambar (exif_present=" + str(exif_present) + ")",
                "transcript": "rendu idli sambar",
                "detectedLanguage": "tanglish",
                "items": [{
                    "name": "Idli",
                    "portionDescription": "2 pieces",
                    "servingWeightG": 120,
                    "servingUnit": "piece",
                    "servingSize": 2,
                    "calories": 156,
                    "proteinG": 4.8,
                    "carbsG": 31.2,
                    "fatG": 0.8,
                    "fiberG": 1.6,
                    "confidence": "medium",
                }],
                "confidence": "medium",
                "unclearReason": "Home batter fermentation and sambar oil can shift energy by +-15%.",
            }
        parsed_obj = schema.model_validate(payload)
        return LlmResult(
            text=json.dumps(payload),
            parsed=parsed_obj,
            usage=LlmUsage(
                model=primary_model,
                is_fallback=False,
                input_tokens=420,
                output_tokens=95,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=515,
                duration_ms=110,
            ),
        )

app = create_app()
app.dependency_overrides[get_llm] = lambda: E2EFakeLlm()

sock = socket.socket()
sock.bind(("127.0.0.1", 0))
port = sock.getsockname()[1]
sock.close()

class Server(uvicorn.Server):
    async def startup(self, sockets=None):
        await super().startup(sockets=sockets)
        print(f"READY:{port}", flush=True)

config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
Server(config).run()
`;

function createJpegWithExifGpsBase64(): string {
  const exif = Buffer.from('Exif\0\0GPS_LAT=13.08', 'latin1');
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(exif.length + 2, 0);
  const exifSeg = Buffer.concat([Buffer.from([0xff, 0xe1]), lenBuf, exif]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  const eoi = Buffer.from([0xff, 0xd9]);
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), exifSeg, sos, Buffer.from('imgdata', 'latin1'), eoi]);
  return jpeg.toString('base64');
}

async function startPythonServer(): Promise<{ url: string; stop: () => Promise<void> }> {
  const proc: ChildProcess = spawn(PYTHON_BIN, ['-c', PYTHON_SERVER_SCRIPT], {
    cwd: path.join(ROOT, 'ai-backend'),
    env: {
      ...process.env,
      PYTHONPATH: path.join(ROOT, 'ai-backend', 'src'),
      AI_SERVICE_JWT_SECRET: SECRET,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const url = await new Promise<string>((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`Python E2E server timeout: ${stderr}`)), 10_000);
    proc.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    proc.stdout?.on('data', (chunk) => {
      const text = String(chunk);
      const match = /READY:(\d+)/.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Python E2E server exited early (${code}): ${stderr}`));
    });
  });

  return {
    url,
    stop: async () => {
      if (proc.exitCode !== null) return;
      proc.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const killer = setTimeout(() => {
          if (proc.exitCode === null) proc.kill('SIGKILL');
          resolve();
        }, 1_500);
        proc.once('exit', () => {
          clearTimeout(killer);
          resolve();
        });
      });
    },
  };
}

class InMemorySettingsRepo {
  readonly store = new InMemoryAiUsageStore();
  async getSettingByKey(key: string) {
    return {
      key,
      value:
        key === 'features.flags'
          ? { aiCoach: true, mealPhotoScanner: true, voiceMealEntry: true, workoutGenerator: true }
          : {
              dailyGlobalLimit: 50,
              coachChatDailyLimit: 20,
              mealPhotoDailyLimit: 10,
              voiceMealDailyLimit: 10,
              workoutGeneratorDailyLimit: 10,
            },
    };
  }
  reserveAiUsage = (input: Parameters<InMemoryAiUsageStore['reserveAiUsage']>[0]) =>
    this.store.reserveAiUsage(input);
  releaseAiUsage = (input: Parameters<InMemoryAiUsageStore['releaseAiUsage']>[0]) =>
    this.store.releaseAiUsage(input);
}

describe('End-to-End Mobile -> Node.js -> Python FastAPI (mocked Gemini)', () => {
  const originalAdapter = apiClient.defaults.adapter;

  beforeEach(() => {
    useAuthStore
      .getState()
      .setAuth({ id: USER, name: 'Arun', email: 'arun@example.test', isEmailVerified: true });
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    useAuthStore.getState().clearAuth();
    queryClient.clear();
  });

  it('analyzes EXIF-tagged photo + Tanglish clarification end-to-end, strips EXIF GPS, returns uncertainty & meters quota', async () => {
    const py = await startPythonServer();
    const settings = new InMemorySettingsRepo();

    const app = express();
    app.use(requestContext(createLogger({ level: 'silent', pretty: false })));
    app.use(express.json({ limit: '30mb' }));
    const service = new PythonMultimodalMealService({
      client: new PythonAiClient({ baseUrl: py.url, serviceSecret: SECRET }),
      resolveModels: () => Promise.resolve({ primary: 'gemini-3.5-flash-lite', fallback: null }),
      pythonTimeoutMs: 10_000,
    });
    const useCase = new AnalyzeMultimodalMealUseCase(
      service,
      new AiUsageGateService(new CheckAndRecordAiQuotaUseCase(settings as never)),
    );
    const controller = createNutritionMemberController({ analyzeMultimodalMeal: useCase } as never);
    app.use(
      '/api/v1/nutrition',
      buildRouter(createNutritionMemberRoutes('/api/v1/nutrition', controller).routes, {
        authenticate: (req, _res, next) => {
          req.actor = createActor({ userId: USER, sessionId: 's1', role: 'member' });
          next();
        },
      }),
    );
    app.use(notFoundHandler);
    app.use(errorHandler);

    const nodeServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => nodeServer.once('listening', resolve));
    const nodePort = (nodeServer.address() as AddressInfo).port;
    const nodeBaseUrl = `http://127.0.0.1:${nodePort}/api/v1`;

    // Wire Mobile apiClient directly over real HTTP to the Node Express server.
    apiClient.defaults.adapter = (async (config: {
      url?: string;
      method?: string;
      data?: unknown;
      signal?: AbortSignal;
    }) => {
      const targetUrl = `${nodeBaseUrl}${config.url}`;
      const res = await fetch(targetUrl, {
        method: (config.method ?? 'POST').toUpperCase(),
        headers: { 'content-type': 'application/json' },
        body: config.data as string,
        ...(config.signal ? { signal: config.signal as never } : {}),
      });
      const jsonBody = await res.json();
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`) as Error & {
          response?: { status: number; data: unknown };
        };
        err.response = { status: res.status, data: jsonBody };
        throw err;
      }
      return { config, status: res.status, statusText: res.statusText, headers: {}, data: jsonBody };
    }) as never;

    try {
      const jpegWithExif = createJpegWithExifGpsBase64();
      const result = await MultimodalMealApi.analyzeMultimodalMeal({
        image: jpegWithExif,
        imageMimeType: 'image/jpeg',
        transcript: 'rendu idli sambar breakfast',
        mealType: 'breakfast',
        lang: 'tanglish',
        notes: 'home cooked',
      });

      // Verified EXIF metadata stripped to False before reaching mocked Gemini
      assert.ok(result.summary.includes('exif_present=False'), `Expected exif_present=False, got: ${result.summary}`);
      assert.deepEqual(result.modalitiesUsed, ['text', 'image']);
      assert.equal(result.isFood, true);
      assert.equal(result.detectedLanguage, 'tanglish');
      assert.equal(result.items[0]?.confidence, 0.8);
      assert.ok(result.uncertaintyNote?.includes('+-15%'));
      assert.ok(result.medicalDisclaimer.toLowerCase().includes('not medical'));
      assert.equal(settings.store.actionCount(USER, 'meal_photo'), 1);

      // Verify schema agreement between Python reply, Node controller output, and Mobile result
      const validated = multimodalMealResponseSchema.parse({
        ...result,
        items: result.items.map((item) => ({ ...item, confidence: 'medium' as const, isAiEstimated: true })),
      });
      assert.equal(validated.totalKcal, 156);

      // Non-food image + text comes back cleanly with empty items and guidance
      const nonFoodResult = await MultimodalMealApi.analyzeMultimodalMeal({
        image: jpegWithExif,
        imageMimeType: 'image/jpeg',
        transcript: 'stone_only',
      });
      assert.equal(nonFoodResult.isFood, false);
      assert.deepEqual(nonFoodResult.items, []);
      assert.equal(nonFoodResult.unclearReason, 'Please frame the meal clearly on a plate.');
      assert.equal(settings.store.actionCount(USER, 'meal_photo'), 2);

      // Disguised SVG payload must fail in Node validation with zero Python call and zero quota charge
      const svgPayload = Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64');
      await assert.rejects(
        () =>
          MultimodalMealApi.analyzeMultimodalMeal({
            image: svgPayload,
            imageMimeType: 'image/png',
            transcript: 'stone_only',
          }),
        /HTTP 400/,
      );
      assert.equal(settings.store.actionCount(USER, 'meal_photo'), 2);
    } finally {
      nodeServer.closeAllConnections?.();
      await new Promise<void>((resolve) => nodeServer.close(() => resolve()));
      await py.stop();
    }
  });
});
