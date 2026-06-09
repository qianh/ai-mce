package main

import (
    "fmt"
    "github.com/mce/scanner/internal/parser"
)

func main() {
    // Original tests
    cp := parser.NewCodexParser()
    conv, err := cp.Parse("/Users/hong/.codex/sessions/2025/11/27/rollout-2025-11-27T23-57-17-019ac608-7fda-7061-9dac-5ebf03e4fc19.jsonl")
    if err != nil {
        fmt.Println("CODEX(old) ERROR:", err)
    } else {
        fmt.Printf("CODEX(old) OK: %d messages, title=%q\n", len(conv.Content.Messages), conv.Content.Title)
    }

    // Test Codex title derivation with a recent rollout-* file
    conv, err = cp.Parse("/Users/hong/.codex/sessions/2026/06/09/rollout-2026-06-09T14-09-06-019eaaff-b905-7350-9dcd-0a06777ff37a.jsonl")
    if err != nil {
        fmt.Println("CODEX(new) ERROR:", err)
    } else {
        fmt.Printf("CODEX(new) OK: %d messages, title=%q\n", len(conv.Content.Messages), conv.Content.Title)
    }

    gp := parser.NewGrokParser()
    // Test Grok with real session_summary
    conv, err = gp.Parse("/Users/hong/.grok/sessions/%2FUsers%2Fhong%2FDzg%2Fai%2Fship-data-analysis/019eaa3f-f17e-74b0-bb54-928af0593c2a")
    if err != nil {
        fmt.Println("GROK(summary) ERROR:", err)
    } else {
        fmt.Printf("GROK(summary) OK: %d messages, title=%q\n", len(conv.Content.Messages), conv.Content.Title)
    }

    // Test Grok title fallback (empty session_summary)
    conv, err = gp.Parse("/Users/hong/.grok/sessions/%2FUsers%2Fhong%2FDzg%2Fai%2Fship-data-analysis/019eaa7c-46cc-70e1-a707-667eed30739b")
    if err != nil {
        fmt.Println("GROK(no_summary) ERROR:", err)
    } else {
        fmt.Printf("GROK(no_summary) OK: %d messages, title=%q\n", len(conv.Content.Messages), conv.Content.Title)
    }

    op := parser.NewOpenCodeParser()
    conv, err = op.Parse("/Users/hong/.local/share/opencode/opencode.db::ses_44f28617dffeMWyLC7VFPOQM94")
    if err != nil {
        fmt.Println("OPENCODE ERROR:", err)
    } else {
        fmt.Printf("OPENCODE OK: %d messages, title=%q\n", len(conv.Content.Messages), conv.Content.Title)
    }

    // Test Claude Code with a session that has tool_result messages
    ccp := parser.NewClaudeCodeParser()
    conv, err = ccp.Parse("/Users/hong/.claude/projects/-Users-hong-John-ai-ai-mce/be4ee812-2916-4976-9f78-872ce7505337.jsonl")
    if err != nil {
        fmt.Println("CLAUDE(tool_result) ERROR:", err)
    } else {
        fmt.Printf("CLAUDE(tool_result) OK: %d messages, %d warnings, title=%q\n", len(conv.Content.Messages), len(conv.ExtractionQuality.Warnings), conv.Content.Title)
    }
}
