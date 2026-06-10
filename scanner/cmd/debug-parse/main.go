package main

import (
	"fmt"
	"os"
	"github.com/mce/scanner/internal/parser"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Println("usage: debug-parse <platform> <path>")
		return
	}
	platform, path := os.Args[1], os.Args[2]
	var p parser.Parser
	switch platform {
	case "claude":
		p = parser.NewClaudeCodeParser()
	case "codex":
		p = parser.NewCodexParser()
	case "grok":
		p = parser.NewGrokParser()
	case "opencode":
		p = parser.NewOpenCodeParser()
	default:
		fmt.Printf("unknown platform: %s\n", platform)
		return
	}
	conv, err := p.Parse(path)
	if err != nil {
		fmt.Printf("error: %v\n", err)
		return
	}
	fmt.Printf("total messages: %d\n", len(conv.Content.Messages))
	for i, m := range conv.Content.Messages {
		content := []rune(m.Content)
		if len(content) > 80 {
			content = append(content[:80], []rune("...")...)
		}
		fmt.Printf("  [%d] role=%-9s content=%q\n", i, m.Role, string(content))
	}
}
