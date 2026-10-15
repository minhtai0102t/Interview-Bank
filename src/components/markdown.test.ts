import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SafeMarkdown } from "./markdown";

describe("SafeMarkdown", () => {
  it("renders basic markdown and raw HTML as inert text", () => {
    const html = renderToStaticMarkup(
      SafeMarkdown({ markdown: "# Title\n\nHello <script>alert(1)</script> **world**" }),
    );

    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>world</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("drops unsafe links and remote images", () => {
    const html = renderToStaticMarkup(
      SafeMarkdown({
        markdown: [
          "[bad](javascript:alert(1))",
          "[good](https://example.com/docs)",
          "![remote](https://cdn.example.com/image.png)",
          "![local](/images/safe.png)",
        ].join("\n\n"),
      }),
    );

    expect(html).toContain("<a href=\"https://example.com/docs\"");
    expect(html).toContain("rel=\"nofollow ugc noreferrer\"");
    expect(html).not.toContain("javascript:alert(1)");
    expect(html).not.toContain("https://cdn.example.com/image.png");
    expect(html).not.toContain("/images/safe.png");
    expect(html).toContain("remote");
    expect(html).toContain("local");
  });

  it("wraps content in the shared markdown typography container", () => {
    const html = renderToStaticMarkup(
      SafeMarkdown({ markdown: "# Title\n\n- one\n- two\n\n[Docs](/docs)", className: "space-y-3" }),
    );

    expect(html).toContain('class="markdown-content space-y-3"');
  });
});