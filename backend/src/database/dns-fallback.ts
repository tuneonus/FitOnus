import dns from 'node:dns';

let isFallbackInstalled = false;

interface DnsCacheEntry {
  addresses: string[];
  expiresAt: number;
}

const KNOWN_NEON_IPS = ['52.76.246.190', '52.76.212.156', '3.0.27.201'];
const dnsCache = new Map<string, DnsCacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

/**
 * Installs an intelligent DNS fallback and caching mechanism that delegates to public
 * DNS resolvers (Google 8.8.8.8 and Cloudflare 1.1.1.1) when local system resolvers fail
 * (e.g. DHCP router DNS returning EAI_AGAIN or REFUSED for cloud database endpoints),
 * and caches resolved addresses in memory so connection pool bursts don't starve the threadpool.
 */
export function setupDnsFallback(): void {
  if (isFallbackInstalled) {
    return;
  }
  isFallbackInstalled = true;

  const originalLookup = dns.lookup;
  const fallbackResolver = new dns.Resolver();
  fallbackResolver.setServers(['1.1.1.1', '1.0.0.1', '8.8.8.8', '8.8.4.4']);

  // Override dns.lookup with cache + fallback support
  // @ts-expect-error Type overloading complexity in Node dns.lookup
  dns.lookup = function patchedLookup(
    hostname: string,
    options: unknown,
    callback?: (...args: unknown[]) => void,
  ): void {
    let cb = callback;
    let opts: dns.LookupOptions = {};

    if (typeof options === 'function') {
      cb = options as (...args: unknown[]) => void;
      opts = {};
    } else if (typeof options === 'number') {
      opts = { family: options };
    } else if (typeof options === 'object' && options !== null) {
      opts = options;
    }

    if (!cb) {
      return;
    }

    const actualCb = cb;

    // Check memory cache first
    const cached = dnsCache.get(hostname);
    if (cached && cached.expiresAt > Date.now() && cached.addresses.length > 0) {
      if (opts.all) {
        actualCb(
          null,
          cached.addresses.map((ip) => ({ address: ip, family: 4 })),
        );
        return;
      }
      actualCb(null, cached.addresses[0], 4);
      return;
    }

    // For cloud database endpoints known to fail on local DHCP router DNS (e.g. neon.tech),
    // query fallback resolver directly via non-blocking c-ares to avoid blocking libuv threads
    if (hostname.includes('neon.tech')) {
      fallbackResolver.resolve4(hostname, (fallbackErr, addresses) => {
        const resolvedIps = !fallbackErr && addresses && addresses.length > 0 ? addresses : KNOWN_NEON_IPS;
        dnsCache.set(hostname, {
          addresses: resolvedIps,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });

        if (opts.all) {
          actualCb(
            null,
            resolvedIps.map((ip) => ({ address: ip, family: 4 })),
          );
          return;
        }
        actualCb(null, resolvedIps[0], 4);
      });
      return;
    }

    originalLookup(
      hostname,
      opts as dns.LookupOneOptions,
      (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => {
        if (err) {
          fallbackResolver.resolve4(hostname, (fallbackErr, addresses) => {
            if (fallbackErr || !addresses || addresses.length === 0) {
              actualCb(err);
              return;
            }

            dnsCache.set(hostname, {
              addresses,
              expiresAt: Date.now() + CACHE_TTL_MS,
            });

            if (opts.all) {
              actualCb(
                null,
                addresses.map((ip) => ({ address: ip, family: 4 })),
              );
              return;
            }

            actualCb(null, addresses[0], 4);
          });
          return;
        }

        actualCb(err, address, family);
      },
    );
  };
}
