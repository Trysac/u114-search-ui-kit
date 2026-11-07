import { describe, expect, it } from "vitest";
import {
  applyFacets,
  escapeHtml,
  facetCounts,
  highlight,
  isSafeUrl,
  renderFacets,
  renderResults,
  SearchKitError,
  type SearchState,
  searchReducer,
} from "../src/index.js";

describe("highlight acceptance items and core functionality", () => {
  it("highlight('Café crème', 'cafe') returns [{ text: 'Café', match: true }, { text: ' crème', match: false }] with segments covering the original string exactly", () => {
    const result = highlight("Café crème", "cafe");
    expect(result).toEqual([
      { text: "Café", match: true },
      { text: " crème", match: false },
    ]);
    expect(result.map((s) => s.text).join("")).toBe("Café crème");
  });

  it("highlight('aaa', 'aa') returns [{ text: 'aa', match: true }, { text: 'a', match: false }], highlight('aaa', '') returns [{ text: 'aaa', match: false }] and highlight('New York city', 'york new') marks both 'New' and 'York'", () => {
    expect(highlight("aaa", "aa")).toEqual([
      { text: "aa", match: true },
      { text: "a", match: false },
    ]);
    expect(highlight("aaa", "")).toEqual([{ text: "aaa", match: false }]);
    expect(highlight("New York city", "york new")).toEqual([
      { text: "New", match: true },
      { text: " ", match: false },
      { text: "York", match: true },
      { text: " city", match: false },
    ]);
  });

  it("highlight on a text of 100_001 UTF-16 units throws SearchKitError with code 'TOO_LARGE', more than maxMarks 50 matches leaves the rest unmarked, and a field with 1_001 distinct facet values returns 1_000 entries", () => {
    const largeText = "a".repeat(100_001);
    expect(() => highlight(largeText, "a")).toThrowError(SearchKitError);
    try {
      highlight(largeText, "a");
    } catch (e) {
      expect(e).toBeInstanceOf(SearchKitError);
      expect((e as SearchKitError).code).toBe("TOO_LARGE");
    }

    const fiftyTwoAs = "a ".repeat(52).trim();
    const markedFiftyTwo = highlight(fiftyTwoAs, "a", { maxMarks: 50 });
    const matchCount = markedFiftyTwo.filter((s) => s.match).length;
    expect(matchCount).toBe(50);
    expect(markedFiftyTwo.map((s) => s.text).join("")).toBe(fiftyTwoAs);

    const itemsWith1001 = Array.from({ length: 1_001 }, (_, i) => ({
      id: String(i),
      title: `Item ${i}`,
      category: `cat_${String(i).padStart(4, "0")}`,
    }));
    const counts = facetCounts(itemsWith1001, ["category"]);
    expect(counts.category).toBeDefined();
    expect(counts.category?.length).toBe(1_000);
  });

  it("handles empty text, spaces query, emoji surrogate pairs, end-of-string matches", () => {
    expect(highlight("", "cafe")).toEqual([]);
    expect(highlight("", "")).toEqual([]);
    expect(highlight("test text", "   ")).toEqual([{ text: "test text", match: false }]);

    const emojiText = "Hello 😀 world";
    const emojiMarked = highlight(emojiText, "world");
    expect(emojiMarked).toEqual([
      { text: "Hello 😀 ", match: false },
      { text: "world", match: true },
    ]);
    expect(emojiMarked.map((s) => s.text).join("")).toBe(emojiText);

    const emojiMatch = highlight(emojiText, "😀");
    expect(emojiMatch).toEqual([
      { text: "Hello ", match: false },
      { text: "😀", match: true },
      { text: " world", match: false },
    ]);
    expect(emojiMatch.map((s) => s.text).join("")).toBe(emojiText);

    const endMatch = highlight("prefix target", "target");
    expect(endMatch).toEqual([
      { text: "prefix ", match: false },
      { text: "target", match: true },
    ]);

    const decomposedText = "e\u0301";
    const decomposedMatch = highlight(decomposedText, "e");
    expect(decomposedMatch.map((s) => s.text).join("")).toBe(decomposedText);

    const leadingMark = "\u0301test";
    expect(highlight(leadingMark, "test")).toEqual([
      { text: "\u0301", match: false },
      { text: "test", match: true },
    ]);

    expect(highlight("abc", "abc", { maxMarks: 0 })).toEqual([{ text: "abc", match: false }]);
  });

  it("validates highlight option inputs and query limit", () => {
    expect(() => highlight("text", "q", { maxChars: -1 })).toThrowError(SearchKitError);
    expect(() => highlight("text", "q", { maxMarks: -1 })).toThrowError(SearchKitError);
    const longQuery = "a".repeat(10_001);
    expect(() => highlight("text", longQuery)).toThrowError(SearchKitError);
  });
});

