(() => {
  const marker = "pagesentinel-picker";
  if (document.getElementById(marker)) return;
  const host = document.createElement("div");
  host.id = marker;
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent =
    ":host{all:initial}*{box-sizing:border-box}.bar{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#123c35;color:#fff;padding:16px 20px;border-radius:16px;font:14px/1.5 system-ui;width:min(580px,94vw);box-shadow:0 4px 30px #0004}p{margin:0 0 10px;max-height:90px;overflow:auto;white-space:pre-wrap}button{font:inherit;border:1px solid #a1d3c8;border-radius:20px;padding:7px 15px;background:transparent;color:inherit;margin-right:8px;cursor:pointer}button:focus-visible{outline:3px solid #fff}button.primary{background:#a1d3c8;color:#00201b}.box{position:fixed;pointer-events:none;border:2px solid #006b5e;background:#008b7d15;z-index:2147483646}";
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "PageSentinel element selector");
  const preview = document.createElement("p");
  preview.textContent =
    "Select an element · Move to highlight, click to inspect. Escape cancels.";
  const box = document.createElement("div");
  box.className = "box";
  const parent = document.createElement("button");
  parent.textContent = "Parent";
  parent.disabled = true;
  const use = document.createElement("button");
  use.textContent = "Use selection";
  use.className = "primary";
  use.disabled = true;
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  bar.append(preview, parent, use, cancel);
  shadow.append(style, box, bar);
  document.documentElement.append(host);
  let hovered: Element | null = null,
    selected: Element | null = null;
  function draw(el: Element) {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  }
  function move(e: MouseEvent) {
    if (selected || e.composedPath().includes(host)) return;
    if (e.target instanceof Element) {
      hovered = e.target;
      draw(hovered);
    }
  }
  function choose(el: Element) {
    selected = el;
    draw(el);
    preview.textContent =
      (el.textContent ?? "").trim().slice(0, 1500) ||
      "This element has no text. Choose another element.";
    parent.disabled = !el.parentElement;
    use.disabled = !el.textContent?.trim();
    use.focus();
  }
  function click(e: MouseEvent) {
    if (e.composedPath().includes(host)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (hovered) choose(hovered);
  }
  function cleanup() {
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
    window.removeEventListener("scroll", scroll, true);
    host.remove();
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cleanup();
    }
  }
  function scroll() {
    if (selected || hovered) draw((selected ?? hovered)!);
  }
  function selector(el: Element): string {
    const unique = (s: string) => {
      try {
        return document.querySelectorAll(s).length === 1;
      } catch {
        return false;
      }
    };
    if (el.id && unique(`#${CSS.escape(el.id)}`))
      return `#${CSS.escape(el.id)}`;
    for (const attr of ["data-testid", "itemprop", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v && v.length < 100) {
        const s = `${el.localName}[${attr}=${JSON.stringify(v)}]`;
        if (unique(s)) return s;
      }
    }
    const classes = [...el.classList]
      .filter((c) => !/\d{4}|active|hover|focus|selected/i.test(c))
      .slice(0, 3);
    const simple =
      el.localName + classes.map((c) => `.${CSS.escape(c)}`).join("");
    if (unique(simple)) return simple;
    const path: string[] = [];
    let current: Element | null = el;
    while (current && path.length < 10) {
      if (current.id) {
        path.unshift(`#${CSS.escape(current.id)}`);
        break;
      }
      const siblings: Element[] = current.parentElement
        ? [...current.parentElement.children].filter(
            (x) => x.localName === current!.localName,
          )
        : [];
      path.unshift(
        current.localName +
          (siblings.length > 1
            ? `:nth-of-type(${siblings.indexOf(current) + 1})`
            : ""),
      );
      if (unique(path.join(" > "))) break;
      current = current.parentElement;
    }
    const result = path.join(" > ");
    if (!unique(result))
      throw new Error("Choose a smaller or more distinctive element.");
    return result;
  }
  parent.onclick = () => {
    if (selected?.parentElement) choose(selected.parentElement);
  };
  cancel.onclick = cleanup;
  use.onclick = () => {
    if (!selected) return;
    try {
      const value = selector(selected);
      if (value.length > 1000)
        throw new Error("Choose a more distinctive element.");
      void chrome.runtime.sendMessage({
        type: "selected",
        selector: value,
        preview: selected.textContent?.trim().slice(0, 2000) ?? "",
      });
      cleanup();
    } catch (e) {
      preview.textContent =
        e instanceof Error ? e.message : "Selection failed.";
    }
  };
  document.addEventListener("mousemove", move, true);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", key, true);
  window.addEventListener("scroll", scroll, true);
})();
