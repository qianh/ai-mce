package model

import (
	"crypto/sha256"
	"fmt"
	"regexp"
	"strings"
)

var (
	multiBlankLines = regexp.MustCompile(`\n{3,}`)
	multiSpaces     = regexp.MustCompile(`[^\S\n]+`)
)

func normalizeContent(s string) string {
	s = strings.TrimSpace(s)
	s = multiBlankLines.ReplaceAllString(s, "\n\n")
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(multiSpaces.ReplaceAllString(line, " "))
	}
	return strings.Join(lines, "\n")
}

func ComputeContentHash(messages []ExtractedMessage) string {
	var b strings.Builder
	for _, m := range messages {
		fmt.Fprintf(&b, "%d:%s:%s\n", m.Index, m.Role, normalizeContent(m.Content))
	}
	sum := sha256.Sum256([]byte(b.String()))
	return fmt.Sprintf("%x", sum)
}

func ComputeMessageHash(m ExtractedMessage) string {
	input := fmt.Sprintf("%d:%s:%s", m.Index, m.Role, normalizeContent(m.Content))
	sum := sha256.Sum256([]byte(input))
	return fmt.Sprintf("%x", sum)
}

func ComputeSourceFingerprint(platform string) string {
	return platform + ":desktop"
}