describe("renderResults and escaping acceptance", () => {
  it("renderResults with a title '<script>x</script>' outputs '&lt;script&gt;x&lt;/script&gt;' and never '<script>', and attribute values escape '\"' as '&quot;'", () => {
    const rendered = renderResults({ query: "" }, [
      { id: "1", title: "<script>x</script>", url: '/path?a="b"' },
    ]);
    expect(rendered).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(rendered).not.toContain("<script>");
    expect(rendered).toContain("href=" + '"/path?a=&quot;b&quot;"');
  });

  it("renderResults({ query: 'cafe' }, [{ id: '1', title: 'Café', url: 'https://x.test/1' }]) === '<div role=\"status\" aria-live=\"polite\">1 result</div>\\n<ul class=\"sk-results\">\\n<li><a href=\"https://x.test/1\"><mark>Café</mark></a></li>\\n</ul>', with '0 results' and '2 results' for other counts", () => {
    const golden =
      '<div role="status" aria-live="polite">1 result</div>\n<ul class="sk-results">\n<li><a href="https://x.test/1"><mark>Café</mark></a></li>\n</ul>';
    expect(
      renderResults({ query: "cafe" }, [{ id: "1", title: "Café", url: "https://x.test/1" }]),
    ).toBe(golden);

    const zeroRendered = renderResults({ query: "cafe" }, []);
    expect(zeroRendered).toBe(
      '<div role="status" aria-live="polite">0 results</div>\n<ul class="sk-results">\n</ul>',
    );

    const twoRendered = renderResults({ query: "cafe" }, [
      { id: "1", title: "Café", url: "https://x.test/1" },
      { id: "2", title: "Café 2", url: "https://x.test/2" },
    ]);
    expect(twoRendered).toContain("2 results");
    expect(twoRendered).toBe(
      '<div role="status" aria-live="polite">2 results</div>\n<ul class="sk-results">\n<li><a href="https://x.test/1"><mark>Café</mark></a></li>\n<li><a href="https://x.test/2"><mark>Café</mark> 2</a></li>\n</ul>',
    );
  });

  it("renders snippets when present and handles items without url", () => {
    const renderedWithSnippet = renderResults({ query: "cup" }, [
      { id: "1", title: "Coffee", url: "https://x.test/1", snippet: "A hot cup of coffee" },
    ]);
    expect(renderedWithSnippet).toContain(
      '<li><a href="https://x.test/1">Coffee</a><p>A hot <mark>cup</mark> of coffee</p></li>',
    );

    const renderedNoUrl = renderResults({ query: "hot" }, [
      { id: "2", title: "Tea", snippet: "Very hot" },
    ]);
    expect(renderedNoUrl).toContain("<li>Tea<p>Very <mark>hot</mark></p></li>");
  });

  it("validates input bounds on renderResults", () => {
    const hugeItems = Array.from({ length: 100_001 }, (_, i) => ({
      id: String(i),
      title: "t",
    }));
    expect(() => renderResults({ query: "" }, hugeItems)).toThrowError(SearchKitError);
    expect(() => renderResults({ query: "a".repeat(10_001) }, [])).toThrowError(SearchKitError);
  });
});

