import dns from 'node:dns';

let isFallbackInstalled = false;

/**
 * Installs a DNS fallback mechanism that delegates to public DNS resolvers
 * (Google 8.8.8.8 and Cloudflare 1.1.1.1) when the local system resolver fails
 * (e.g. DHCP router DNS returning EAI_AGAIN or REFUSED for cloud database endpoints).
 */
export function setupDnsFallback(): void {
  if (isFallbackInstalled) {
    return;
  }
  isFallbackInstalled = true;

  const originalLookup = dns.lookup;
  const fallbackResolver = new dns.Resolver();
  fallbackResolver.setServers(['8.8.8.8', '1.1.1.1']);

  // Override dns.lookup with fallback support
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

    originalLookup(
      hostname,
      opts as dns.LookupOneOptions,
      (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family: number) => {
        if (err && (err.code === 'EAI_AGAIN' || err.code === 'ENOTFOUND' || err.code === 'EREFUSED')) {
          fallbackResolver.resolve4(hostname, (fallbackErr, addresses) => {
            if (fallbackErr || !addresses || addresses.length === 0) {
              actualCb(err);
              return;
            }

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
