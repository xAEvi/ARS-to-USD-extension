const EXCLUDED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'OPTION',
]);

/**
 * Collects the text nodes eligible for price detection under `root`,
 * skipping the exclusions from DISENO.md section 3.5: script/style/template
 * and form control elements, editable content, and text already inside a
 * previous annotation (`[data-aru-wrap]`), which is what keeps a second scan
 * idempotent.
 *
 * @param {Document | Element} root The subtree to walk.
 * @returns {Array<Text>} The eligible text nodes, in document order.
 */
export function collectTextNodes(root: Document | Element): Array<Text> {
  const ownerDocument = root.ownerDocument ?? (root as Document);

  const walker = ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;

      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;

      if (EXCLUDED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;

      if (parent.closest('[contenteditable], [data-aru-wrap]'))
        return NodeFilter.FILTER_REJECT;

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Array<Text> = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(node as Text);

  return nodes;
}