describe("URL safety acceptance", () => {
  it("Items with url 'javascript:alert(1)', ' JAVASCRIPT:x' or 'data:text/html,x' render their title without an <a> element, while 'https:', 'http:', 'mailto:' and paths starting with '/' (but not '//') keep the link", () => {
    const unsafeItems = [
      { id: "1", title: "Bad 1", url: "javascript:alert(1)" },
      { id: "2", title: "Bad 2", url: " JAVASCRIPT:x" },
      { id: "3", title: "Bad 3", url: "data:text/html,x" },
    ];
    const unsafeHtml = renderResults({ query: "" }, unsafeItems);
    expect(unsafeHtml).not.toContain("<a ");
    expect(unsafeHtml).toContain("<li>Bad 1</li>");
    expect(unsafeHtml).toContain("<li>Bad 2</li>");
    expect(unsafeHtml).toContain("<li>Bad 3</li>");

    const safeItems = [
      { id: "4", title: "Safe 1", url: "https:" },
      { id: "5", title: "Safe 2", url: "http:" },
      { id: "6", title: "Safe 3", url: "mailto:" },
      { id: "7", title: "Safe 4", url: "/local/path" },
    ];
    const safeHtml = renderResults({ query: "" }, safeItems);
    expect(safeHtml).toContain('<a href="https:">Safe 1</a>');
    expect(safeHtml).toContain('<a href="http:">Safe 2</a>');
    expect(safeHtml).toContain('<a href="mailto:">Safe 3</a>');
    expect(safeHtml).toContain('<a href="/local/path">Safe 4</a>');

    const doubleSlash = renderResults({ query: "" }, [
      { id: "8", title: "Double Slash", url: "//evil.com" },
    ]);
    expect(doubleSlash).toContain("<li>Double Slash</li>");
    expect(doubleSlash).not.toContain("<a ");
  });

  it("isSafeUrl handles edge cases including tabs, newlines, and C0 controls", () => {
    expect(isSafeUrl("")).toBe(false);
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl("java\tscript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\nscript:alert(1)")).toBe(false);
    expect(isSafeUrl("java\rscript:alert(1)")).toBe(false);
    expect(isSafeUrl("\u0000javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("  ")).toBe(false);
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("https://valid.test/path")).toBe(true);
    expect(isSafeUrl("/safe-path")).toBe(true);
    expect(isSafeUrl("//protocol-relative")).toBe(false);
  });
});

