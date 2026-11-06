// Runs in MAIN world as an extension file, without inline scripts or a CSP bypass.
(() => {
  const host = window as Window & { __kyaraManagerFetchHook?: boolean };
  if (host.__kyaraManagerFetchHook) return;
  host.__kyaraManagerFetchHook = true;
  const original = window.fetch;
  window.fetch = async function (...args: Parameters<typeof fetch>) {
    const response = await original.apply(this, args);
    const input = args[0];
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (response.ok && url.origin === location.origin && /^\/api\/packs\/[^/]+\/open(?:-many)?$/.test(url.pathname)) {
      void response.clone().json().then((detail) => {
        window.dispatchEvent(new CustomEvent('kyara:pull', { detail }));
      }).catch(() => {});
    }
    return response;
  };
})();
