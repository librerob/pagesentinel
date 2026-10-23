# Browser-rendered monitoring investigation

Static, credential-free HTML is the only implemented monitoring mode. No disabled demo switch or simulated rendered result is shipped.

Chrome's [scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting) can read a rendered page using activeTab or host access. An ordinary tab, however, executes website scripts, loads subresources, may send profile cookies, contacts third parties and can redirect before an extension inspects its final URL. That is a materially different privacy model from `fetch` with credential omission and redirect rejection. A hidden tab or an offscreen document would not make those risks disappear.

A future opt-in mode would need explicit disclosure and separate consent; bounded tab creation and teardown; top-frame/document identity checks; navigation/error/timeout handling; tests for SPA updates, redirects, cookies, permission revocation, browser restarts and worker interruption; and evidence that no password/session tokens are stored. Chrome host grants alone do not constrain every request a normally rendered website makes. Browser DNS resolution still cannot be pinned by this extension.

It would also need to define whether it uses the user's existing authenticated profile, because profile cookies are not equivalent to public monitoring. It must not bypass CAPTCHA/MFA or silently weaken the static pipeline's network guarantees. The current upgrade preserves those guarantees and leaves rendered monitoring unimplemented. A public site's failed static extraction does not by itself prove rendered mode would work.

Prioritize supervised static reliability and selector repair first. Prototype rendered lifecycle/privacy behavior in an isolated test branch before offering any compatibility claim.