describe("facets and reducer acceptance", () => {
  it("facetCounts(items, ['lang']) returns { lang: [{ value: 'en', count: 2 }, { value: 'es', count: 1 }] } sorted by count descending then value ascending, applyFacets(items, { lang: ['en', 'es'], type: ['doc'] }) is OR within a field and AND across fields, and searchReducer applied with toggleFacet twice removes the value and resets page to 1", () => {
    const items = [
      { id: "1", title: "Doc 1", lang: "en", type: "doc" },
      { id: "2", title: "Doc 2", lang: ["en", "es"], type: "doc" },
      { id: "3", title: "Doc 3", lang: "es", type: "article" },
    ];

    const counts = facetCounts(items, ["lang"]);
    expect(counts).toEqual({
      lang: [
        { value: "en", count: 2 },
        { value: "es", count: 2 },
      ],
    });

    const acceptanceItems = [
      { id: "1", title: "Doc 1", lang: "en" },
      { id: "2", title: "Doc 2", lang: "en" },
      { id: "3", title: "Doc 3", lang: "es" },
    ];
    expect(facetCounts(acceptanceItems, ["lang"])).toEqual({
      lang: [
        { value: "en", count: 2 },
        { value: "es", count: 1 },
      ],
    });

    const filtered = applyFacets(items, { lang: ["en", "es"], type: ["doc"] });
    expect(filtered.map((d) => d.id)).toEqual(["1", "2"]);

    const initial: SearchState = { query: "", facets: {}, page: 5 };
    const step1 = searchReducer(initial, { type: "toggleFacet", field: "lang", value: "en" });
    expect(step1).toEqual({ query: "", facets: { lang: ["en"] }, page: 1 });
    const step2 = searchReducer(step1, { type: "toggleFacet", field: "lang", value: "en" });
    expect(step2.facets.lang).toBeUndefined();
    expect(step2.page).toBe(1);
  });

  it('renderFacets({ lang: [{ value: \'en\', count: 2 }] }, { lang: [\'en\'] }) === \'<fieldset class="sk-facet"><legend>lang</legend>\\n<label><input type="checkbox" name="lang" value="en" checked> en (2)</label>\\n</fieldset>\'', () => {
    const golden =
      '<fieldset class="sk-facet"><legend>lang</legend>\n<label><input type="checkbox" name="lang" value="en" checked> en (2)</label>\n</fieldset>';
    expect(renderFacets({ lang: [{ value: "en", count: 2 }] }, { lang: ["en"] })).toBe(golden);
  });

  it("covers facet counting duplicate values in one item and missing fields", () => {
    const items = [
      { id: "1", title: "T1", tag: ["dup", "dup", "single"] },
      { id: "2", title: "T2" },
      { id: "3", title: "T3", tag: 123 },
    ];
    const counts = facetCounts(items, ["tag", "missing"]);
    expect(counts.tag).toEqual([
      { value: "dup", count: 1 },
      { value: "single", count: 1 },
    ]);
    expect(counts.missing).toEqual([]);
  });

  it("applyFacets ignores empty facet array and handles missing or non-matching fields", () => {
    const items = [
      { id: "1", title: "T1", tag: "a" },
      { id: "2", title: "T2", tag: ["b"] },
      { id: "3", title: "T3" },
      { id: "4", title: "T4", tag: 999 },
    ];
    expect(applyFacets(items, { tag: [] })).toEqual(items);
    expect(applyFacets(items, { tag: ["a"] })).toEqual([items[0]]);
    expect(applyFacets(items, { missing: ["x"] })).toEqual([]);
  });

  it("validates facet bounds and options", () => {
    expect(() => facetCounts([], ["tag"], { maxValues: -1 })).toThrowError(SearchKitError);
    const hugeItems = Array.from({ length: 100_001 }, (_, i) => ({ id: String(i), title: "t" }));
    expect(() => facetCounts(hugeItems, ["t"])).toThrowError(SearchKitError);
    expect(() => applyFacets(hugeItems, {})).toThrowError(SearchKitError);
    const hugeFields = Array.from({ length: 1_001 }, (_, i) => `f${i}`);
    expect(() => facetCounts([], hugeFields)).toThrowError(SearchKitError);
  });

  it("tests searchReducer actions and invariants", () => {
    const base: SearchState = { query: "old", facets: { type: ["book"] }, page: 3 };

    const qState = searchReducer(base, { type: "setQuery", query: "new" });
    expect(qState).toEqual({ query: "new", facets: { type: ["book"] }, page: 1 });
    expect(base.query).toBe("old");

    const pState = searchReducer(base, { type: "setPage", page: 10 });
    expect(pState).toEqual({ query: "old", facets: { type: ["book"] }, page: 10 });

    expect(() => searchReducer(base, { type: "setPage", page: 0 })).toThrowError(SearchKitError);
    expect(() => searchReducer(base, { type: "setPage", page: -1 })).toThrowError(SearchKitError);
    expect(() => searchReducer(base, { type: "setPage", page: 1.5 })).toThrowError(SearchKitError);
    expect(() => searchReducer(base, { type: "setPage", page: Number.NaN })).toThrowError(
      SearchKitError,
    );

    const resetState = searchReducer(base, { type: "reset" });
    expect(resetState).toEqual({ query: "", facets: {}, page: 1 });

    const toggleAdd = searchReducer(base, { type: "toggleFacet", field: "type", value: "movie" });
    expect(toggleAdd.facets.type).toEqual(["book", "movie"]);

    expect(() =>
      searchReducer(base, { type: "setQuery", query: 123 as unknown as string }),
    ).toThrowError(SearchKitError);
    expect(() => searchReducer(base, { type: "setQuery", query: "a".repeat(10_001) })).toThrowError(
      SearchKitError,
    );
    expect(() =>
      searchReducer(base, { type: "toggleFacet", field: 1 as unknown as string, value: "v" }),
    ).toThrowError(SearchKitError);
    expect(() => searchReducer(base, null as unknown as { type: "reset" })).toThrowError(
      SearchKitError,
    );
    expect(() =>
      searchReducer(base, { type: "unknown" } as unknown as { type: "reset" }),
    ).toThrowError(SearchKitError);
  });

  it("renders facets with unchecked checkboxes and special characters", () => {
    const rendered = renderFacets(
      {
        "<tag>": [{ value: 'val "1" & 2', count: 3 }],
      },
      {},
    );
    expect(rendered).toContain("<legend>&lt;tag&gt;</legend>");
    expect(rendered).toContain('value="val &quot;1&quot; &amp; 2"');
    expect(rendered).not.toContain("checked");
    expect(rendered).toContain("val &quot;1&quot; &amp; 2 (3)");

    const hugeCounts = Object.fromEntries(Array.from({ length: 1_001 }, (_, i) => [`f${i}`, []]));
    expect(() => renderFacets(hugeCounts, {})).toThrowError(SearchKitError);
  });
});

describe("escapeHtml helper", () => {
  it("escapes ampersands, tags, and quotes", () => {
    expect(escapeHtml("Tom & 'Jerry' <\"cat\">")).toBe(
      "Tom &amp; &#39;Jerry&#39; &lt;&quot;cat&quot;&gt;",
    );
  });
});
