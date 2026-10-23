// Controlled fixture pages only. The production code and URL validator are unchanged.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const root = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), "pagesentinel-test-"));
const extension = path.join(temp, "extension"),
  profile = path.join(temp, "profile");
await cp(path.join(root, "dist"), extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(path.join(extension, "manifest.json"), "utf8"),
);
assert.equal(manifest.host_permissions, undefined);
// Only this temporary test copy pre-grants one synthetic origin. Native grant/deny
// dialogs and OS-level notification display remain supervised checks.
manifest.host_permissions = ["http://fixture.example.com/*"];
await writeFile(
  path.join(extension, "manifest.json"),
  JSON.stringify(manifest),
);
let policyVersion = 0,
  productPrice = 299,
  state = "ok",
  requests = 0,
  cookies = [];
const initialPolicy =
  "We do not share personal information with advertising partners.";
const updatedPolicy =
  "We may share personal information with selected advertising partners.";
const server = createServer((req, res) => {
  requests++;
  cookies.push({ url: req.url, cookie: req.headers.cookie ?? "" });
  if (req.url === "/redirect") {
    res.writeHead(302, { location: "http://elsewhere.example.com/private" });
    res.end();
    return;
  }
  if (req.url === "/json") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end("{}");
    return;
  }
  if (req.url === "/huge") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end("a".repeat(2 * 1024 * 1024 + 1));
    return;
  }
  if (state === "http-error") {
    res.writeHead(503, { "content-type": "text/html" });
    res.end("Service unavailable");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><head><title>${req.url === "/privacy" ? "Northstar privacy policy" : "Aster running shoes"}</title><style>body{font:18px system-ui;max-width:760px;margin:80px auto;color:#17362c}button{padding:12px}#price{font-size:32px}</style></head><body><main><h1>${req.url === "/privacy" ? "Northstar privacy policy" : "Aster running shoes"}</h1>${req.url === "/privacy" ? `<p>${policyVersion ? updatedPolicy : initialPolicy}</p><p>We retain account records for ${policyVersion ? 90 : 30} days.</p><p>You can request a copy of your data at any time.</p>` : `<p>Lightweight everyday running shoes.</p>${state === "missing" ? "" : `<p id="price">€${productPrice}</p>`}<p>In stock</p><button id="buy">Add to basket</button>`}</main><script>window.fixtureScriptRan=true</script></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://fixture.example.com:${server.address().port}`;
const options = {
  headless: true,
  channel: "chromium",
  viewport: { width: 1440, height: 960 },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--host-resolver-rules=MAP fixture.example.com 127.0.0.1",
    "--no-proxy-server",
  ],
};
if (process.env.CHROMIUM_PATH)
  options.executablePath = process.env.CHROMIUM_PATH;
let context, worker, ui, extensionId;
const report = [],
  runtimeErrors = [];
const pass = (name) => {
  report.push(name);
  console.log(`PASS ${name}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screenshots = path.join(root, "docs", "screenshots");
await mkdir(screenshots, { recursive: true });
async function launch() {
  context = await chromium.launchPersistentContext(profile, options);
  worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  extensionId = new URL(worker.url()).host;
  ui = await context.newPage();
  ui.on("pageerror", (e) => runtimeErrors.push(e.message));
  await ui.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await ui.getByRole("heading", { name: "Your pages, in view." }).waitFor();
}
async function api(type, rest = {}) {
  const result = await ui.evaluate(
    ({ type, rest }) => chrome.runtime.sendMessage({ type, ...rest }),
    { type, rest },
  );
  if (!result?.ok) throw new Error(result?.error ?? "Worker did not respond");
  return result.data;
}
async function poll(fn, predicate, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (predicate(result)) return result;
    await sleep(150);
  }
  throw new Error("Fixture scenario timed out");
}
async function editDB(id, change) {
  await ui.evaluate(
    async ({ id, change }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("pagesentinel", 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("monitors", "readwrite"),
          store = tx.objectStore("monitors"),
          r = store.get(id);
        r.onsuccess = () => store.put({ ...r.result, ...change });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id, change },
  );
}
try {
  await launch();
  pass("Manifest V3 worker and empty dashboard load");
  await ui.screenshot({ path: path.join(screenshots, "empty-light.png") });
  const defaults = {
    title: "Aster running shoes",
    url: `${base}/product`,
    selector: "#price",
    exclude: "",
    kind: "price",
    interval: 15,
    phrase: "",
    condition: "below",
    target: 250,
    decimal: "auto",
    ignoreNumbers: false,
    ignoreDates: false,
    ignoreText: "",
    threshold: 0,
    notify: true,
  };
  const started = performance.now();
  let product = await api("save", { config: defaults });
  assert(product.lastSuccess > 0);
  assert.equal(product.baseline, "€299");
  const createMs = Math.round(performance.now() - started);
  pass("Creates selected-price monitor and verifies public HTML baseline");
  let policy = await api("save", {
    config: {
      ...defaults,
      title: "Northstar · Privacy policy",
      url: `${base}/privacy`,
      kind: "policy",
      selector: "main",
      condition: "any",
      interval: 1440,
    },
  });
  const history = await api("history", { id: policy.id });
  assert.equal(history.length, 1);
  assert(history[0].initial);
  pass("Creates policy monitor with durable baseline history");
  policyVersion = 1;
  policy = await api("retry", { id: policy.id });
  assert.equal(policy.unread, 1);
  assert(policy.baseline.includes(updatedPolicy));
  let notifications = await worker.evaluate(() =>
    chrome.notifications.getAll(),
  );
  assert(Object.hasOwn(notifications, policy.id));
  pass(
    "Changed policy stores exact wording and produces native notification API record",
  );
  await api("retry", { id: policy.id });
  assert.equal((await api("history", { id: policy.id })).length, 2);
  pass("Identical content creates no duplicate change event");
  productPrice = 249;
  product = await api("retry", { id: product.id });
  assert.equal(product.lastPrice, 249);
  assert.equal(product.unread, 1);
  productPrice = 248;
  product = await api("retry", { id: product.id });
  assert.equal(product.unread, 1);
  pass(
    "Target price crossing alerts once and preserves subsequent price history",
  );
  state = "missing";
  const missing = await api("retry", { id: product.id });
  assert(missing.error.includes("missing"));
  assert.equal(missing.baseline, "€248");
  pass("Missing selector visibly fails without replacing successful baseline");
  state = "http-error";
  const failed = await api("retry", { id: product.id });
  assert(failed.error.includes("503"));
  assert.equal(failed.baseline, "€248");
  assert.equal(failed.failures, 2);
  pass("HTTP errors retain good baseline and apply retry backoff");
  state = "ok";
  product = await api("retry", { id: product.id });
  assert.equal(product.error, "");
  assert.equal(product.failures, 0);
  pass("Successful retry restores health");
  for (const [url, expected] of [
    ["/redirect", "redirect"],
    ["/json", "content type"],
    ["/huge", "2 MiB"],
  ]) {
    const m = await api("save", {
      config: {
        ...defaults,
        title: "Failure fixture",
        url: `${base}${url}`,
        kind: "text",
        selector: "",
        condition: "any",
        interval: 0,
        notify: false,
      },
    });
    assert(m.error.toLowerCase().includes(expected.toLowerCase()));
    assert.equal(m.lastSuccess, 0);
    await api("delete", { id: m.id });
  }
  pass("Rejects redirects, unsupported content types and oversized responses");
  const invalid = await ui.evaluate(() =>
    chrome.runtime.sendMessage({
      type: "save",
      config: { url: "file:///private" },
    }),
  );
  assert(!invalid.ok);
  const badMessage = await ui.evaluate(() =>
    chrome.runtime.sendMessage({ type: "unknown" }),
  );
  assert(!badMessage.ok);
  pass("Rejects malformed configuration and unknown messages");
  await api("pause", { id: product.id });
  const count = requests;
  await editDB(product.id, { nextCheck: Date.now() - 1000 });
  await worker.evaluate(() =>
    chrome.alarms.create("scheduler", { when: Date.now() + 200 }),
  );
  await sleep(1200);
  assert.equal(requests, count);
  pass("Paused monitor does not run when scheduler alarm fires");
  await api("resume", { id: product.id });
  // A real browser alarm event, with the stored monitor made due. No direct engine invocation.
  productPrice = 247;
  await editDB(product.id, { nextCheck: Date.now() - 1000 });
  await worker.evaluate(() =>
    chrome.alarms.create("scheduler", { when: Date.now() + 500 }),
  );
  await poll(
    () => api("state"),
    (x) => x.monitors.find((m) => m.id === product.id)?.lastPrice === 247,
    45000,
  );
  pass("Actual chrome.alarms event checks due monitor and records new content");
  const prefs = {
    theme: "light",
    accent: "teal",
    retention: 40,
    notifications: true,
  };
  await api("settings", { settings: prefs });
  const backup = await api("export");
  assert.equal(backup.version, 1);
  assert(backup.history.length >= 5);
  await assert.rejects(() =>
    api("import", {
      data: { version: 1, monitors: [{ ...defaults, url: "file:///private" }] },
    }),
  );
  assert.equal((await api("state")).monitors.length, 2);
  pass(
    "Versioned export includes history and malformed import leaves data unchanged",
  );
  assert.equal(await api("import", { data: backup }), 2);
  const imported = (await api("state")).monitors.filter(
    (m) => m.permissionRequired,
  );
  assert.equal(imported.length, 2);
  assert(imported.every((m) => m.paused && !m.hash));
  for (const m of imported) await api("delete", { id: m.id });
  pass(
    "Import restores validated new paused copies without trusting old baselines",
  );
  const web = await context.newPage();
  await web.goto(`${base}/product`);
  await context.addCookies([
    {
      name: "signed_in",
      value: "fixture-secret",
      domain: "fixture.example.com",
      path: "/",
    },
  ]);
  cookies = [];
  await api("retry", { id: product.id });
  const monitorRequests = cookies.filter((x) => x.url === "/product");
  assert.equal(monitorRequests.length, 1);
  assert(monitorRequests.every((x) => x.cookie === ""));
  pass("Background requests omit signed-in cookies");
  const tabId = await worker.evaluate(
    async (url) => (await chrome.tabs.query({})).find((t) => t.url === url)?.id,
    `${base}/product`,
  );
  // Host permission permits script injection in this test; interactive activeTab is a manual check.
  await api("pick", { tabId });
  const session = await context.newCDPSession(web);
  const ax = await session.send("Accessibility.getFullAXTree");
  assert(
    ax.nodes.some((n) => n.name?.value === "PageSentinel element selector"),
  );
  await web.locator("#price").hover();
  await web.locator("#price").click();
  const ax2 = await session.send("Accessibility.getFullAXTree");
  assert(ax2.nodes.some((n) => n.name?.value === "Use selection"));
  await web.screenshot({
    path: path.join(screenshots, "element-selection.png"),
  });
  // Native closed-shadow selector is intentionally reached by its accessibility node.
  const useNode = ax2.nodes.find(
    (n) => n.role?.value === "button" && n.name?.value === "Use selection",
  );
  const { model } = await session.send("DOM.getBoxModel", {
    backendNodeId: useNode.backendDOMNodeId,
  });
  const points = model.content;
  await web.mouse.click(
    (points[0] + points[4]) / 2,
    (points[1] + points[5]) / 2,
  );
  await poll(
    () => context.pages().length,
    (n) => n > 3,
  );
  const selectedPage = await poll(
    async () => context.pages().find((p) => p.url().includes("#new")),
    (x) => !!x,
  );
  await selectedPage.getByRole("dialog").waitFor();
  assert.equal(
    await selectedPage
      .getByLabel("CSS selector", { exact: false })
      .inputValue(),
    "#price",
  );
  await selectedPage.screenshot({
    path: path.join(screenshots, "create-monitor.png"),
  });
  await selectedPage.close();
  assert.equal(await web.locator("#pagesentinel-picker").count(), 0);
  pass(
    "Visual picker highlights, selects unique element, cleans up and opens prefilled monitor form",
  );
  await api("pick", { tabId });
  await web.keyboard.press("Escape");
  assert.equal(await web.locator("#pagesentinel-picker").count(), 0);
  pass("Escape cancels the picker without changing the page");
  await web.close();
  // Simulate the browser returning a denied host-access result. No production permission bypass.
  await worker.evaluate(() => {
    globalThis.savedContains = chrome.permissions.contains;
    chrome.permissions.contains = async () => false;
  });
  const revoked = await api("retry", { id: product.id });
  assert(revoked.permissionRequired && revoked.paused);
  assert.equal(revoked.baseline, "€247");
  await worker.evaluate(() => {
    chrome.permissions.contains = globalThis.savedContains;
    delete globalThis.savedContains;
  });
  pass("Denied host-access result pauses monitor and preserves its baseline");
  await ui.reload();
  await ui.getByText("1 monitor needs attention", { exact: true }).waitFor();
  await ui.screenshot({ path: path.join(screenshots, "monitor-error.png") });
  await api("resume", { id: product.id });
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole("button", { name: "Open dashboard" }).waitFor();
  await popup.setViewportSize({ width: 356, height: 570 });
  await popup.screenshot({ path: path.join(screenshots, "popup-light.png") });
  pass("Built popup renders and handles restricted current tabs");
  await popup.close();
  for (const theme of ["light", "dark", "amoled"]) {
    await api("settings", { settings: { ...prefs, theme } });
    await ui.reload();
    await ui.waitForFunction(
      (theme) => document.documentElement.dataset.theme === theme,
      theme,
    );
    assert.equal(
      await ui.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (theme === "amoled")
      assert.equal(
        await ui.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        ),
        "rgb(0, 0, 0)",
      );
    await ui.screenshot({
      path: path.join(screenshots, `dashboard-${theme}.png`),
    });
    await ui.goto(
      `chrome-extension://${extensionId}/dashboard.html#monitor/${policy.id}`,
    );
    await ui
      .getByText("Potentially relevant policy passages", { exact: true })
      .waitFor();
    assert(
      (await ui.locator("ins").allTextContents()).join("").includes("may"),
    );
    assert(
      (await ui.locator("del").allTextContents()).join("").includes("do not"),
    );
    await ui.screenshot({
      path: path.join(screenshots, `policy-${theme}.png`),
      fullPage: true,
    });
    await ui.goto(`chrome-extension://${extensionId}/dashboard.html`);
  }
  pass(
    "Light, dark and true-black AMOLED render with actual source-text additions and removals",
  );
  await ui.setViewportSize({ width: 390, height: 844 });
  await ui.screenshot({
    path: path.join(screenshots, "dashboard-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  pass("Responsive dashboard fits a 390px viewport");
  await ui.setViewportSize({ width: 1440, height: 960 });
  await ui.goto(`chrome-extension://${extensionId}/dashboard.html#settings`);
  await ui.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await ui.screenshot({ path: path.join(screenshots, "settings-amoled.png") });
  await api("settings", {
    settings: { ...prefs, theme: "dark", accent: "violet" },
  });
  await editDB(product.id, {
    lease: Date.now() - 1000,
    nextCheck: Date.now() - 1000,
  });
  await worker.evaluate(() => chrome.alarms.clear("scheduler"));
  await context.close();
  await launch();
  const persisted = await api("state");
  assert.equal(persisted.settings.theme, "dark");
  assert.equal(persisted.settings.accent, "violet");
  assert(
    persisted.monitors
      .find((m) => m.id === policy.id)
      .baseline.includes(updatedPolicy),
  );
  const alarm = await worker.evaluate(() => chrome.alarms.get("scheduler"));
  assert.equal(alarm.periodInMinutes, 1);
  const recovered = persisted.monitors.find((m) => m.id === product.id);
  assert.equal(recovered.lease, 0);
  assert(recovered.error.includes("interrupted"));
  pass(
    "Browser restart preserves data and appearance, recreates alarm, and recovers interrupted lease",
  );
  await api("read", { id: policy.id });
  assert.equal(
    (await api("state")).monitors.find((m) => m.id === policy.id).unread,
    0,
  );
  await api("delete", { id: product.id });
  assert.equal((await api("history", { id: policy.id })).length, 2);
  pass(
    "Acknowledgment clears unread state and deleting another monitor preserves policy history",
  );
  assert.deepEqual(runtimeErrors, []);
  pass("No application runtime errors during browser scenarios");
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/browser.json",
    JSON.stringify(
      {
        tests: report.length,
        report,
        browser: context.browser().version(),
        fixtureCreateMs: createMs,
        fixtureRequests: requests,
        limitations: [
          "Temporary manifest pre-grants synthetic host access.",
          "Permission-denial branch is simulated.",
          "Native permission dialog and OS notification appearance require supervised checks.",
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    `${report.length} browser scenarios passed. Fixture create: ${createMs}ms.`,
  );
} finally {
  if (context) await context.close();
  await new Promise((resolve) => server.close(resolve));
}
