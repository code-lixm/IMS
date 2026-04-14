function parseLeadingFrontmatter(markdown: string): { frontmatter: string; body: string } | null {
  if (!markdown.startsWith("---\n")) {
    return null;
  }

  const endIndex = markdown.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    return null;
  }

  return {
    frontmatter: markdown.slice(4, endIndex),
    body: markdown.slice(endIndex + 5),
  };
}

function isInterviewStageFrontmatter(frontmatter: string): boolean {
  return [
    "type: interview-stage-document",
    "generated_by:",
    "generated_at:",
    "schema_version:",
    "candidate_name:",
    "source_inputs:",
  ].every((marker) => frontmatter.includes(marker));
}

export function stripDisplayOnlyFrontmatter(markdown: string): string {
  const parsed = parseLeadingFrontmatter(markdown);
  if (!parsed || !isInterviewStageFrontmatter(parsed.frontmatter)) {
    return markdown;
  }

  return parsed.body.trimStart();
}
